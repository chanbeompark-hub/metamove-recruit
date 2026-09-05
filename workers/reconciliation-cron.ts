type ReconciliationCronEnv = {
  RECONCILIATION_ENDPOINT: string;
  RECONCILIATION_SECRET: string;
};

type CronExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

async function triggerReconciliation(env: ReconciliationCronEnv) {
  let response: Response;
  try {
    response = await fetch(env.RECONCILIATION_ENDPOINT, {
      method: 'POST',
      headers: { 'X-Reconciliation-Secret': env.RECONCILIATION_SECRET },
      cache: 'no-store',
    });
  } catch {
    globalThis.console.error('application_reconciliation_cron_failed', {
      code: 'RECONCILIATION_CRON_NETWORK_FAILURE',
      status: 0,
    });
    throw new Error('reconciliation cron network failed');
  }
  if (!response.ok) {
    globalThis.console.error('application_reconciliation_cron_failed', {
      code: 'RECONCILIATION_CRON_HTTP_FAILURE',
      status: response.status,
    });
    throw new Error('reconciliation cron request failed');
  }
}

export default {
  scheduled(_event: unknown, env: ReconciliationCronEnv, context: CronExecutionContext) {
    context.waitUntil(triggerReconciliation(env));
  },
};
