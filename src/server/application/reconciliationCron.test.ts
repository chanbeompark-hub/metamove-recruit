// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../../../workers/reconciliation-cron';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reconciliation cron hook', () => {
  it('calls the protected reconciliation endpoint with the separate secret and no cache', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    let background: Promise<unknown> | undefined;

    worker.scheduled(
      {},
      { RECONCILIATION_ENDPOINT: 'https://careers.example.test/api/application-reconciliation', RECONCILIATION_SECRET: 'cron-secret' },
      { waitUntil: (promise: Promise<unknown>) => { background = promise; } },
    );
    await background;

    expect(fetcher).toHaveBeenCalledWith('https://careers.example.test/api/application-reconciliation', {
      method: 'POST',
      headers: { 'X-Reconciliation-Secret': 'cron-secret' },
      cache: 'no-store',
    });
  });
});
