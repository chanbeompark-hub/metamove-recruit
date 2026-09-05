import turnstilePlugin from '@cloudflare/pages-plugin-turnstile';
import { MAX_FILE_BYTES, applicationSchema } from '../../src/features/application/schema';
import { createApplication } from '../../src/server/application/createApplication';
import { createSupabaseApplicationRepository } from '../../src/server/application/repository';
import { ApplicationDomainError, type ApplicationPolicy, type ApplicationRepository, type CreateApplicationCommand } from '../../src/server/application/types';

export const MAX_APPLICATION_PAYLOAD_BYTES = 64 * 1024;
export const MAX_APPLICATION_REQUEST_BYTES = (MAX_FILE_BYTES * 2) + (256 * 1024);
const TURNSTILE_TOKEN_MAX_BYTES = 2048;
const PREVERIFY_MAXIMUM = 20;
const PREVERIFY_WINDOW_SECONDS = 600;
const ALLOWED_FIELDS = new Set(['payload', 'resume', 'portfolio', 'cf-turnstile-response', 'submission_key']);

export type ApplicationFunctionEnv = {
  SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string; TURNSTILE_SECRET_KEY?: string; SUBMISSION_HASH_SECRET?: string;
  TURNSTILE_EXPECTED_HOSTNAME?: string; TURNSTILE_EXPECTED_ACTION?: string; PRIVACY_CONSENT_VERSION?: string; PRIVACY_RETENTION_DAYS?: string;
};
type RuntimeConfig = { supabaseUrl: string; supabaseServiceRoleKey: string; turnstileSecretKey: string; submissionHashSecret: string; expectedHostname: string; expectedAction: string; policy: ApplicationPolicy };
type TurnstileResult = { success: boolean; hostname?: string; action?: string; 'error-codes'?: string[] };
type ApplicationContextData = { applicationForm?: FormData; turnstile?: TurnstileResult; applicationRepository?: ApplicationRepository };
export type ApplicationPagesContext = {
  request: Request; env: ApplicationFunctionEnv; data: ApplicationContextData; params: Record<string, string | string[]>; functionPath: string;
  next(input?: Request | string, init?: RequestInit): Promise<Response>; waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void;
};
export type AdapterDependencies = {
  createRepository(config: { supabaseUrl: string; supabaseServiceRoleKey: string }): ApplicationRepository;
  createApplication(command: CreateApplicationCommand, repository: ApplicationRepository, policy: ApplicationPolicy): Promise<{ receiptCode: string }>;
};
const defaultDependencies: AdapterDependencies = { createRepository: createSupabaseApplicationRepository, createApplication };
type ResponseErrorCode = 'INVALID_REQUEST' | 'PAYLOAD_TOO_LARGE' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'SUBMISSION_PENDING' | 'SUBMISSION_FAILED';
const RESPONSE_MESSAGES: Record<ResponseErrorCode, string> = { INVALID_REQUEST: '요청 내용을 확인해주세요.', PAYLOAD_TOO_LARGE: '첨부 파일 크기를 확인해주세요.', RATE_LIMITED: '잠시 후 다시 시도해주세요.', UNAVAILABLE: '현재 지원서를 제출할 수 없습니다.', SUBMISSION_PENDING: '접수 상태를 확인 중입니다. 잠시 후 같은 지원서를 다시 제출해주세요.', SUBMISSION_FAILED: '지원서 저장 중 문제가 발생했습니다.' };
class ApplicationHttpError extends Error { constructor(readonly status: number, readonly responseCode: ResponseErrorCode) { super(responseCode); } }
function jsonResponse(body: unknown, status: number, headers?: HeadersInit) { const responseHeaders = new Headers(headers); responseHeaders.set('Cache-Control', 'no-store'); return Response.json(body, { status, headers: responseHeaders }); }
function errorResponse(status: number, code: ResponseErrorCode, headers?: HeadersInit) { return jsonResponse({ error: { code, message: RESPONSE_MESSAGES[code] } }, status, headers); }
function methodNotAllowed() { return errorResponse(405, 'INVALID_REQUEST', { Allow: 'POST' }); }

