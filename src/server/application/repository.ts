import { createClient } from '@supabase/supabase-js';
import type { ApplicationRepository, PersistedApplication } from './types';

type SupabaseError = { message?: string } | null;
type SupabaseResult<T> = { data: T; error: SupabaseError };

type SupabaseApplicationClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<SupabaseResult<unknown>>;
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        file: File,
        options: { cacheControl: string; contentType: string; upsert: boolean },
      ): PromiseLike<SupabaseResult<{ path: string } | null>>;
      remove(paths: string[]): PromiseLike<SupabaseResult<unknown>>;
    };
  };
};

type ClientFactory = (
  url: string,
  serviceRoleKey: string,
  options: {
    auth: {
      autoRefreshToken: false;
      detectSessionInUrl: false;
      persistSession: false;
    };
  },
) => SupabaseApplicationClient;

export type SupabaseApplicationRepositoryConfig = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
};

type RepositoryErrorCode =
  | 'REPOSITORY_CONFIGURATION_INVALID'
  | 'QUOTA_RPC_FAILED'
  | 'FILE_UPLOAD_FAILED'
  | 'GRAPH_INSERT_FAILED'
  | 'FILE_DELETE_FAILED';

export class ApplicationRepositoryError extends Error {
  readonly code: RepositoryErrorCode;

  constructor(code: RepositoryErrorCode) {
    super(code);
    this.name = 'ApplicationRepositoryError';
    this.code = code;
  }
}

function graphPayload(input: PersistedApplication) {
  return {
    application: {
      id: input.application.id,
      receipt_code: input.application.receiptCode,
      name: input.application.name,
      phone: input.application.phone,
      email: input.application.email,
      level: input.application.level,
      available_from: input.application.availableFrom,
      career_months: input.application.careerMonths,
      specialties: input.application.specialties,
      certifications: input.application.certifications,
      privacy_consent_version: input.application.privacyConsentVersion,
      privacy_consent_at: input.application.privacyConsentAt,
      retention_until: input.application.retentionUntil,
    },
    answers: input.answers.map((answer) => ({
      answer_key: answer.answerKey,
      answer_text: answer.answerText,
      answer_json: answer.answerJson,
      display_order: answer.displayOrder,
    })),
    files: input.files.map((file) => ({
      storage_path: file.storagePath,
      original_filename: file.originalFilename,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
      file_kind: file.fileKind,
    })),
  };
}

export function createSupabaseApplicationRepository(
  config: SupabaseApplicationRepositoryConfig,
  factory: ClientFactory = createClient as unknown as ClientFactory,
): ApplicationRepository {
  if (!config.supabaseUrl.trim() || !config.supabaseServiceRoleKey.trim()) {
    throw new ApplicationRepositoryError('REPOSITORY_CONFIGURATION_INVALID');
  }

  const client = factory(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  return {
    async consumeSubmissionQuota(actorHash, maximum, windowSeconds) {
      const { data, error } = await client.rpc('consume_submission_quota', {
        p_actor_hash: actorHash,
        p_maximum: maximum,
        p_window_seconds: windowSeconds,
      });
      if (error || typeof data !== 'boolean') {
        throw new ApplicationRepositoryError('QUOTA_RPC_FAILED');
      }
      return data;
    },

    async uploadFile(path, file) {
      const { data, error } = await client.storage.from('application-files').upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      });
      if (error || !data || data.path !== path) {
        throw new ApplicationRepositoryError('FILE_UPLOAD_FAILED');
      }
      return path;
    },

    async insertApplicationGraph(input) {
      const { error } = await client.rpc('insert_application_graph', {
        p_graph: graphPayload(input),
      });
      if (error) throw new ApplicationRepositoryError('GRAPH_INSERT_FAILED');
    },

    async deleteFile(path) {
      const { error } = await client.storage.from('application-files').remove([path]);
      if (error) throw new ApplicationRepositoryError('FILE_DELETE_FAILED');
    },
  };
}
