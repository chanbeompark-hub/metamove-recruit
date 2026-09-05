import { describe, expect, it, vi } from 'vitest';
import {
  processApplicationFileReconciliations,
  type ApplicationReconciliationRepository,
  type ReconciliationJob,
} from './reconciliation';

const jobId = '80000000-0000-4000-8000-000000000001';
const applicationId = '10000000-0000-4000-8000-000000000001';
const idempotencyKey = '20000000-0000-4000-8000-000000000001';
const lockToken = '30000000-0000-4000-8000-000000000001';
const storagePath = `applications/${applicationId}/40000000-0000-4000-8000-000000000001.pdf`;
const now = new Date('2026-09-05T00:05:00.000Z');

function reconciliationJob(overrides: Partial<ReconciliationJob> = {}): ReconciliationJob {
  return {
    id: jobId,
    applicationId,
    idempotencyKey,
    paths: [storagePath],
    reason: 'graph_status_unknown',
    attemptCount: 1,
    createdAt: '2026-09-05T00:00:00.000Z',
    lockToken,
    ...overrides,
  };
}

function repository(overrides: Partial<ApplicationReconciliationRepository> = {}) {
  const fake: ApplicationReconciliationRepository = {
    claimFileReconciliations: vi.fn(async () => []),
    completeFileReconciliation: vi.fn(async () => undefined),
    retryFileReconciliation: vi.fn(async () => undefined),
    findApplicationByIdempotencyKey: vi.fn(async () => null),
    isApplicationFilePathReferenced: vi.fn(async () => false),
    deleteFile: vi.fn(async () => undefined),
    ...overrides,
  };
  return fake;
}

describe('processApplicationFileReconciliations', () => {
  it('retains and resolves a graph-status job when the graph committed after the original null lookup', async () => {
    const fake = repository({
      claimFileReconciliations: vi.fn(async () => [reconciliationJob()]),
      findApplicationByIdempotencyKey: vi.fn(async () => ({ applicationId, receiptCode: 'MMG-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })),
    });

    await expect(processApplicationFileReconciliations(fake, { now })).resolves.toEqual({ claimed: 1, resolved: 1, deferred: 0, retried: 0, dead: 0 });
    expect(fake.deleteFile).not.toHaveBeenCalled();
    expect(fake.isApplicationFilePathReferenced).not.toHaveBeenCalled();
    expect(fake.completeFileReconciliation).toHaveBeenCalledWith(jobId, lockToken);
  });

  it('deletes only an unreferenced path and resolves the job', async () => {
    const fake = repository({
      claimFileReconciliations: vi.fn(async () => [reconciliationJob({ reason: 'cleanup_failed' })]),
    });

    await expect(processApplicationFileReconciliations(fake, { now })).resolves.toEqual({ claimed: 1, resolved: 1, deferred: 0, retried: 0, dead: 0 });
    expect(fake.isApplicationFilePathReferenced).toHaveBeenCalledWith(applicationId, idempotencyKey, storagePath);
    expect(fake.deleteFile).toHaveBeenCalledWith(storagePath);
    expect(fake.completeFileReconciliation).toHaveBeenCalledWith(jobId, lockToken);
  });

  it('retains a path when the database metadata guard says a committed graph references it', async () => {
    const fake = repository({
      claimFileReconciliations: vi.fn(async () => [reconciliationJob({ reason: 'cleanup_failed' })]),
      isApplicationFilePathReferenced: vi.fn(async () => true),
    });

    await expect(processApplicationFileReconciliations(fake, { now })).resolves.toEqual({ claimed: 1, resolved: 1, deferred: 0, retried: 0, dead: 0 });
    expect(fake.isApplicationFilePathReferenced).toHaveBeenCalledWith(applicationId, idempotencyKey, storagePath);
    expect(fake.deleteFile).not.toHaveBeenCalled();
    expect(fake.completeFileReconciliation).toHaveBeenCalledWith(jobId, lockToken);
  });

  it('cleans old unreferenced paths when the idempotency key belongs to a different application while retaining a live referenced path', async () => {
    const referencedPath = `applications/${applicationId}/50000000-0000-4000-8000-000000000001.pdf`;
    const fake = repository({
      claimFileReconciliations: vi.fn(async () => [reconciliationJob({ paths: [storagePath, referencedPath] })]),
      findApplicationByIdempotencyKey: vi.fn(async () => ({
        applicationId: '10000000-0000-4000-8000-000000000002',
        receiptCode: 'MMG-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      })),
      isApplicationFilePathReferenced: vi.fn(async (_applicationId, _idempotencyKey, path) => path === referencedPath),
    });

    await expect(processApplicationFileReconciliations(fake, { now })).resolves.toEqual({ claimed: 1, resolved: 1, deferred: 0, retried: 0, dead: 0 });
    expect(fake.isApplicationFilePathReferenced).toHaveBeenCalledWith(applicationId, idempotencyKey, storagePath);
    expect(fake.isApplicationFilePathReferenced).toHaveBeenCalledWith(applicationId, idempotencyKey, referencedPath);
    expect(fake.deleteFile).toHaveBeenCalledTimes(1);
    expect(fake.deleteFile).toHaveBeenCalledWith(storagePath);
    expect(fake.deleteFile).not.toHaveBeenCalledWith(referencedPath);
    expect(fake.completeFileReconciliation).toHaveBeenCalledWith(jobId, lockToken);
  });

  it('schedules bounded retries and marks a repeatedly failing job dead with a non-PII alert', async () => {
    const alert = vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
    const fake = repository({
      claimFileReconciliations: vi.fn(async () => [
        reconciliationJob({ attemptCount: 1 }),
        reconciliationJob({ id: '80000000-0000-4000-8000-000000000002', lockToken: '30000000-0000-4000-8000-000000000002', attemptCount: 5 }),
      ]),
      findApplicationByIdempotencyKey: vi.fn(async () => { throw new Error('applicant@example.test'); }),
    });

    try {
      await expect(processApplicationFileReconciliations(fake, { now })).resolves.toEqual({ claimed: 2, resolved: 0, deferred: 0, retried: 1, dead: 1 });
      expect(fake.retryFileReconciliation).toHaveBeenNthCalledWith(1, expect.objectContaining({ markDead: false, delaySeconds: 30, errorCode: 'RECONCILIATION_TRANSIENT_FAILURE' }));
      expect(fake.retryFileReconciliation).toHaveBeenNthCalledWith(2, expect.objectContaining({ markDead: true, delaySeconds: 0, errorCode: 'RECONCILIATION_TRANSIENT_FAILURE' }));
      expect(alert).toHaveBeenCalledWith('application_reconciliation_dead', { code: 'RECONCILIATION_DEAD', count: 5 });
      expect(JSON.stringify(alert.mock.calls)).not.toContain('applicant@example.test');
    } finally {
      alert.mockRestore();
    }
  });

  it('does not delete twice when a completed job is claimed by a later idempotent run', async () => {
    const fake = repository({
      claimFileReconciliations: vi.fn()
        .mockResolvedValueOnce([reconciliationJob({ reason: 'cleanup_failed' })])
        .mockResolvedValueOnce([]),
    });

    await processApplicationFileReconciliations(fake, { now });
    await processApplicationFileReconciliations(fake, { now });

    expect(fake.deleteFile).toHaveBeenCalledTimes(1);
    expect(fake.completeFileReconciliation).toHaveBeenCalledTimes(1);
  });
});
