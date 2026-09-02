import turnstilePlugin from '@cloudflare/pages-plugin-turnstile';
import { MAX_FILE_BYTES } from '../../src/features/application/schema';
import { applicationSchema } from '../../src/features/application/schema';
import { createApplication } from '../../src/server/application/createApplication';
import { createSupabaseApplicationRepository } from '../../src/server/application/repository';
import {
  ApplicationDomainError,
  type ApplicationPolicy,
  type ApplicationRepository,
  type CreateApplicationCommand,
} from '../../src/server/application/types';

export const MAX_APPLICATION_PAYLOAD_BYTES = 64 * 1024;
export const MAX_APPLICATION_REQUEST_BYTES = (MAX_FILE_BYTES * 2) + (256 * 1024);

export type ApplicationFunctionEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  SUBMISSION_HASH_SECRET?: string;
  PRIVACY_CONSENT_VERSION?: string;
  PRIVACY_RETENTION_DAYS?: string;
};

type RuntimeConfig = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  turnstileSecretKey: string;
  submissionHashSecret: string;
  policy: ApplicationPolicy;
};

type ApplicationContextData = {
  applicationForm?: FormData;
};

export type ApplicationPagesContext = {
  request: Request;
  env: ApplicationFunctionEnv;
  data: ApplicationContextData;
  params: Record<string, string | string[]>;
  functionPath: string;
  next(input?: Request | string, init?: RequestInit): Promise<Response>;
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
};

type AdapterDependencies = {
  createRepository(config: {
    supabaseUrl: string;
    supabaseServiceRoleKey: string;
  }): ApplicationRepository;
  createApplication(
    command: CreateApplicationCommand,
    repository: ApplicationRepository,
    policy: ApplicationPolicy,
  ): Promise<{ receiptCode: string }>;
};

const defaultDependencies: AdapterDependencies = {
  createRepository: createSupabaseApplicationRepository,
  createApplication,
};

type ResponseErrorCode =
  | 'INVALID_REQUEST'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'SUBMISSION_FAILED';

const RESPONSE_MESSAGES: Record<ResponseErrorCode, string> = {
  INVALID_REQUEST: '요청 내용을 확인해주세요.',
  PAYLOAD_TOO_LARGE: '첨부 파일 크기를 확인해주세요.',
  RATE_LIMITED: '잠시 후 다시 시도해주세요.',
  UNAVAILABLE: '현재 지원서를 제출할 수 없습니다.',
  SUBMISSION_FAILED: '지원서 저장 중 문제가 발생했습니다.',
};

class ApplicationHttpError extends Error {
  readonly status: number;
  readonly responseCode: ResponseErrorCode;

  constructor(status: number, responseCode: ResponseErrorCode) {
    super(responseCode);
    this.name = 'ApplicationHttpError';
    this.status = status;
    this.responseCode = responseCode;
  }
}

function jsonResponse(body: unknown, status: number, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'no-store');
  return Response.json(body, { status, headers: responseHeaders });
}

function errorResponse(status: number, code: ResponseErrorCode, headers?: HeadersInit) {
  return jsonResponse({ error: { code, message: RESPONSE_MESSAGES[code] } }, status, headers);
}

function methodNotAllowed() {
  return errorResponse(405, 'INVALID_REQUEST', { Allow: 'POST' });
}

function parseRuntimeConfig(env: ApplicationFunctionEnv): RuntimeConfig | null {
  const supabaseUrl = env.SUPABASE_URL?.trim() ?? '';
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  const turnstileSecretKey = env.TURNSTILE_SECRET_KEY?.trim() ?? '';
  const submissionHashSecret = env.SUBMISSION_HASH_SECRET ?? '';
  const privacyConsentVersion = env.PRIVACY_CONSENT_VERSION?.trim() ?? '';
  const retentionText = env.PRIVACY_RETENTION_DAYS?.trim() ?? '';
  const privacyRetentionDays = /^\d+$/.test(retentionText) ? Number(retentionText) : Number.NaN;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    return null;
  }

  if (
    !['http:', 'https:'].includes(parsedUrl.protocol)
    || !supabaseServiceRoleKey
    || !turnstileSecretKey
    || submissionHashSecret.length < 32
    || !privacyConsentVersion
    || !Number.isSafeInteger(privacyRetentionDays)
    || privacyRetentionDays <= 0
  ) {
    return null;
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    turnstileSecretKey,
    submissionHashSecret,
    policy: { privacyConsentVersion, privacyRetentionDays },
  };
}

