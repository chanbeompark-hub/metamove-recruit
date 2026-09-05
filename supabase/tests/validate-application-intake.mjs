import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const migrationUrl = new URL('../migrations/0001_application_intake.sql', import.meta.url);
const graphMigrationUrl = new URL('../migrations/0002_application_graph_rpc.sql', import.meta.url);
const hardeningMigrationUrl = new URL('../migrations/0003_application_submission_hardening.sql', import.meta.url);
const reconciliationMigrationUrl = new URL('../migrations/0004_application_reconciliation_worker.sql', import.meta.url);
const pgTapUrl = new URL('./application_intake.sql', import.meta.url);
const configUrl = new URL('../config.toml', import.meta.url);

function stripComments(sql) {
  let result = '';
  let index = 0;
  let state = 'code';
  let dollarTag = '';

  while (index < sql.length) {
    const current = sql[index];
    const next = sql[index + 1];

    if (state === 'line-comment') {
      if (current === '\n') {
        result += current;
        state = 'code';
      }
      index += 1;
      continue;
    }

    if (state === 'block-comment') {
      if (current === '*' && next === '/') {
        state = 'code';
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    if (state === 'single-quote') {
      result += current;
      if (current === "'" && next === "'") {
        result += next;
        index += 2;
      } else {
        if (current === "'") state = 'code';
        index += 1;
      }
      continue;
    }

    if (state === 'dollar-quote') {
      if (sql.startsWith(dollarTag, index)) {
        result += dollarTag;
        index += dollarTag.length;
        state = 'code';
      } else {
        result += current;
        index += 1;
      }
      continue;
    }

    if (current === '-' && next === '-') {
      state = 'line-comment';
      index += 2;
      continue;
    }
    if (current === '/' && next === '*') {
      state = 'block-comment';
      index += 2;
      continue;
    }
    if (current === "'") {
      result += current;
      state = 'single-quote';
      index += 1;
      continue;
    }
    if (current === '$') {
      const match = sql.slice(index).match(/^\$[a-zA-Z_][a-zA-Z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        result += dollarTag;
        index += dollarTag.length;
        state = 'dollar-quote';
        continue;
      }
    }

    result += current;
    index += 1;
  }

  return result;
}

function normalize(sql) {
  return stripComments(sql).toLowerCase().replace(/\s+/g, ' ').trim();
}

function extractCreateTableBody(sql, tableName) {
  const normalizedName = `create table public.${tableName}`;
  const start = sql.indexOf(normalizedName);
  if (start < 0) return null;

  const opening = sql.indexOf('(', start + normalizedName.length);
  if (opening < 0) return null;

  let depth = 0;
  let state = 'code';
  let dollarTag = '';

  for (let index = opening; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];

    if (state === 'single-quote') {
      if (current === "'" && next === "'") {
        index += 1;
      } else if (current === "'") {
        state = 'code';
      }
      continue;
    }
    if (state === 'dollar-quote') {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1;
        state = 'code';
      }
      continue;
    }
    if (current === "'") {
      state = 'single-quote';
      continue;
    }
    if (current === '$') {
      const match = sql.slice(index).match(/^\$[a-zA-Z_][a-zA-Z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        index += dollarTag.length - 1;
        state = 'dollar-quote';
        continue;
      }
    }
    if (current === '(') depth += 1;
    if (current === ')') {
      depth -= 1;
      if (depth === 0) return sql.slice(opening + 1, index);
    }
  }

  return null;
}

function requireMatch(failures, value, pattern, message) {
  if (!pattern.test(value)) failures.push(message);
}

const publicTables = [
  'applications',
  'application_answers',
  'application_files',
  'admin_profiles',
  'application_reviews',
  'application_status_history',
  'submission_rate_limits',
  'application_file_reconciliations',
];
const cascadeTables = [
  'application_answers',
  'application_files',
  'application_reviews',
  'application_status_history',
];

let migration;
let graphMigration;
let hardeningMigration;
let reconciliationMigration;
let pgTap;
let config;
try {
  migration = readFileSync(migrationUrl, 'utf8');
  graphMigration = readFileSync(graphMigrationUrl, 'utf8');
  hardeningMigration = readFileSync(hardeningMigrationUrl, 'utf8');
  reconciliationMigration = readFileSync(reconciliationMigrationUrl, 'utf8');
  pgTap = readFileSync(pgTapUrl, 'utf8');
  config = readFileSync(configUrl, 'utf8');
} catch (error) {
  globalThis.console.error(`STATIC FAIL: ${error.message}`);
  globalThis.console.error('No PostgreSQL execution was performed.');
  process.exit(1);
}

const sql = normalize(`${migration}\n${graphMigration}\n${hardeningMigration}\n${reconciliationMigration}`);
const pgTapSql = normalize(pgTap);
const failures = [];

if (hardeningMigration.includes('\\\\.')) {
  failures.push('application storage-path validation over-escapes the file-extension separator');
}

requireMatch(
  failures,
  sql,
  /create type public\.application_status as enum \(\s*'new',\s*'reviewing',\s*'interview',\s*'accepted',\s*'rejected'\s*\)/,
  'missing the exact five-value application_status enum',
);

for (const table of publicTables) {
  const body = extractCreateTableBody(sql, table);
  if (!body) {
    failures.push(`missing public.${table}`);
    continue;
  }
  requireMatch(
    failures,
    body,
    /\b(id|user_id) uuid primary key\b/,
    `public.${table} must have a UUID primary key`,
  );
  requireMatch(
    failures,
    sql,
    new RegExp(`alter table public\\.${table} enable row level security`),
    `RLS is not enabled on public.${table}`,
  );
}

for (const table of cascadeTables) {
  const body = extractCreateTableBody(sql, table) ?? '';
  requireMatch(
    failures,
    body,
    /application_id uuid not null references public\.applications \(id\) on delete cascade/,
    `public.${table} is missing its cascading application foreign key`,
  );
}

const answers = extractCreateTableBody(sql, 'application_answers') ?? '';
requireMatch(failures, answers, /answer_text text/, 'answer_text must be stored separately');
requireMatch(failures, answers, /answer_json jsonb/, 'answer_json must be stored separately');
for (const key of ['career_history', 'motivation', 'strengths', 'goals']) {
  requireMatch(failures, answers, new RegExp(`'${key}'`), `missing canonical answer key ${key}`);
}
requireMatch(
  failures,
  answers,
  /answer_key = 'career_history'.*answer_text is null.*answer_json is not null/,
  'career history is not constrained to answer_json',
);
requireMatch(
  failures,
  answers,
  /answer_key in \('motivation', 'strengths', 'goals'\).*answer_text is not null.*answer_json is null/,
  'essays are not constrained to answer_text',
);
requireMatch(
  failures,
  sql,
  /create or replace function public\.is_valid_trimmed_text_set\(/,
  'canonical specialty/certification set validation is missing',
);
requireMatch(
  failures,
  sql,
  /create or replace function public\.is_valid_career_history\(/,
  'canonical career-history JSON validation is missing',
);
requireMatch(
  failures,
  sql,
  /create or replace function public\.assert_application_career_graph\(/,
  'transaction-boundary career graph validation is missing',
);
requireMatch(
  failures,
  sql,
  /create constraint trigger enforce_application_career_graph_from_applications .* on public\.applications deferrable initially deferred/,
  'applications are missing a deferred career graph constraint trigger',
);
requireMatch(
  failures,
  sql,
  /create constraint trigger enforce_application_career_graph_from_answers .* on public\.application_answers deferrable initially deferred/,
  'application answers are missing a deferred career graph constraint trigger',
);

const adminProfiles = extractCreateTableBody(sql, 'admin_profiles') ?? '';
requireMatch(failures, adminProfiles, /\bactive boolean not null/, 'admin_profiles.active is missing');

const reviews = extractCreateTableBody(sql, 'application_reviews') ?? '';
requireMatch(failures, reviews, /admin_id uuid not null/, 'application_reviews.admin_id is missing');
requireMatch(failures, reviews, /\brating smallint/, 'application_reviews.rating is missing');
requireMatch(failures, reviews, /\bnote text/, 'application_reviews.note is missing');
requireMatch(failures, reviews, /\bnext_action_at timestamptz/, 'application_reviews.next_action_at is missing');

const statusHistory = extractCreateTableBody(sql, 'application_status_history') ?? '';
requireMatch(failures, statusHistory, /admin_id uuid not null/, 'application_status_history.admin_id is missing');
requireMatch(failures, statusHistory, /\breason text/, 'application_status_history.reason is missing');

const rateLimits = extractCreateTableBody(sql, 'submission_rate_limits') ?? '';
requireMatch(failures, rateLimits, /actor_hash text not null/, 'rate limits must store actor_hash');
requireMatch(failures, rateLimits, /attempted_at timestamptz not null/, 'rate limits must store attempted_at');
if (/\b(ip|ip_address|raw_ip|email)\s+/.test(rateLimits)) {
  failures.push('rate limits include a raw identifier column');
}

requireMatch(
  failures,
  sql,
  /create or replace function public\.is_active_admin\(\).*security definer.*set search_path = ''.*auth\.uid\(\).*admin_profiles.*active/s,
  'is_active_admin must be SECURITY DEFINER with an empty fixed search_path and auth.uid()',
);
requireMatch(
  failures,
  sql,
  /create or replace function public\.consume_submission_quota\(.*security definer.*set search_path = ''.*p_maximum is null.*p_window_seconds is null.*pg_advisory_xact_lock.*delete from public\.submission_rate_limits.*select count\(\*\).*insert into public\.submission_rate_limits/s,
  'quota RPC must lock, clean, count, and record atomically with a fixed search_path',
);
requireMatch(
  failures,
  sql,
  /revoke all on function public\.consume_submission_quota\(text, integer, integer\) from public, anon, authenticated/,
  'quota RPC is not revoked from public, anon, and authenticated',
);
requireMatch(
  failures,
  sql,
  /grant execute on function public\.consume_submission_quota\(text, integer, integer\) to service_role/,
  'quota RPC is not granted only to service_role',
);
requireMatch(
  failures,
  sql,
  /create or replace function public\.insert_application_graph\(p_graph jsonb\).*security definer.*set search_path = ''.*insert into public\.applications.*insert into public\.application_answers.*public\.assert_application_career_graph.*insert into public\.application_files/s,
  'application graph RPC must atomically insert the parent, answers, validated career graph, and files with a fixed search_path',
);
requireMatch(
  failures,
  sql,
  /revoke all on function public\.insert_application_graph\(jsonb\) from public, anon, authenticated/,
  'application graph RPC is not revoked from public, anon, and authenticated',
);
requireMatch(
  failures,
  sql,
  /grant execute on function public\.insert_application_graph\(jsonb\) to service_role/,
  'application graph RPC is not granted only to service_role',
);
requireMatch(failures, sql, /applications_idempotency_key_key unique \(idempotency_key\)/, 'application idempotency unique constraint is missing');
requireMatch(failures, sql, /security_status text not null default 'quarantined'.*application_files_scan_state/s, 'quarantine and scan state metadata is missing');
requireMatch(failures, sql, /jsonb_typeof\(p_graph\) is distinct from 'object'.*jsonb_object_keys\(p_graph\).*jsonb_typeof\(application_value\) is distinct from 'object'/s, 'graph RPC is missing explicit JSON type and key validation');
requireMatch(failures, sql, /answer_key' = 'motivation'.*answer_key' = 'strengths'.*answer_key' = 'goals'.*answer_key' = 'career_history'/s, 'graph RPC is missing exact canonical answer counts');
requireMatch(failures, sql, /security_status' is distinct from 'quarantined'/, 'graph RPC is missing quarantine validation');
requireMatch(failures, sql, /file_kind' = 'resume'.*file_kind' = 'portfolio'/s, 'graph RPC is missing exact file-kind counts');
requireMatch(failures, sql, /pg_advisory_xact_lock.*idempotency_value.*return query select existing_receipt, false/s, 'graph RPC does not serialize and safely replay idempotency keys');
requireMatch(failures, sql, /create or replace function public\.find_application_by_idempotency\(.*security definer.*revoke all on function public\.find_application_by_idempotency\(uuid\) from public, anon, authenticated.*grant execute on function public\.find_application_by_idempotency\(uuid\) to service_role/s, 'idempotency lookup is not service-role-only');
requireMatch(failures, sql, /create or replace function public\.find_application_by_idempotency\(p_idempotency_key uuid\)\s*returns table\s*\(\s*application_id uuid,\s*receipt_code text\s*\)/s, 'idempotency lookup does not return the authoritative application identity and receipt');
requireMatch(failures, sql, /create or replace function public\.enqueue_application_file_reconciliation\(.*security definer.*application_file_reconciliations.*revoke all on function public\.enqueue_application_file_reconciliation.*from public, anon, authenticated/s, 'durable reconciliation RPC is missing or exposed');
requireMatch(failures, sql, /create index submission_rate_limits_attempted_at_idx.*attempted_at/s, 'global attempted_at retention index is missing');
requireMatch(failures, sql, /create or replace function public\.purge_submission_rate_limits\(.*limit p_limit.*for update skip locked.*grant execute on function public\.purge_submission_rate_limits.*to service_role/s, 'bounded service-only rate retention purge is missing');
requireMatch(failures, sql, /pg_available_extensions.*pg_cron.*purge-application-submission-rate-limits/s, 'conditional pg_cron retention schedule is missing');
requireMatch(failures, sql, /revoke all privileges on table public\.application_file_reconciliations from public, anon, authenticated/, 'reconciliation queue privileges are exposed');
requireMatch(failures, sql, /alter table public\.application_file_reconciliations.*available_at timestamptz not null.*locked_at timestamptz.*lock_token uuid.*status.*'dead'/s, 'reconciliation queue is missing availability, lease, or dead-letter state');
requireMatch(failures, sql, /create or replace function public\.claim_application_file_reconciliations\(.*security definer.*set search_path = ''.*for update skip locked.*lock_token.*attempt_count =.*\+ 1.*revoke all on function public\.claim_application_file_reconciliations.*from public, anon, authenticated.*grant execute on function public\.claim_application_file_reconciliations.*to service_role/s, 'reconciliation claim RPC is not a bounded service-only SKIP LOCKED lease');
requireMatch(failures, sql, /create or replace function public\.complete_application_file_reconciliation\(.*security definer.*set search_path = ''.*status = 'resolved'.*p_lock_token.*revoke all on function public\.complete_application_file_reconciliation.*from public, anon, authenticated.*grant execute on function public\.complete_application_file_reconciliation.*to service_role/s, 'reconciliation completion RPC is missing a service-only lease guard');
requireMatch(failures, sql, /create or replace function public\.retry_application_file_reconciliation\((?=[\s\S]*?security definer)(?=[\s\S]*?set search_path = '')(?=[\s\S]*?available_at)(?=[\s\S]*?p_mark_dead)(?=[\s\S]*?then 'dead')[\s\S]*?revoke all on function public\.retry_application_file_reconciliation[\s\S]*?from public, anon, authenticated[\s\S]*?grant execute on function public\.retry_application_file_reconciliation[\s\S]*?to service_role/s, 'reconciliation retry/dead-letter RPC is missing or exposed');
requireMatch(failures, sql, /create or replace function public\.is_application_file_reconciliation_path_referenced\(.*security definer.*set search_path = ''.*application_files.*applications.*revoke all on function public\.is_application_file_reconciliation_path_referenced.*from public, anon, authenticated.*grant execute on function public\.is_application_file_reconciliation_path_referenced.*to service_role/s, 'reconciliation storage-path reference guard is missing or exposed');
requireMatch(
  failures,
  sql,
  /insert into storage\.buckets.*'application-files'.*false.*10485760/s,
  'private application-files bucket or 10 MiB limit is missing',
);
requireMatch(
  failures,
  sql,
  /revoke all privileges on table storage\.buckets, storage\.objects from public, anon, authenticated/,
  'storage privileges are not explicitly revoked from public, anon, and authenticated',
);
requireMatch(
  failures,
  sql,
  /revoke all privileges on table public\.applications, public\.application_answers, public\.application_files, public\.admin_profiles, public\.application_reviews, public\.application_status_history, public\.submission_rate_limits from public, anon, authenticated/,
  'application table privileges are not explicitly revoked from public, anon, and authenticated',
);
if (/create policy .* on storage\.objects .* to authenticated/.test(sql)) {
  failures.push('authenticated direct storage policy must not exist');
}
if (/grant .*storage\.objects.* to authenticated/.test(sql)) {
  failures.push('authenticated direct storage grant must not exist');
}
if (/create policy .* on storage\.objects/.test(sql) && !/bucket_id = 'application-files'/.test(sql)) {
  failures.push('every storage.objects policy must include the application-files bucket predicate');
}
if (/grant (insert|update|delete)\b.* on public\..* to authenticated/.test(sql)) {
  failures.push('authenticated table access must be read-only');
}
if (/create policy .* on public\..* for (insert|update|delete) to authenticated/.test(sql)) {
  failures.push('authenticated mutation policies must not exist before the atomic admin RPC');
}

for (const [policy, table, operation] of [
  ['active admins can read applications', 'applications', 'select'],
  ['active admins can read application answers', 'application_answers', 'select'],
  ['active admins can read application file metadata', 'application_files', 'select'],
  ['active admins can read admin profiles', 'admin_profiles', 'select'],
  ['active admins can read reviews', 'application_reviews', 'select'],
  ['active admins can read status history', 'application_status_history', 'select'],
]) {
  requireMatch(
    failures,
    sql,
    new RegExp(
      `create policy "${policy}" on public\\.${table} for ${operation} to authenticated .*public\\.is_active_admin\\(\\)`,
    ),
    `missing or unguarded admin policy: ${policy}`,
  );
}

for (const table of ['applications', 'application_answers', 'application_files', 'admin_profiles', 'application_reviews']) {
  requireMatch(
    failures,
    sql,
    new RegExp(`create trigger set_${table}_updated_at .* on public\\.${table}`),
    `public.${table} is missing updated_at trigger handling`,
  );
}

requireMatch(
  failures,
  config.toLowerCase(),
  /auto_expose_new_tables\s*=\s*false/,
  'local API config must not auto-grant new public objects',
);

requireMatch(
  failures,
  pgTapSql,
  /application_file_reconciliations'.*every public application table has a uuid primary key.*application_file_reconciliations'.*rls is enabled on every public application table/s,
  'pgTAP does not include reconciliation queue primary-key and RLS coverage',
);
requireMatch(
  failures,
  pgTapSql,
  /has_function_privilege\('service_role', 'public\.find_application_by_idempotency\(uuid\)'.*has_function_privilege\('service_role', 'public\.enqueue_application_file_reconciliation\(uuid,uuid,text\[\],text\)'.*has_function_privilege\('service_role', 'public\.purge_submission_rate_limits\(timestamptz,integer\)'/s,
  'pgTAP does not verify service-only hardening RPC privileges',
);
requireMatch(
  failures,
  pgTapSql,
  /receipt_code = 'mmg-00000000000000000000000000000001'\), 1::bigint, 'atomic graph rpc inserts one application'.*where application_id = '30000000-0000-4000-8000-000000000001'.*3::bigint, 'atomic graph rpc inserts its answers'/s,
  'pgTAP graph success expectations do not assert one parent and all three essays',
);
requireMatch(
  failures,
  pgTapSql,
  /same idempotency key replays without another insert.*graph rejects a missing top-level key.*graph rejects a wrong json type.*graph rejects empty and incomplete essays.*graph rejects a missing resume.*graph rejects a path outside the application namespace/s,
  'pgTAP is missing graph idempotency, exact-shape, cardinality, or application-path negatives',
);
requireMatch(
  failures,
  pgTapSql,
  /idempotency lookup returns the authoritative application identity and receipt/s,
  'pgTAP does not prove the lookup returns both application identity and receipt',
);
requireMatch(
  failures,
  pgTapSql,
  /forced test file failure.*file insert failure rolls back the application parent.*file insert failure rolls back application answers/s,
  'pgTAP is missing a post-parent graph failure rollback assertion',
);
requireMatch(
  failures,
  pgTapSql,
  /global rate-limit purge deletes at most the requested batch size.*bounded purge leaves the next old row for a later batch.*reconciliation rpc records one durable pending cleanup item/s,
  'pgTAP is missing bounded global purge or durable reconciliation behavior',
);
requireMatch(
  failures,
  pgTapSql,
  /bounded reconciliation claim leases one available job.*a second claim cannot receive the first worker lease.*a reconciliation completion rejects a mismatched lease token.*expired reconciliation lease becomes claimable by one later worker.*worker retry releases a valid lease into a delayed pending state/s,
  'pgTAP is missing reconciliation claim concurrency, lease, or retry semantics',
);

if (failures.length > 0) {
  globalThis.console.error('STATIC FAIL: application intake migration is structurally incomplete:');
  for (const failure of failures) globalThis.console.error(`- ${failure}`);
  globalThis.console.error(`Checked ${fileURLToPath(migrationUrl)}`);
  globalThis.console.error('No PostgreSQL execution was performed. Live reset, pgTAP, and database lint remain required.');
  process.exit(1);
}

globalThis.console.log(`STATIC PASS: ${publicTables.length} tables, RLS/grants, admin guard, private storage, atomic quota/graph RPCs, and hardening pgTAP definitions detected.`);
globalThis.console.log('No PostgreSQL execution was performed. Live reset, pgTAP, and database lint remain required.');
