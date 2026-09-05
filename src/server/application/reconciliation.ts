import type { ApplicationRepository } from './types';

export type ReconciliationReason = 'cleanup_failed' | 'graph_status_unknown';
export type ReconciliationJob = {
  id: string;
  applicationId: string;
  idempotencyKey: string;
  paths: string[];
  reason: ReconciliationReason;
  attemptCount: number;
  createdAt: string;
  lockToken: string;
};

export type ApplicationReconciliationRepository = Pick<
  ApplicationRepository,
  'findApplicationByIdempotencyKey' | 'deleteFile'
> & {
  claimFileReconciliations(limit: number, leaseSeconds: number): Promise<ReconciliationJob[]>;
  completeFileReconciliation(jobId: string, lockToken: string): Promise<void>;
  retryFileReconciliation(input: {
    jobId: string;
    lockToken: string;
    errorCode: 'GRAPH_STATUS_GRACE' | 'RECONCILIATION_TRANSIENT_FAILURE';
    delaySeconds: number;
    markDead: boolean;
  }): Promise<void>;
  isApplicationFilePathReferenced(applicationId: string, idempotencyKey: string, path: string): Promise<boolean>;
};

export const RECONCILIATION_BATCH_LIMIT = 25;
export const RECONCILIATION_LEASE_SECONDS = 300;
export const RECONCILIATION_GRACE_MILLISECONDS = 60_000;
export const RECONCILIATION_MAX_ATTEMPTS = 5;

type ReconciliationResult = { claimed: number; resolved: number; deferred: number; retried: number; dead: number };
type ReconciliationOptions = {
  now?: Date;
  batchLimit?: number;
  leaseSeconds?: number;
  graceMilliseconds?: number;
};

function retryDelaySeconds(attemptCount: number) {
  return Math.min(3600, 30 * (2 ** Math.max(0, attemptCount - 1)));
}

function createdAtMilliseconds(createdAt: string) {
  const parsed = Date.parse(createdAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function retryOrMarkDead(
  repository: ApplicationReconciliationRepository,
  job: ReconciliationJob,
  result: ReconciliationResult,
  errorCode: 'GRAPH_STATUS_GRACE' | 'RECONCILIATION_TRANSIENT_FAILURE',
  delaySeconds: number,
) {
  const markDead = errorCode === 'RECONCILIATION_TRANSIENT_FAILURE' && job.attemptCount >= RECONCILIATION_MAX_ATTEMPTS;
  try {
    await repository.retryFileReconciliation({ jobId: job.id, lockToken: job.lockToken, errorCode, delaySeconds: markDead ? 0 : delaySeconds, markDead });
  } catch {
    globalThis.console.error('application_reconciliation_transition_failed', { code: 'RECONCILIATION_TRANSITION_FAILED', count: job.attemptCount });
    result.dead += 1;
    return;
  }
  if (markDead) {
    globalThis.console.error('application_reconciliation_dead', { code: 'RECONCILIATION_DEAD', count: job.attemptCount });
    result.dead += 1;
  } else if (errorCode === 'GRAPH_STATUS_GRACE') {
    result.deferred += 1;
  } else {
    result.retried += 1;
  }
}

async function processJob(
  repository: ApplicationReconciliationRepository,
  job: ReconciliationJob,
  result: ReconciliationResult,
  now: Date,
  graceMilliseconds: number,
) {
  if (job.reason === 'graph_status_unknown') {
    const remainingGraceMilliseconds = (createdAtMilliseconds(job.createdAt) + graceMilliseconds) - now.getTime();
    if (remainingGraceMilliseconds > 0) {
      await retryOrMarkDead(repository, job, result, 'GRAPH_STATUS_GRACE', Math.max(1, Math.ceil(remainingGraceMilliseconds / 1000)));
      return;
    }
    const committed = await repository.findApplicationByIdempotencyKey(job.idempotencyKey);
    if (committed?.applicationId === job.applicationId) {
      await repository.completeFileReconciliation(job.id, job.lockToken);
      result.resolved += 1;
      return;
    }
  }

  for (const path of job.paths) {
    if (await repository.isApplicationFilePathReferenced(job.applicationId, job.idempotencyKey, path)) continue;
    await repository.deleteFile(path);
  }
  await repository.completeFileReconciliation(job.id, job.lockToken);
  result.resolved += 1;
}

export async function processApplicationFileReconciliations(
  repository: ApplicationReconciliationRepository,
  options: ReconciliationOptions = {},
): Promise<ReconciliationResult> {
  const jobs = await repository.claimFileReconciliations(
    options.batchLimit ?? RECONCILIATION_BATCH_LIMIT,
    options.leaseSeconds ?? RECONCILIATION_LEASE_SECONDS,
  );
  const result: ReconciliationResult = { claimed: jobs.length, resolved: 0, deferred: 0, retried: 0, dead: 0 };
  const now = options.now ?? new Date();
  const graceMilliseconds = options.graceMilliseconds ?? RECONCILIATION_GRACE_MILLISECONDS;
  for (const job of jobs) {
    try {
      await processJob(repository, job, result, now, graceMilliseconds);
    } catch {
      await retryOrMarkDead(repository, job, result, 'RECONCILIATION_TRANSIENT_FAILURE', retryDelaySeconds(job.attemptCount));
    }
  }
  return result;
}