function isFile(value: FormDataEntryValue | null): value is File {
  return typeof value === 'object'
    && value !== null
    && typeof value.name === 'string'
    && typeof value.type === 'string'
    && typeof value.size === 'number'
    && typeof value.arrayBuffer === 'function';
}

function validateDeclaredBodySize(request: Request) {
  const rawLength = request.headers.get('Content-Length');
  if (rawLength !== null) {
    if (!/^\d+$/.test(rawLength)) throw new ApplicationHttpError(400, 'INVALID_REQUEST');
    if (Number(rawLength) > MAX_APPLICATION_REQUEST_BYTES) {
      throw new ApplicationHttpError(413, 'PAYLOAD_TOO_LARGE');
    }
  }

  const contentType = request.headers.get('Content-Type') ?? '';
  if (!/^multipart\/form-data\s*;.*\bboundary=/i.test(contentType)) {
    throw new ApplicationHttpError(400, 'INVALID_REQUEST');
  }
}

type ParsedMultipart = {
  form: FormData;
  payload: string;
  resume: File;
  portfolio: File | null;
  turnstileToken: string;
};

async function parseMultipart(request: Request, preparedForm?: FormData): Promise<ParsedMultipart> {
  validateDeclaredBodySize(request);
  const turnstileAlreadyVerified = preparedForm !== undefined;

  let form: FormData;
  try {
    form = preparedForm ?? await request.formData();
  } catch {
    throw new ApplicationHttpError(400, 'INVALID_REQUEST');
  }

  let parsedBytes = 0;
  for (const value of form.values()) {
    parsedBytes += typeof value === 'string'
      ? new TextEncoder().encode(value).byteLength
      : value.size;
    if (parsedBytes > MAX_APPLICATION_REQUEST_BYTES) {
      throw new ApplicationHttpError(413, 'PAYLOAD_TOO_LARGE');
    }
  }

  if (
    form.getAll('payload').length !== 1
    || form.getAll('resume').length !== 1
    || form.getAll('portfolio').length > 1
    || (!turnstileAlreadyVerified && form.getAll('cf-turnstile-response').length !== 1)
    || (turnstileAlreadyVerified && form.getAll('cf-turnstile-response').length > 0)
  ) {
    throw new ApplicationHttpError(400, 'INVALID_REQUEST');
  }

  const payload = form.get('payload');
  const resume = form.get('resume');
  const portfolio = form.get('portfolio');
  const turnstileToken = form.get('cf-turnstile-response');
  if (
    typeof payload !== 'string'
    || !payload
    || new TextEncoder().encode(payload).byteLength > MAX_APPLICATION_PAYLOAD_BYTES
    || !isFile(resume)
    || (portfolio !== null && !isFile(portfolio))
    || (!turnstileAlreadyVerified && (
      typeof turnstileToken !== 'string'
      || !turnstileToken.trim()
    ))
  ) {
    throw new ApplicationHttpError(400, 'INVALID_REQUEST');
  }

  return {
    form,
    payload,
    resume,
    portfolio,
    turnstileToken: typeof turnstileToken === 'string' ? turnstileToken : '',
  };
}

function normalizedInput(payload: string) {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    throw new ApplicationHttpError(400, 'INVALID_REQUEST');
  }
  if (typeof value === 'object' && value !== null && 'email' in value && typeof value.email === 'string') {
    value = { ...value, email: value.email.trim() };
  }
  const parsed = applicationSchema.safeParse(value);
  if (!parsed.success) throw new ApplicationHttpError(400, 'INVALID_REQUEST');
  return parsed.data;
}