function parseRuntimeConfig(env: ApplicationFunctionEnv): RuntimeConfig | null {
  const supabaseUrl = env.SUPABASE_URL?.trim() ?? ''; const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  const turnstileSecretKey = env.TURNSTILE_SECRET_KEY?.trim() ?? ''; const submissionHashSecret = env.SUBMISSION_HASH_SECRET ?? '';
  const expectedHostname = env.TURNSTILE_EXPECTED_HOSTNAME?.trim().toLowerCase() ?? ''; const expectedAction = env.TURNSTILE_EXPECTED_ACTION?.trim() ?? '';
  const privacyConsentVersion = env.PRIVACY_CONSENT_VERSION?.trim() ?? ''; const retentionText = env.PRIVACY_RETENTION_DAYS?.trim() ?? '';
  const privacyRetentionDays = /^\d+$/.test(retentionText) ? Number(retentionText) : Number.NaN;
  let parsedUrl: URL; try { parsedUrl = new URL(supabaseUrl); } catch { return null; }
  if (!['http:', 'https:'].includes(parsedUrl.protocol) || !supabaseServiceRoleKey || !turnstileSecretKey || submissionHashSecret.length < 32 || !expectedHostname || !expectedAction || !privacyConsentVersion || !Number.isSafeInteger(privacyRetentionDays) || privacyRetentionDays <= 0) return null;
  return { supabaseUrl, supabaseServiceRoleKey, turnstileSecretKey, submissionHashSecret, expectedHostname, expectedAction, policy: { privacyConsentVersion, privacyRetentionDays } };
}
function edgeIp(request: Request) { const value = request.headers.get('CF-Connecting-IP')?.trim().toLowerCase() ?? ''; if (!value || value.length > 128 || /\p{Cc}/u.test(value)) throw new ApplicationHttpError(503, 'UNAVAILABLE'); return value; }
function isFile(value: FormDataEntryValue | null): value is File { return typeof value === 'object' && value !== null && typeof value.name === 'string' && typeof value.type === 'string' && typeof value.size === 'number' && typeof value.arrayBuffer === 'function'; }
function validateHeaders(request: Request) {
  const rawLength = request.headers.get('Content-Length');
  if (rawLength !== null && (!/^\d+$/.test(rawLength) || Number(rawLength) > MAX_APPLICATION_REQUEST_BYTES)) throw new ApplicationHttpError(Number(rawLength) > MAX_APPLICATION_REQUEST_BYTES ? 413 : 400, Number(rawLength) > MAX_APPLICATION_REQUEST_BYTES ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST');
  if (!/^multipart\/form-data\s*;.*\bboundary=/i.test(request.headers.get('Content-Type') ?? '')) throw new ApplicationHttpError(400, 'INVALID_REQUEST');
}
async function boundedFormData(request: Request) {
  validateHeaders(request);
  const reader = request.body?.getReader();
  if (!reader) throw new ApplicationHttpError(400, 'INVALID_REQUEST');
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > MAX_APPLICATION_REQUEST_BYTES) { await reader.cancel(); throw new ApplicationHttpError(413, 'PAYLOAD_TOO_LARGE'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  const boundedRequest = new Request(request.url, { method: request.method, headers: request.headers, body });
  try { return await boundedRequest.formData(); } catch { throw new ApplicationHttpError(400, 'INVALID_REQUEST'); }
}
type ParsedMultipart = { form: FormData; payload: string; resume: File; portfolio: File | null; turnstileToken: string; idempotencyKey: string };
async function parseMultipart(request: Request, preparedForm?: FormData): Promise<ParsedMultipart> {
  const verified = preparedForm !== undefined;
  const form = preparedForm ?? await boundedFormData(request);
  const keys = [...form.keys()];
  if (keys.some((key) => !ALLOWED_FIELDS.has(key)) || keys.length > 5
    || form.getAll('payload').length !== 1 || form.getAll('resume').length !== 1 || form.getAll('portfolio').length > 1 || form.getAll('submission_key').length !== 1
    || (!verified && form.getAll('cf-turnstile-response').length !== 1) || (verified && form.has('cf-turnstile-response'))) throw new ApplicationHttpError(400, 'INVALID_REQUEST');
  const payload = form.get('payload'); const resume = form.get('resume'); const portfolio = form.get('portfolio'); const token = form.get('cf-turnstile-response'); const idempotencyKey = form.get('submission_key');
  if (typeof payload !== 'string' || !payload || new TextEncoder().encode(payload).byteLength > MAX_APPLICATION_PAYLOAD_BYTES || !isFile(resume) || (portfolio !== null && !isFile(portfolio))
    || typeof idempotencyKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)
    || (!verified && (typeof token !== 'string' || !token.trim() || new TextEncoder().encode(token).byteLength > TURNSTILE_TOKEN_MAX_BYTES))) throw new ApplicationHttpError(400, 'INVALID_REQUEST');
  for (const file of [resume, portfolio].filter(isFile)) if (!file.name || new TextEncoder().encode(file.name).byteLength > 255 || new TextEncoder().encode(file.type).byteLength > 128) throw new ApplicationHttpError(400, 'INVALID_REQUEST');
  return { form, payload, resume, portfolio, turnstileToken: typeof token === 'string' ? token : '', idempotencyKey: idempotencyKey.toLowerCase() };
}
function normalizedInput(payload: string) { let value: unknown; try { value = JSON.parse(payload); } catch { throw new ApplicationHttpError(400, 'INVALID_REQUEST'); } if (typeof value === 'object' && value !== null && 'email' in value && typeof value.email === 'string') value = { ...value, email: value.email.trim() }; const parsed = applicationSchema.safeParse(value); if (!parsed.success) throw new ApplicationHttpError(400, 'INVALID_REQUEST'); return parsed.data; }
async function hmac(secret: string, value: string) { const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)); return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join(''); }
function mappedDomainError(error: ApplicationDomainError) { switch (error.code) { case 'INVALID_APPLICATION': case 'FILE_REQUIRED': case 'FILE_INVALID': return errorResponse(400, 'INVALID_REQUEST'); case 'FILE_TOO_LARGE': return errorResponse(413, 'PAYLOAD_TOO_LARGE'); case 'RATE_LIMITED': return errorResponse(429, 'RATE_LIMITED'); case 'POLICY_UNAVAILABLE': case 'SUBMISSION_UNAVAILABLE': return errorResponse(503, 'UNAVAILABLE'); case 'SUBMISSION_PENDING': return errorResponse(202, 'SUBMISSION_PENDING'); case 'APPLICATION_SAVE_FAILED': return errorResponse(500, 'SUBMISSION_FAILED'); } }
function mappedHttpError(error: unknown) { if (error instanceof ApplicationHttpError) return errorResponse(error.status, error.responseCode); if (error instanceof ApplicationDomainError) return mappedDomainError(error); return errorResponse(500, 'SUBMISSION_FAILED'); }

