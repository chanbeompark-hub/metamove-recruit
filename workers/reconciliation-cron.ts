type ReconciliationCronEnv = {
  RECONCILIATION_ENDPOINT: string;
  RECONCILIATION_SECRET: string;
};

type CronExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

async function triggerReconciliation(env: ReconciliationCronEnv) {
  try {
    await fetch(env.RECONCILIATION_ENDPOINT, {
      method: 'POST',
      headers: { 'X-Reconciliation-Secret': env.RECONCILIATION_SECRET },
      cache: 'no-store',
    });
  } catch {
    // The protected endpoint and reconciliation worker record only safe,
    // aggregate operational failure codes. Do not log secrets or paths here.
  }
}

export default {
  scheduled(_event: unknown, env: ReconciliationCronEnv, context: CronExecutionContext) {
    context.waitUntil(triggerReconciliation(env));
  },
};
