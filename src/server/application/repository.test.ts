import { describe, expect, it, vi } from 'vitest';
import { createSupabaseApplicationRepository, type SupabaseApplicationClient } from './repository';
import type { PersistedApplication } from './types';

function graph(): PersistedApplication {
  return {
    application: {
      id: '10000000-0000-4000-8000-000000000001',
      idempotencyKey: '30000000-0000-4000-8000-000000000003',
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
      securityStatus: 'quarantined',
    }],
  };
}

function client(options: {
  rpcData?: unknown;
  rpcError?: unknown;
  rpcImplementation?: (name: string) => { data: unknown; error: unknown };
  uploadError?: unknown;
  removeError?: unknown;
} = {}) {
  const rpc = vi.fn(async (name: string): Promise<{ data: unknown; error: unknown }> => options.rpcImplementation?.(name) ?? ({ data: options.rpcData ?? true, error: options.rpcError ?? null }));
  const upload = vi.fn(async (path: string) => ({ data: { path }, error: options.uploadError ?? null }));
  const remove = vi.fn(async () => ({ data: [], error: options.removeError ?? null }));
  const from = vi.fn(() => ({ upload, remove }));
  const tableFrom = vi.fn(() => {
    throw new Error('graph persistence must not use separate table inserts');
  });
  return {
    fake: { rpc, storage: { from }, from: tableFrom } as unknown as SupabaseApplicationClient,
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

    await expect(repository.uploadFile(path, file, 'application/pdf')).resolves.toBe(path);
    expect(from).toHaveBeenCalledWith('application-files');
    expect(upload).toHaveBeenCalledWith(path, file, {
      cacheControl: '3600',
      contentType: 'application/pdf',
      upsert: false,
    });
  });

  it('persists the entire graph through one atomic RPC boundary', async () => {
    const { fake, rpc, tableFrom } = client({ rpcData: [{ receipt_code: 'MMG-00112233445566778899AABBCCDDEEFF', inserted: true }] });
    const repository = createSupabaseApplicationRepository(config, () => fake);
    const input = graph();

    await expect(repository.insertApplicationGraph(input)).resolves.toEqual({ status: 'inserted', receiptCode: input.application.receiptCode });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('insert_application_graph', {
      p_graph: {
        application: expect.objectContaining({
          id: input.application.id,
          idempotency_key: input.application.idempotencyKey,
          receipt_code: input.application.receiptCode,
          privacy_consent_version: input.application.privacyConsentVersion,
        }),
        answers: [expect.objectContaining({ answer_key: 'motivation', display_order: 1 })],
        files: [expect.objectContaining({ storage_path: input.files[0].storagePath, file_kind: 'resume', security_status: 'quarantined' })],
      },
    });
    expect(tableFrom).not.toHaveBeenCalled();
  });

  it('classifies only the receipt unique constraint as retryable', async () => {
    const receipt = client({ rpcError: { code: '23505', message: 'duplicate', details: 'Key violates applications_receipt_code_key' } });
    const other = client({ rpcError: { code: '23505', message: 'duplicate', details: 'applications_pkey' } });

    await expect(createSupabaseApplicationRepository(config, () => receipt.fake).insertApplicationGraph(graph())).rejects.toThrow('RECEIPT_COLLISION');
    await expect(createSupabaseApplicationRepository(config, () => other.fake).insertApplicationGraph(graph())).rejects.toThrow('GRAPH_REJECTED');
  });

  it('classifies a thrown RPC transport failure as ambiguous', async () => {
    const { fake } = client({ rpcImplementation: () => { throw new Error('network'); } });
    await expect(createSupabaseApplicationRepository(config, () => fake).insertApplicationGraph(graph())).rejects.toThrow('GRAPH_AMBIGUOUS');
  });

  it('queries the authoritative application identity and receipt before enqueuing cleanup through service-only RPCs', async () => {
    const { fake, rpc } = client({ rpcImplementation: (name) => name === 'find_application_by_idempotency'
      ? { data: [{ application_id: graph().application.id, receipt_code: 'MMG-00112233445566778899AABBCCDDEEFF' }], error: null }
      : { data: null, error: null } });
    const repository = createSupabaseApplicationRepository(config, () => fake);

    await expect(repository.findApplicationByIdempotencyKey(graph().application.idempotencyKey)).resolves.toEqual({
      applicationId: graph().application.id,
      receiptCode: graph().application.receiptCode,
    });
    await repository.enqueueFileReconciliation({ applicationId: graph().application.id, idempotencyKey: graph().application.idempotencyKey, paths: [graph().files[0].storagePath], reason: 'cleanup_failed' });
    expect(rpc).toHaveBeenCalledWith('enqueue_application_file_reconciliation', expect.objectContaining({ p_paths: [graph().files[0].storagePath] }));
  });

  it('uses service-only lease, metadata-guard, completion, and retry RPCs for reconciliation jobs', async () => {
    const reconciliationId = '80000000-0000-4000-8000-000000000001';
    const lockToken = '90000000-0000-4000-8000-000000000001';
    const { fake, rpc } = client({
      rpcImplementation: (name) => {
        if (name === 'claim_application_file_reconciliations') return {
          data: [{
            id: reconciliationId,
            application_id: graph().application.id,
            idempotency_key: graph().application.idempotencyKey,
            storage_paths: [graph().files[0].storagePath],
            reason: 'cleanup_failed',
            attempt_count: 1,
            created_at: '2026-09-05T00:00:00.000Z',
            lock_token: lockToken,
          }],
          error: null,
        };
        if (name === 'is_application_file_reconciliation_path_referenced') return { data: true, error: null };
        return { data: true, error: null };
      },
    });
    const repository = createSupabaseApplicationRepository(config, () => fake);

    await expect(repository.claimFileReconciliations(25, 300)).resolves.toEqual([{
      id: reconciliationId,
      applicationId: graph().application.id,
      idempotencyKey: graph().application.idempotencyKey,
      paths: [graph().files[0].storagePath],
      reason: 'cleanup_failed',
      attemptCount: 1,
      createdAt: '2026-09-05T00:00:00.000Z',
      lockToken,
    }]);
    await expect(repository.isApplicationFilePathReferenced(graph().application.id, graph().application.idempotencyKey, graph().files[0].storagePath)).resolves.toBe(true);
    await repository.completeFileReconciliation(reconciliationId, lockToken);
    await repository.retryFileReconciliation({ jobId: reconciliationId, lockToken, errorCode: 'RECONCILIATION_TRANSIENT_FAILURE', delaySeconds: 30, markDead: false });

    expect(rpc).toHaveBeenCalledWith('claim_application_file_reconciliations', { p_limit: 25, p_lease_seconds: 300 });
    expect(rpc).toHaveBeenCalledWith('is_application_file_reconciliation_path_referenced', {
      p_application_id: graph().application.id,
      p_idempotency_key: graph().application.idempotencyKey,
      p_path: graph().files[0].storagePath,
    });
    expect(rpc).toHaveBeenCalledWith('complete_application_file_reconciliation', { p_id: reconciliationId, p_lock_token: lockToken });
    expect(rpc).toHaveBeenCalledWith('retry_application_file_reconciliation', {
      p_id: reconciliationId,
      p_lock_token: lockToken,
      p_error_code: 'RECONCILIATION_TRANSIENT_FAILURE',
      p_delay_seconds: 30,
      p_mark_dead: false,
    });
  });

  it('uses private remove for cleanup and never suppresses repository errors', async () => {
    const { fake, remove } = client({ removeError: { message: 'storage detail' } });
    const repository = createSupabaseApplicationRepository(config, () => fake);

    await expect(repository.deleteFile('applications/id/random.pdf')).rejects.toThrow('FILE_DELETE_FAILED');
    expect(remove).toHaveBeenCalledWith(['applications/id/random.pdf']);
  });
});
