import { describe, expect, it, vi } from 'vitest';
import { createSupabaseApplicationRepository } from './repository';
import type { PersistedApplication } from './types';

function graph(): PersistedApplication {
  return {
    application: {
      id: '10000000-0000-4000-8000-000000000001',
      receiptCode: 'MMG-00112233445566778899AABBCCDDEEFF',
      name: '가상지원자',
      phone: '010-1234-5678',
      email: 'applicant@example.test',
      level: 'entry',
      availableFrom: '2026-09-15',
      careerMonths: 0,
      specialties: ['웨이트 트레이닝'],
      certifications: [],
      privacyConsentVersion: 'test-approved-v1',
      privacyConsentAt: '2026-09-02T08:00:00.000Z',
      retentionUntil: '2026-10-02T08:00:00.000Z',
    },
    answers: [{
      answerKey: 'motivation',
      answerText: '가'.repeat(100),
      answerJson: null,
      displayOrder: 1,
    }],
    files: [{
      storagePath: 'applications/10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000002.pdf',
      originalFilename: 'resume.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 8,
      fileKind: 'resume',
    }],
  };
}

function client(options: {
  rpcData?: unknown;
  rpcError?: unknown;
  uploadError?: unknown;
  removeError?: unknown;
} = {}) {
  const rpc = vi.fn(async () => ({ data: options.rpcData ?? true, error: options.rpcError ?? null }));
  const upload = vi.fn(async (path: string) => ({ data: { path }, error: options.uploadError ?? null }));
  const remove = vi.fn(async () => ({ data: [], error: options.removeError ?? null }));
  const from = vi.fn(() => ({ upload, remove }));
  const tableFrom = vi.fn(() => {
    throw new Error('graph persistence must not use separate table inserts');
  });
  return {
    fake: { rpc, storage: { from }, from: tableFrom },
    rpc,
    upload,
    remove,
    from,
    tableFrom,
  };
}

const config = {
  supabaseUrl: 'https://project.example.test',
  supabaseServiceRoleKey: 'test-only-placeholder-key',
};

describe('createSupabaseApplicationRepository', () => {
  it('creates a non-persisting server client from the explicit service-role input', async () => {
    const { fake } = client();
    const factory = vi.fn(() => fake);

    createSupabaseApplicationRepository(config, factory);

    expect(factory).toHaveBeenCalledWith(
      config.supabaseUrl,
      config.supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
  });

  it('uses the service-role-only quota RPC and accepts only boolean results', async () => {
    const { fake, rpc } = client({ rpcData: false });
    const repository = createSupabaseApplicationRepository(config, () => fake);

    await expect(repository.consumeSubmissionQuota('a'.repeat(64), 5, 600)).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledWith('consume_submission_quota', {
      p_actor_hash: 'a'.repeat(64),
      p_maximum: 5,
      p_window_seconds: 600,
    });
  });

  it('uploads to the private application bucket with no overwrite', async () => {
    const { fake, from, upload } = client();
    const repository = createSupabaseApplicationRepository(config, () => fake);
    const file = new File(['%PDF-1.7'], 'resume.pdf', { type: 'application/pdf' });
    const path = 'applications/id/random.pdf';

    await expect(repository.uploadFile(path, file)).resolves.toBe(path);
    expect(from).toHaveBeenCalledWith('application-files');
    expect(upload).toHaveBeenCalledWith(path, file, {
      cacheControl: '3600',
      contentType: 'application/pdf',
      upsert: false,
    });
  });

  it('persists the entire graph through one atomic RPC boundary', async () => {
    const { fake, rpc, tableFrom } = client();
    const repository = createSupabaseApplicationRepository(config, () => fake);
    const input = graph();

    await repository.insertApplicationGraph(input);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('insert_application_graph', {
      p_graph: {
        application: expect.objectContaining({
          id: input.application.id,
          receipt_code: input.application.receiptCode,
          privacy_consent_version: input.application.privacyConsentVersion,
        }),
        answers: [expect.objectContaining({ answer_key: 'motivation', display_order: 1 })],
        files: [expect.objectContaining({ storage_path: input.files[0].storagePath, file_kind: 'resume' })],
      },
    });
    expect(tableFrom).not.toHaveBeenCalled();
  });

  it('uses private remove for cleanup and never suppresses repository errors', async () => {
    const { fake, remove } = client({ removeError: { message: 'storage detail' } });
    const repository = createSupabaseApplicationRepository(config, () => fake);

    await expect(repository.deleteFile('applications/id/random.pdf')).rejects.toThrow('FILE_DELETE_FAILED');
    expect(remove).toHaveBeenCalledWith(['applications/id/random.pdf']);
  });
});
