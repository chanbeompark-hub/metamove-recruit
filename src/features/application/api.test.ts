import { describe, expect, it, vi } from 'vitest';
import { ApplicationSubmissionError, submitApplication } from './api';

describe('submitApplication', () => {
  it('posts multipart data without setting a content-type boundary manually', async () => {
    const form = new FormData();
    form.set('payload', '{}');
    const fetcher = vi.fn(async () => Response.json({
      receiptCode: 'MMG-123',
      ignoredSensitiveField: 'must not escape the client boundary',
    }, { status: 201 }));

    const result = await submitApplication(form, fetcher);

    expect(result).toEqual({ receiptCode: 'MMG-123' });
    expect(form.get('submission_key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(fetcher).toHaveBeenCalledWith('/api/applications', {
      method: 'POST',
      body: form,
      cache: 'no-store',
      credentials: 'same-origin',
    });
  });

  it('keeps one stable idempotency key when the same form is retried', async () => {
    const form = new FormData();
    const fetcher = vi.fn(async () => Response.json({ receiptCode: 'MMG-123' }, { status: 201 }));
    await submitApplication(form, fetcher);
    const first = form.get('submission_key');
    await submitApplication(form, fetcher);
    expect(form.get('submission_key')).toBe(first);
  });

  it.each([
    [400, 'INVALID_REQUEST'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [429, 'RATE_LIMITED'],
    [503, 'UNAVAILABLE'],
    [202, 'SUBMISSION_PENDING'],
    [500, 'SUBMISSION_FAILED'],
  ] as const)('maps HTTP %s to a generalized typed error', async (status, code) => {
    const fetcher = vi.fn(async () => Response.json({
      error: { code: 'INTERNAL_DB_DETAIL', message: 'sensitive detail' },
    }, { status }));

    const error = await submitApplication(new FormData(), fetcher).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApplicationSubmissionError);
    expect(error).toMatchObject({ code, status });
    expect((error as Error).message).not.toContain('sensitive');
    expect(error).not.toHaveProperty('responseBody');
  });

  it('maps network failures without exposing the thrown message', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('request included applicant@example.test');
    });

    const error = await submitApplication(new FormData(), fetcher).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
    expect((error as Error).message).not.toContain('applicant@example.test');
  });
});
