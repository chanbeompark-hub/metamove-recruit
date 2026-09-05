import { createClient } from '@supabase/supabase-js';
import type { ApplicationReconciliationRepository, ReconciliationJob } from './reconciliation';
import type { ApplicationRepository, PersistedApplication } from './types';

type SupabaseError = { code?: string; details?: string; hint?: string; message?: string } | null;
type SupabaseResult<T> = { data: T; error: SupabaseError };
export type SupabaseApplicationClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<SupabaseResult<unknown>>;
  storage: { from(bucket: string): {
    upload(path: string, file: File, options: { cacheControl: string; contentType: string; upsert: boolean }): PromiseLike<SupabaseResult<{ path: string } | null>>;
    remove(paths: string[]): PromiseLike<SupabaseResult<unknown>>;
  } };
};
export type ClientFactory = (url: string, serviceRoleKey: string, options: { auth: { autoRefreshToken: false; detectSessionInUrl: false; persistSession: false } }) => SupabaseApplicationClient;
export type SupabaseApplicationRepositoryConfig = { supabaseUrl: string; supabaseServiceRoleKey: string };
export type RepositoryErrorCode = 'REPOSITORY_CONFIGURATION_INVALID' | 'QUOTA_RPC_FAILED' | 'FILE_UPLOAD_FAILED' | 'GRAPH_REJECTED' | 'GRAPH_AMBIGUOUS' | 'RECEIPT_COLLISION' | 'LOOKUP_UNAVAILABLE' | 'FILE_DELETE_FAILED' | 'RECONCILIATION_ENQUEUE_FAILED' | 'RECONCILIATION_CLAIM_FAILED' | 'RECONCILIATION_COMPLETE_FAILED' | 'RECONCILIATION_RETRY_FAILED' | 'RECONCILIATION_REFERENCE_CHECK_FAILED';
export class ApplicationRepositoryError extends Error {
  readonly code: RepositoryErrorCode;
  constructor(code: RepositoryErrorCode) { super(code); this.name = 'ApplicationRepositoryError'; this.code = code; }
}

function graphPayload(input: PersistedApplication) {
  return {
    application: {
      id: input.application.id, idempotency_key: input.application.idempotencyKey, receipt_code: input.application.receiptCode,
      name: input.application.name, phone: input.application.phone, email: input.application.email, level: input.application.level,
      available_from: input.application.availableFrom, career_months: input.application.careerMonths,
      specialties: input.application.specialties, certifications: input.application.certifications,
      privacy_consent_version: input.application.privacyConsentVersion, privacy_consent_at: input.application.privacyConsentAt, retention_until: input.application.retentionUntil,
    },
    answers: input.answers.map((answer) => ({ answer_key: answer.answerKey, answer_text: answer.answerText, answer_json: answer.answerJson, display_order: answer.displayOrder })),
    files: input.files.map((file) => ({ storage_path: file.storagePath, original_filename: file.originalFilename, mime_type: file.mimeType, size_bytes: file.sizeBytes, file_kind: file.fileKind, security_status: file.securityStatus })),
  };
}

function graphRow(data: unknown) {
  if (!Array.isArray(data) || data.length !== 1) return null;
  const [value] = data;
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.receipt_code !== 'string' || typeof row.inserted !== 'boolean') return null;
  return { status: row.inserted ? 'inserted' as const : 'replayed' as const, receiptCode: row.receipt_code };
}

function idempotencyLookupRow(data: unknown) {
  if (!Array.isArray(data)) return undefined;
  if (data.length === 0) return null;
  if (data.length !== 1) return undefined;
  const [value] = data;
  if (typeof value !== 'object' || value === null) return undefined;
  const row = value as Record<string, unknown>;
  if (
    typeof row.application_id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.application_id)
    || typeof row.receipt_code !== 'string'
  ) {
    return undefined;
  }
  return { applicationId: row.application_id, receiptCode: row.receipt_code };
}

function reconciliationJobs(data: unknown): ReconciliationJob[] | null {
  if (!Array.isArray(data)) return null;
  const jobs: ReconciliationJob[] = [];
  for (const value of data) {
    if (typeof value !== 'object' || value === null) return null;
    const row = value as Record<string, unknown>;
    if (
      typeof row.id !== 'string'
      || typeof row.application_id !== 'string'
      || typeof row.idempotency_key !== 'string'
      || !Array.isArray(row.storage_paths)
      || !row.storage_paths.every((path) => typeof path === 'string')
      || (row.reason !== 'cleanup_failed' && row.reason !== 'graph_status_unknown')
      || typeof row.attempt_count !== 'number'
      || !Number.isSafeInteger(row.attempt_count)
      || row.attempt_count < 1
      || typeof row.created_at !== 'string'
      || typeof row.lock_token !== 'string'
    ) return null;
    jobs.push({
      id: row.id,
      applicationId: row.application_id,
      idempotencyKey: row.idempotency_key,
      paths: row.storage_paths,
      reason: row.reason,
      attemptCount: row.attempt_count,
      createdAt: row.created_at,
      lockToken: row.lock_token,
    });
  }
  return jobs;
}