export async function handleApplicationHttpRequest(request: Request, env: ApplicationFunctionEnv, dependencies: AdapterDependencies = defaultDependencies, preparedForm?: FormData, preparedRepository?: ApplicationRepository): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed();
  const config = parseRuntimeConfig(env); if (!config) return errorResponse(503, 'UNAVAILABLE');
  try {
    const ip = edgeIp(request); const multipart = await parseMultipart(request, preparedForm); const input = normalizedInput(multipart.payload);
    const actorHash = await hmac(config.submissionHashSecret, `${input.email.trim().toLowerCase()}:${ip}`);
    const repository = preparedRepository ?? dependencies.createRepository({ supabaseUrl: config.supabaseUrl, supabaseServiceRoleKey: config.supabaseServiceRoleKey });
    const result = await dependencies.createApplication({ input, idempotencyKey: multipart.idempotencyKey, actorHash, resume: multipart.resume, portfolio: multipart.portfolio }, repository, config.policy);
    return jsonResponse({ receiptCode: result.receiptCode }, 201);
  } catch (error) { return mappedHttpError(error); }
}

const INFRA_TURNSTILE_ERRORS = new Set(['missing-input-secret', 'invalid-input-secret', 'invalid-widget-id', 'invalid-parsed-secret', 'internal-error']);
export function createApplicationTurnstileMiddleware(dependencies: AdapterDependencies = defaultDependencies) {
  return async function middleware(context: ApplicationPagesContext): Promise<Response> {
    if (context.request.method !== 'POST') return methodNotAllowed();
    const config = parseRuntimeConfig(context.env); if (!config) return errorResponse(503, 'UNAVAILABLE');
    try {
      const ip = edgeIp(context.request);
      validateHeaders(context.request);
      const repository = dependencies.createRepository({ supabaseUrl: config.supabaseUrl, supabaseServiceRoleKey: config.supabaseServiceRoleKey });
      const preverifyHash = await hmac(config.submissionHashSecret, `preverify:${ip}`);
      if (!await repository.consumeSubmissionQuota(preverifyHash, PREVERIFY_MAXIMUM, PREVERIFY_WINDOW_SECONDS)) return errorResponse(429, 'RATE_LIMITED');
      const multipart = await parseMultipart(context.request);
      multipart.form.delete('cf-turnstile-response'); context.data.applicationForm = multipart.form; context.data.applicationRepository = repository;
      const originalNext = context.next.bind(context);
      const pluginContext: ApplicationPagesContext = { ...context, request: new Request(context.request.url, { method: 'POST' }), next: async () => {
        const result = context.data.turnstile;
        if (!result?.success || result.hostname?.toLowerCase() !== config.expectedHostname || result.action !== config.expectedAction) return errorResponse(400, 'INVALID_REQUEST');
        return originalNext();
      } };
      const plugin = turnstilePlugin({
        secret: config.turnstileSecretKey, response: multipart.turnstileToken, remoteip: ip, idempotency_key: multipart.idempotencyKey,
        onError: async (errorContext: unknown) => {
          const result = (errorContext as { data?: { turnstile?: TurnstileResult } }).data?.turnstile;
          const infrastructure = result?.['error-codes']?.some((code) => INFRA_TURNSTILE_ERRORS.has(code)) ?? true;
          return errorResponse(infrastructure ? 503 : 400, infrastructure ? 'UNAVAILABLE' : 'INVALID_REQUEST');
        },
      }) as unknown as (pluginContext: ApplicationPagesContext) => Promise<Response>;
      return await plugin(pluginContext);
    } catch (error) { return error instanceof ApplicationHttpError ? mappedHttpError(error) : errorResponse(503, 'UNAVAILABLE'); }
  };
}
export const applicationTurnstileMiddleware = createApplicationTurnstileMiddleware();
async function applicationRequestHandler(context: ApplicationPagesContext) { return handleApplicationHttpRequest(context.request, context.env, defaultDependencies, context.data.applicationForm, context.data.applicationRepository); }
export const onRequest = [applicationTurnstileMiddleware, applicationRequestHandler];
