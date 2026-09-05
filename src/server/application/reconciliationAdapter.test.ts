// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  handleApplicationReconciliationRequest,
  type ReconciliationAdapterDependencies,
} from '../../../functions/api/application-reconciliation';
import type { ApplicationReconciliationRepository } from './reconciliation';

const env = {
  SUPABASE_URL: 'https://project.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-role-placeholder',
  RECONCILIATION_SECRET: 'test-reconciliation-secret',
};

function dependencies(error?: Error): ReconciliationAdapterDependencies {
  const repository: ApplicationReconciliationRepository = {
    claimFileReconciliations: vi.fn(async () => []),
    completeFileReconciliation: vi.fn(async () => undefined),
    retryFileReconciliation: vi.fn(async () => undefined),
    findApplicationByIdempotencyKey: vi.fn(async () => null),
    isApplicationFilePathReferenced: vi.fn(async () => false),
    deleteFile: vi.fn(async () => undefined),
  };
  return {
    createRepository: vi.fn(() => repository),
    processReconciliations: vi.fn(async () => {
      if (error) throw error;
      return { claimed: 2, resolved: 1, deferred: 0, retried: 1, dead: 0 };
    }),
  };
}

function request(method = 'POST', secret = env.RECONCILIATION_SECRET) {
  return new Request('https://careers.example.test/api/application-reconciliation', {
    method,
    headers: { 'X-Reconciliation-Secret': secret },
  });
}

describe('handleApplicationReconciliationRequest', () => {
  it('allows POST only and returns no-store without starting a worker for other methods', async () => {
    const deps = dependencies();
    const response = await handleApplicationReconciliationRequest(request('GET'), env, deps);

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(deps.createRepository).not.toHaveBeenCalled();
  });

  it('rejects a wrong or absent reconciliation secret without starting a worker', async () => {
    const deps = dependencies();
    const wrong = await handleApplicationReconciliationRequest(request('POST', 'wrong-secret'), env, deps);
    const absent = await handleApplicationReconciliationRequest(new Request('https://careers.example.test/api/application-reconciliation', { method: 'POST' }), env, deps);

    expect([wrong.status, absent.status]).toEqual([401, 401]);
    expect(wrong.headers.get('Cache-Control')).toBe('no-store');
    expect(await wrong.text()).not.toContain('wrong-secret');
    expect(deps.createRepository).not.toHaveBeenCalled();
  });

  it('runs the worker only with the separate secret and exposes aggregate counts only', async () => {
    const deps = dependencies();
    const response = await handleApplicationReconciliationRequest(request(), env, deps);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ claimed: 2, resolved: 1, deferred: 0, retried: 1, dead: 0 });
    expect(deps.processReconciliations).toHaveBeenCalledWith(expect.any(Object));
  });

  it('fails closed without logging or returning sensitive worker errors', async () => {
    const deps = dependencies(new Error('storage failed for applicant@example.test at applications/secret.pdf'));
    const response = await handleApplicationReconciliationRequest(request(), env, deps);

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.text();
    expect(body).not.toContain('applicant@example.test');
    expect(body).not.toContain('applications/secret.pdf');
  });
});