async function deriveActorHash(secret: string, email: string, request: Request) {
  const connectingIp = request.headers.get('CF-Connecting-IP')?.trim().toLowerCase() ?? '';
  if (!connectingIp || connectingIp.length > 128) {
    throw new ApplicationHttpError(400, 'INVALID_REQUEST');
  }
  const normalizedEmail = email.trim().toLowerCase();
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${normalizedEmail}:${connectingIp}`),
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function mappedDomainError(error: ApplicationDomainError) {
  switch (error.code) {
    case 'INVALID_APPLICATION':
    case 'FILE_REQUIRED':
    case 'FILE_INVALID':
      return errorResponse(400, 'INVALID_REQUEST');
    case 'FILE_TOO_LARGE':
      return errorResponse(413, 'PAYLOAD_TOO_LARGE');
    case 'RATE_LIMITED':
      return errorResponse(429, 'RATE_LIMITED');
    case 'POLICY_UNAVAILABLE':
    case 'SUBMISSION_UNAVAILABLE':
      return errorResponse(503, 'UNAVAILABLE');
    case 'APPLICATION_SAVE_FAILED':
      return errorResponse(500, 'SUBMISSION_FAILED');
  }
}

function mappedHttpError(error: unknown) {
  if (error instanceof ApplicationHttpError) {
    return errorResponse(error.status, error.responseCode);
  }
  if (error instanceof ApplicationDomainError) return mappedDomainError(error);
  return errorResponse(500, 'SUBMISSION_FAILED');
}

export async function handleApplicationHttpRequest(
  request: Request,
  env: ApplicationFunctionEnv,
  dependencies: AdapterDependencies = defaultDependencies,
  preparedForm?: FormData,
): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed();
  const config = parseRuntimeConfig(env);
  if (!config) return errorResponse(503, 'UNAVAILABLE');

  try {
    const multipart = await parseMultipart(request, preparedForm);
    const input = normalizedInput(multipart.payload);
    const actorHash = await deriveActorHash(config.submissionHashSecret, input.email, request);
    const repository = dependencies.createRepository({
      supabaseUrl: config.supabaseUrl,
      supabaseServiceRoleKey: config.supabaseServiceRoleKey,
    });
    const result = await dependencies.createApplication({
      input,
      actorHash,
      resume: multipart.resume,
      portfolio: multipart.portfolio,
    }, repository, config.policy);
    return jsonResponse({ receiptCode: result.receiptCode }, 201);
  } catch (error) {
    return mappedHttpError(error);
  }
}

export async function applicationTurnstileMiddleware(
  context: ApplicationPagesContext,
): Promise<Response> {
  if (context.request.method !== 'POST') return methodNotAllowed();
  const config = parseRuntimeConfig(context.env);
  if (!config) return errorResponse(503, 'UNAVAILABLE');

  try {
    const multipart = await parseMultipart(context.request.clone());
    const token = multipart.turnstileToken;
    multipart.form.delete('cf-turnstile-response');
    context.data.applicationForm = multipart.form;
    const plugin = turnstilePlugin({
      secret: config.turnstileSecretKey,
      response: token,
      remoteip: context.request.headers.get('CF-Connecting-IP') ?? undefined,
      onError: async () => errorResponse(400, 'INVALID_REQUEST'),
    }) as unknown as (pluginContext: ApplicationPagesContext) => Promise<Response>;
    return await plugin(context);
  } catch (error) {
    if (error instanceof ApplicationHttpError) return mappedHttpError(error);
    return errorResponse(503, 'UNAVAILABLE');
  }
}

async function applicationRequestHandler(context: ApplicationPagesContext) {
  return handleApplicationHttpRequest(
    context.request,
    context.env,
    defaultDependencies,
    context.data.applicationForm,
  );
}

export const onRequest = [applicationTurnstileMiddleware, applicationRequestHandler];
