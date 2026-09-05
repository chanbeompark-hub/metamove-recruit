// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../../../workers/reconciliation-cron';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function schedule(env = { RECONCILIATION_ENDPOINT: 'https://careers.example.test/api/application-reconciliation', RECONCILIATION_SECRET: 'cron-secret' }) {
  let background: Promise<unknown> | undefined;
  worker.scheduled({}, env, { waitUntil: (promise: Promise<unknown>) => { background = promise; } });
  if (!background) throw new Error('scheduled handler did not register background work');
  return background;
}

describe('reconciliation cron hook', () => {
  it('calls the protected reconciliation endpoint with the separate secret and no cache', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await schedule();

    expect(fetcher).toHaveBeenCalledWith('https://careers.example.test/api/application-reconciliation', {
      method: 'POST',
      headers: { 'X-Reconciliation-Secret': 'cron-secret' },
      cache: 'no-store',
    });
  });

  it.each([401, 503])('rejects a non-2xx reconciliation response and emits only an aggregate status event', async (status) => {
    const endpoint = 'https://careers.example.test/api/application-reconciliation';
    const secret = 'cron-secret';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('applicant@example.test applications/private.pdf', { status })));
    const alert = vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);

    await expect(schedule({ RECONCILIATION_ENDPOINT: endpoint, RECONCILIATION_SECRET: secret })).rejects.toThrow('reconciliation cron request failed');
    expect(alert).toHaveBeenCalledWith('application_reconciliation_cron_failed', {
      code: 'RECONCILIATION_CRON_HTTP_FAILURE',
      status,
    });
    const output = JSON.stringify(alert.mock.calls);
    expect(output).not.toContain(endpoint);
    expect(output).not.toContain(secret);
    expect(output).not.toContain('applicant@example.test');
    expect(output).not.toContain('applications/private.pdf');
  });

  it('rejects a network failure and emits only a non-PII aggregate failure status', async () => {
    const endpoint = 'https://careers.example.test/api/application-reconciliation';
    const secret = 'cron-secret';
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error(`network ${endpoint} ${secret} applicant@example.test`); }));
    const alert = vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);

    await expect(schedule({ RECONCILIATION_ENDPOINT: endpoint, RECONCILIATION_SECRET: secret })).rejects.toThrow('reconciliation cron network failed');
    expect(alert).toHaveBeenCalledWith('application_reconciliation_cron_failed', {
      code: 'RECONCILIATION_CRON_NETWORK_FAILURE',
      status: 0,
    });
    const output = JSON.stringify(alert.mock.calls);
    expect(output).not.toContain(endpoint);
    expect(output).not.toContain(secret);
    expect(output).not.toContain('applicant@example.test');
  });
});
