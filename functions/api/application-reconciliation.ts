import { createSupabaseApplicationRepository } from '../../src/server/application/repository';
import { processApplicationFileReconciliations, type ApplicationReconciliationRepository } from '../../src/server/application/reconciliation';

export type ReconciliationFunctionEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RECONCILIATION_SECRET?: string;
};

type RuntimeConfig = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  reconciliationSecret: string;
};

export type ReconciliationAdapterDependencies = {
  createRepository(config: { supabaseUrl: string; supabaseServiceRoleKey: string }): ApplicationReconciliationRepository;
  processReconciliations(repository: ApplicationReconciliationRepository): Promise<{
    claimed: number;
    resolved: number;
    deferred: number;
    retried: number;
    dead: number;
  }>;
};

const defaultDependencies: ReconciliationAdapterDependencies = {
  createRepository: createSupabaseApplicationRepository,
  processReconciliations: processApplicationFileReconciliations,
};

function response(body: unknown, status: number, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'no-store');
  return Response.json(body, { status, headers: responseHeaders });
}

function error(status: number, code: 'INVALID_REQUEST' | 'UNAUTHORIZED' | 'UNAVAILABLE') {
  const message = code === 'UNAUTHORIZED'
    ? '인증되지 않은 요청입니다.'
    : code === 'UNAVAILABLE'
      ? '현재 내부 작업을 실행할 수 없습니다.'
      : '요청 내용을 확인해주세요.';
  return response({ error: { code, message } }, status);
}

function runtimeConfig(env: ReconciliationFunctionEnv): RuntimeConfig | null {
  const supabaseUrl = env.SUPABASE_URL?.trim() ?? '';
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  const reconciliationSecret = env.RECONCILIATION_SECRET ?? '';
  try {
    const parsed = new URL(supabaseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol) || !supabaseServiceRoleKey || !reconciliationSecret) return null;
  } catch {
    return null;
  }
  return { supabaseUrl, supabaseServiceRoleKey, reconciliationSecret };
}

function timingSafeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return mismatch === 0;
}

export async function handleApplicationReconciliationRequest(
  request: Request,
  env: ReconciliationFunctionEnv,
  dependencies: ReconciliationAdapterDependencies = defaultDependencies,
): Promise<Response> {
  if (request.method !== 'POST') return response({ error: { code: 'INVALID_REQUEST', message: '요청 내용을 확인해주세요.' } }, 405, { Allow: 'POST' });
  const config = runtimeConfig(env);
  if (!config) return error(503, 'UNAVAILABLE');
  const suppliedSecret = request.headers.get('X-Reconciliation-Secret') ?? '';
  if (!timingSafeEqual(suppliedSecret, config.reconciliationSecret)) return error(401, 'UNAUTHORIZED');
  try {
    const repository = dependencies.createRepository({
      supabaseUrl: config.supabaseUrl,
      supabaseServiceRoleKey: config.supabaseServiceRoleKey,
    });
    return response(await dependencies.processReconciliations(repository), 200);
  } catch {
    return error(503, 'UNAVAILABLE');
  }
}

export const onRequest = async (context: { request: Request; env: ReconciliationFunctionEnv }) => (
  handleApplicationReconciliationRequest(context.request, context.env)
);
