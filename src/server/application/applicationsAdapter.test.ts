// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_APPLICATION_REQUEST_BYTES,
  applicationTurnstileMiddleware,
  handleApplicationHttpRequest,
  type ApplicationPagesContext,
} from '../../../functions/api/applications';
import {
  ApplicationDomainError,
  type ApplicationPolicy,
  type ApplicationRepository,
  type CreateApplicationCommand,
} from './types';
import { validEntryInput } from '../../test/fixtures/application';

const PDF_HEADER = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const env = {
  SUPABASE_URL: 'https://project.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-role-placeholder',
  TURNSTILE_SECRET_KEY: 'test-only-turnstile-placeholder',
  SUBMISSION_HASH_SECRET: 'test-hmac-secret-that-is-32-bytes!',
  PRIVACY_CONSENT_VERSION: 'test-approved-v1',
  PRIVACY_RETENTION_DAYS: '30',
};

function multipart(options: {
  payload?: unknown;
  resume?: File | null;
  portfolio?: File | null;
  token?: string;
} = {}) {
  const form = new FormData();
  if (options.payload !== undefined) form.set('payload', JSON.stringify(options.payload));
  if (options.resume !== null) {
    form.set('resume', options.resume ?? new File([PDF_HEADER], 'resume.pdf', { type: 'application/pdf' }));
  }
  if (options.portfolio) form.set('portfolio', options.portfolio);
  form.set('cf-turnstile-response', options.token ?? 'test-turnstile-response');
  return form;
}

function request(form = multipart({ payload: validEntryInput }), headers: HeadersInit = {}) {
  return new Request('https://careers.example.test/api/applications', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': '203.0.113.8', ...headers },
    body: form,
  });
}

function dependencies(error?: unknown) {
  const repository = {
    consumeSubmissionQuota: vi.fn(async () => true),
    uploadFile: vi.fn(async (path: string) => path),
    insertApplicationGraph: vi.fn(async () => undefined),
    deleteFile: vi.fn(async () => undefined),
  };
  const createApplication = vi.fn(async (
    _command: CreateApplicationCommand,
    _repository: ApplicationRepository,
    _policy: ApplicationPolicy,
  ) => {
    void _command;
    void _repository;
    void _policy;
    if (error) throw error;
    return { receiptCode: 'MMG-00112233445566778899AABBCCDDEEFF' };
  });
  const createRepository = vi.fn(() => repository);
  return { repository, createApplication, createRepository };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleApplicationHttpRequest', () => {
  it('allows POST only and does not broaden CORS', async () => {
    const deps = dependencies();
    const response = await handleApplicationHttpRequest(
      new Request('https://careers.example.test/api/applications', { method: 'GET' }),
      env,
      deps,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(deps.createApplication).not.toHaveBeenCalled();
  });

  it('returns 503 unless every policy and server-only environment value is valid', async () => {
    const deps = dependencies();
    const response = await handleApplicationHttpRequest(request(), {
      ...env,
      PRIVACY_CONSENT_VERSION: '',
    }, deps);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'UNAVAILABLE', message: '현재 지원서를 제출할 수 없습니다.' },
    });
    expect(deps.createRepository).not.toHaveBeenCalled();
  });

  it('rejects wrong content type, missing payload, and missing resume as generalized 400s', async () => {
    const deps = dependencies();
    const responses = await Promise.all([
      handleApplicationHttpRequest(new Request('https://careers.example.test/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.8' },
        body: '{}',
      }), env, deps),
      handleApplicationHttpRequest(request(multipart({ resume: null })), env, deps),
      handleApplicationHttpRequest(request(multipart({ payload: undefined })), env, deps),
    ]);

    expect(responses.map((response) => response.status)).toEqual([400, 400, 400]);
    for (const response of responses) {
      await expect(response.json()).resolves.toEqual({
        error: { code: 'INVALID_REQUEST', message: '요청 내용을 확인해주세요.' },
      });
    }
    expect(deps.createApplication).not.toHaveBeenCalled();
  });

  it('rejects a declared or parsed request larger than the defensive limit', async () => {
    const deps = dependencies();
    const declared = request(multipart({ payload: validEntryInput }), {
      'Content-Length': String(MAX_APPLICATION_REQUEST_BYTES + 1),
    });
    const oversized = request(multipart({
      payload: validEntryInput,
      resume: new File([new Uint8Array(MAX_APPLICATION_REQUEST_BYTES)], 'resume.pdf', {
        type: 'application/pdf',
      }),
    }));

    const declaredResponse = await handleApplicationHttpRequest(declared, env, deps);
    const parsedResponse = await handleApplicationHttpRequest(oversized, env, deps);

    expect(declaredResponse.status).toBe(413);
    expect(parsedResponse.status).toBe(413);
    expect(deps.createApplication).not.toHaveBeenCalled();
  });

  it('normalizes email and IP into an HMAC actor hash without forwarding raw IP or token', async () => {
    const deps = dependencies();
    const input = { ...validEntryInput, email: '  APPLICANT@EXAMPLE.TEST  ' };

    const response = await handleApplicationHttpRequest(request(multipart({ payload: input })), env, deps);

    expect(response.status).toBe(201);
    expect(deps.createApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ email: 'APPLICANT@EXAMPLE.TEST' }),
        actorHash: '39ddf5a03e3b0afe1dddb7fd8e6170a050d0637f43c0e98d26b07b46048fcd96',
      }),
      deps.repository,
      { privacyConsentVersion: 'test-approved-v1', privacyRetentionDays: 30 },
    );
    const forwarded = deps.createApplication.mock.calls[0][0] as Record<string, unknown>;
    expect(JSON.stringify(forwarded)).not.toContain('203.0.113.8');
    expect(JSON.stringify(forwarded)).not.toContain('test-turnstile-response');
    await expect(response.json()).resolves.toEqual({
      receiptCode: 'MMG-00112233445566778899AABBCCDDEEFF',
    });
  });

  it.each([
    ['INVALID_APPLICATION', 400, 'INVALID_REQUEST'],
    ['FILE_REQUIRED', 400, 'INVALID_REQUEST'],
    ['FILE_INVALID', 400, 'INVALID_REQUEST'],
    ['FILE_TOO_LARGE', 413, 'PAYLOAD_TOO_LARGE'],
    ['RATE_LIMITED', 429, 'RATE_LIMITED'],
    ['POLICY_UNAVAILABLE', 503, 'UNAVAILABLE'],
    ['SUBMISSION_UNAVAILABLE', 503, 'UNAVAILABLE'],
    ['APPLICATION_SAVE_FAILED', 500, 'SUBMISSION_FAILED'],
  ] as const)('maps %s without returning domain or internal details', async (domainCode, status, responseCode) => {
    const deps = dependencies(new ApplicationDomainError(domainCode));

    const response = await handleApplicationHttpRequest(request(), env, deps);
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toMatchObject({ error: { code: responseCode } });
    if (domainCode !== responseCode) expect(JSON.stringify(body)).not.toContain(domainCode);
    expect(JSON.stringify(body)).not.toContain(validEntryInput.email);
  });

  it('maps unknown failures to a generalized no-store 500', async () => {
    const deps = dependencies(new Error('database row applicant@example.test'));

    const response = await handleApplicationHttpRequest(request(), env, deps);

    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).not.toContain('applicant@example.test');
  });
});