export function createSupabaseApplicationRepository(config: SupabaseApplicationRepositoryConfig, factory: ClientFactory = createClient as unknown as ClientFactory): ApplicationRepository & ApplicationReconciliationRepository {
  if (!config.supabaseUrl.trim() || !config.supabaseServiceRoleKey.trim()) throw new ApplicationRepositoryError('REPOSITORY_CONFIGURATION_INVALID');
  const client = factory(config.supabaseUrl, config.supabaseServiceRoleKey, { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } });
  return {
    async consumeSubmissionQuota(actorHash, maximum, windowSeconds) {
      let result: SupabaseResult<unknown>;
      try { result = await client.rpc('consume_submission_quota', { p_actor_hash: actorHash, p_maximum: maximum, p_window_seconds: windowSeconds }); } catch { throw new ApplicationRepositoryError('QUOTA_RPC_FAILED'); }
      if (result.error || typeof result.data !== 'boolean') throw new ApplicationRepositoryError('QUOTA_RPC_FAILED');
      return result.data;
    },
    async uploadFile(path, file, canonicalMimeType) {
      let result: SupabaseResult<{ path: string } | null>;
      try { result = await client.storage.from('application-files').upload(path, file, { cacheControl: '3600', contentType: canonicalMimeType, upsert: false }); } catch { throw new ApplicationRepositoryError('FILE_UPLOAD_FAILED'); }
      if (result.error || !result.data || result.data.path !== path) throw new ApplicationRepositoryError('FILE_UPLOAD_FAILED');
      return path;
    },
    async findApplicationByIdempotencyKey(idempotencyKey) {
      let result: SupabaseResult<unknown>;
      try { result = await client.rpc('find_application_by_idempotency', { p_idempotency_key: idempotencyKey }); } catch { throw new ApplicationRepositoryError('LOOKUP_UNAVAILABLE'); }
      const row = idempotencyLookupRow(result.data);
      if (result.error || row === undefined) throw new ApplicationRepositoryError('LOOKUP_UNAVAILABLE');
      return row;
    },
    async insertApplicationGraph(input) {
      let result: SupabaseResult<unknown>;
      try { result = await client.rpc('insert_application_graph', { p_graph: graphPayload(input) }); } catch { throw new ApplicationRepositoryError('GRAPH_AMBIGUOUS'); }
      if (result.error) {
        const detail = `${result.error.message ?? ''} ${result.error.details ?? ''} ${result.error.hint ?? ''}`;
        if (result.error.code === '23505' && /applications_receipt_code_key/.test(detail)) throw new ApplicationRepositoryError('RECEIPT_COLLISION');
        throw new ApplicationRepositoryError('GRAPH_REJECTED');
      }
      const row = graphRow(result.data);
      if (!row) throw new ApplicationRepositoryError('GRAPH_AMBIGUOUS');
      return row;
    },
    async deleteFile(path) {
      try {
        const { error } = await client.storage.from('application-files').remove([path]);
        if (error) throw new Error('remove');
      } catch { throw new ApplicationRepositoryError('FILE_DELETE_FAILED'); }
    },
    async enqueueFileReconciliation(input) {
      try {
        const { error } = await client.rpc('enqueue_application_file_reconciliation', {
          p_application_id: input.applicationId, p_idempotency_key: input.idempotencyKey, p_paths: input.paths, p_reason: input.reason,
        });
        if (error) throw new Error('enqueue');
      } catch { throw new ApplicationRepositoryError('RECONCILIATION_ENQUEUE_FAILED'); }
    },
    async claimFileReconciliations(limit, leaseSeconds) {
      let result: SupabaseResult<unknown>;
      try { result = await client.rpc('claim_application_file_reconciliations', { p_limit: limit, p_lease_seconds: leaseSeconds }); } catch { throw new ApplicationRepositoryError('RECONCILIATION_CLAIM_FAILED'); }
      const jobs = reconciliationJobs(result.data);
      if (result.error || !jobs) throw new ApplicationRepositoryError('RECONCILIATION_CLAIM_FAILED');
      return jobs;
    },
    async completeFileReconciliation(jobId, lockToken) {
      let result: SupabaseResult<unknown>;
      try { result = await client.rpc('complete_application_file_reconciliation', { p_id: jobId, p_lock_token: lockToken }); } catch { throw new ApplicationRepositoryError('RECONCILIATION_COMPLETE_FAILED'); }
      if (result.error || result.data !== true) throw new ApplicationRepositoryError('RECONCILIATION_COMPLETE_FAILED');
    },
    async retryFileReconciliation(input) {
      let result: SupabaseResult<unknown>;
      try {
        result = await client.rpc('retry_application_file_reconciliation', {
          p_id: input.jobId,
          p_lock_token: input.lockToken,
          p_error_code: input.errorCode,
          p_delay_seconds: input.delaySeconds,
          p_mark_dead: input.markDead,
        });
      } catch { throw new ApplicationRepositoryError('RECONCILIATION_RETRY_FAILED'); }
      if (result.error || result.data !== true) throw new ApplicationRepositoryError('RECONCILIATION_RETRY_FAILED');
    },
    async isApplicationFilePathReferenced(applicationId, idempotencyKey, path) {
      let result: SupabaseResult<unknown>;
      try {
        result = await client.rpc('is_application_file_reconciliation_path_referenced', {
          p_application_id: applicationId,
          p_idempotency_key: idempotencyKey,
          p_path: path,
        });
      } catch { throw new ApplicationRepositoryError('RECONCILIATION_REFERENCE_CHECK_FAILED'); }
      if (result.error || typeof result.data !== 'boolean') throw new ApplicationRepositoryError('RECONCILIATION_REFERENCE_CHECK_FAILED');
      return result.data;
    },
  };
}
