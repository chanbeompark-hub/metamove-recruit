# Application-file reconciliation operations

This repository includes a protected Pages Function at `POST /api/application-reconciliation` and an optional Cloudflare Worker cron hook. Neither is deployed or scheduled by this change.

The request must carry `X-Reconciliation-Secret`, using a value stored separately from `SUBMISSION_HASH_SECRET`, Turnstile, and Supabase credentials. The endpoint accepts only `POST`, has no CORS policy, always uses `Cache-Control: no-store`, and returns aggregate queue counts only. It never returns application data, paths, receipt codes, or error detail.

## Before enabling a schedule

Set these Pages Function secrets in the deployment environment. Do not put their values in a TOML file, source file, or browser-exposed variable.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RECONCILIATION_SECRET`

Apply the Supabase migrations, including `0004_application_reconciliation_worker.sql`, and complete the live SQL checks listed below. The queue RPCs are service-role-only and lease jobs with `FOR UPDATE SKIP LOCKED` so multiple worker invocations can run safely.

Copy [wrangler.reconciliation.example.toml](/C:/Users/박찬범/Documents/ChatGPT/메타무브짐%20채용공고/.worktrees/metamove-implementation/wrangler.reconciliation.example.toml) to an operator-owned Worker configuration, then set its secrets with Wrangler:

```powershell
npx wrangler secret put RECONCILIATION_ENDPOINT
npx wrangler secret put RECONCILIATION_SECRET
npx wrangler deploy --config wrangler.reconciliation.toml
```

`RECONCILIATION_ENDPOINT` is the fully qualified deployed Pages URL ending in `/api/application-reconciliation`. The example invokes it every five minutes. Confirm the current Cloudflare plan limits, Cron Trigger availability, and deployment ownership before enabling it; this repository does not claim that a scheduler has been provisioned.

## Worker behavior and operational response

`graph_status_unknown` jobs are held for a one-minute grace period, then re-check the graph idempotency key. Only a committed graph with the queued job's same application ID resolves and retains every upload. A different application ID falls through to the per-path metadata guard, so only an old unreferenced object is removed and every referenced path is retained. Transient failures use a bounded exponential delay and become `dead` after five claimed attempts.

Only aggregate operational events are emitted: `application_reconciliation_enqueue_failed`, `application_reconciliation_transition_failed`, and `application_reconciliation_dead`, each with a code and count. The Cron hook also rejects its background task for a network failure or non-2xx endpoint response and emits only `application_reconciliation_cron_failed` with a code and HTTP status (`0` for network failures). Treat a dead-letter event as an operator action: inspect the protected service-role queue directly, correct the dependency failure, and deliberately requeue or resolve it. Do not paste raw application data, object paths, email addresses, idempotency keys, endpoint URLs, response bodies, or secrets into logs or tickets.

## Required live deployment checks

This workspace has no local Docker/Supabase runtime, so run these in an approved environment before accepting applicant uploads:

```powershell
npx supabase@2.116.0 db reset
npx supabase@2.116.0 test db supabase/tests/application_intake.sql
npx supabase@2.116.0 db lint --local --schema public,storage --level warning --fail-on error
npx supabase@2.116.0 db diff --from migrations --to local --schema public,storage
npx supabase@2.116.0 db reset
```