describe('applicationTurnstileMiddleware', () => {
  it('removes the token from request-scoped form data before the application handler runs', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input;
      void _init;
      return Response.json({
        success: true,
        challenge_ts: '2026-09-02T08:00:00.000Z',
        hostname: 'careers.example.test',
      });
    }));
    const deps = dependencies();
    const contextData: { applicationForm?: FormData } = {};
    const context: ApplicationPagesContext = {
      request: request(),
      env,
      data: contextData,
      params: {},
      functionPath: '/api/applications',
      next: vi.fn(async () => {
        const prepared = contextData.applicationForm;
        expect(prepared?.has('cf-turnstile-response')).toBe(false);
        return handleApplicationHttpRequest(context.request, env, deps, prepared);
      }),
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    };

    const response = await applicationTurnstileMiddleware(context);

    expect(response.status).toBe(201);
    expect(context.next).toHaveBeenCalledOnce();
    expect(deps.createApplication).toHaveBeenCalledOnce();
  });

  it('uses the plugin, stops on failure, and returns only a generalized 400', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input;
      void _init;
      return Response.json({
        success: false,
        'error-codes': ['invalid-input-response'],
      });
    });
    vi.stubGlobal('fetch', fetcher);
    const next = vi.fn(async () => new Response('must not run'));
    const context = {
      request: request(),
      env,
      data: {},
      params: {},
      functionPath: '/api/applications',
      next,
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    };

    const response = await applicationTurnstileMiddleware(context);

    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).not.toContain('invalid-input-response');
    expect(next).not.toHaveBeenCalled();
    const turnstileBody = fetcher.mock.calls[0][1]?.body as FormData;
    expect(turnstileBody.get('secret')).toBe(env.TURNSTILE_SECRET_KEY);
    expect(turnstileBody.get('response')).toBe('test-turnstile-response');
  });
});
