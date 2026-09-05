-- A service-role worker owns this queue. The public API never receives its
-- rows, leases, storage paths, or error details.
alter table public.application_file_reconciliations
  add column available_at timestamptz not null default pg_catalog.clock_timestamp(),
  add column locked_at timestamptz,
  add column lock_token uuid;

alter table public.application_file_reconciliations
  drop constraint application_file_reconciliations_status_check,
  add constraint application_file_reconciliations_status_check
    check (status in ('pending', 'processing', 'resolved', 'dead')),
  add constraint application_file_reconciliations_lock_state_check check (
    (status = 'processing' and locked_at is not null and lock_token is not null)
    or (status <> 'processing' and locked_at is null and lock_token is null)
  ),
  add constraint application_file_reconciliations_error_code_check check (
    last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9_]{0,79}$'
  );

create index application_file_reconciliations_available_idx
on public.application_file_reconciliations (status, available_at, created_at, id)
where status = 'pending';

create or replace function public.enqueue_application_file_reconciliation(
  p_application_id uuid,
  p_idempotency_key uuid,
  p_paths text[],
  p_reason text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  path_value text;
  first_available_at timestamptz;
begin
  if p_application_id is null or p_idempotency_key is null
    or p_reason is null or p_reason not in ('cleanup_failed', 'graph_status_unknown')
    or p_paths is null or cardinality(p_paths) not between 1 and 2
    or cardinality(p_paths) is distinct from (select count(distinct value) from unnest(p_paths) values(value))
  then
    raise exception using errcode = '22023', message = 'invalid reconciliation request';
  end if;
  foreach path_value in array p_paths loop
    if path_value is null or path_value !~ ('^applications/' || p_application_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|doc|docx)$') then
      raise exception using errcode = '22023', message = 'invalid reconciliation request';
    end if;
  end loop;
  first_available_at := pg_catalog.clock_timestamp()
    + case when p_reason = 'graph_status_unknown' then interval '1 minute' else interval '0 seconds' end;
  insert into public.application_file_reconciliations (
    application_id, idempotency_key, storage_paths, reason, available_at
  ) values (
    p_application_id, p_idempotency_key, p_paths, p_reason, first_available_at
  );
end;
$$;
alter function public.enqueue_application_file_reconciliation(uuid, uuid, text[], text) owner to postgres;
revoke all on function public.enqueue_application_file_reconciliation(uuid, uuid, text[], text) from public, anon, authenticated;
grant execute on function public.enqueue_application_file_reconciliation(uuid, uuid, text[], text) to service_role;

create or replace function public.claim_application_file_reconciliations(
  p_limit integer default 25,
  p_lease_seconds integer default 300
)
returns table (
  id uuid,
  application_id uuid,
  idempotency_key uuid,
  storage_paths text[],
  reason text,
  attempt_count integer,
  created_at timestamptz,
  lock_token uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit not between 1 and 25
    or p_lease_seconds is null or p_lease_seconds not between 60 and 900
  then
    raise exception using errcode = '22023', message = 'invalid reconciliation claim';
  end if;

  update public.application_file_reconciliations
  set status = 'pending', locked_at = null, lock_token = null, available_at = pg_catalog.clock_timestamp()
  where status = 'processing'
    and locked_at <= pg_catalog.clock_timestamp() - pg_catalog.make_interval(secs => p_lease_seconds);

  return query
  with candidates as (
    select queue.id
    from public.application_file_reconciliations queue
    where queue.status = 'pending'
      and queue.available_at <= pg_catalog.clock_timestamp()
    order by queue.available_at, queue.created_at, queue.id
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.application_file_reconciliations queue
    set status = 'processing',
      locked_at = pg_catalog.clock_timestamp(),
      lock_token = pg_catalog.gen_random_uuid(),
      attempt_count = queue.attempt_count + 1
    from candidates
    where queue.id = candidates.id
    returning queue.id, queue.application_id, queue.idempotency_key, queue.storage_paths,
      queue.reason, queue.attempt_count, queue.created_at, queue.lock_token
  )
  select claimed.id, claimed.application_id, claimed.idempotency_key, claimed.storage_paths,
    claimed.reason, claimed.attempt_count, claimed.created_at, claimed.lock_token
  from claimed;
end;
$$;
alter function public.claim_application_file_reconciliations(integer, integer) owner to postgres;
revoke all on function public.claim_application_file_reconciliations(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_application_file_reconciliations(integer, integer) to service_role;

create or replace function public.complete_application_file_reconciliation(
  p_id uuid,
  p_lock_token uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  completed_count integer;
begin
  if p_id is null or p_lock_token is null then
    raise exception using errcode = '22023', message = 'invalid reconciliation completion';
  end if;
  update public.application_file_reconciliations
  set status = 'resolved', locked_at = null, lock_token = null, last_error_code = null
  where id = p_id and status = 'processing' and lock_token = p_lock_token;
  get diagnostics completed_count = row_count;
  return completed_count = 1;
end;
$$;
alter function public.complete_application_file_reconciliation(uuid, uuid) owner to postgres;
revoke all on function public.complete_application_file_reconciliation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_application_file_reconciliation(uuid, uuid) to service_role;

create or replace function public.retry_application_file_reconciliation(
  p_id uuid,
  p_lock_token uuid,
  p_error_code text,
  p_delay_seconds integer,
  p_mark_dead boolean
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  transitioned_count integer;
begin
  if p_id is null or p_lock_token is null
    or p_error_code is null or p_error_code !~ '^[A-Z][A-Z0-9_]{0,79}$'
    or p_delay_seconds is null or p_delay_seconds not between 0 and 3600
    or p_mark_dead is null
  then
    raise exception using errcode = '22023', message = 'invalid reconciliation retry';
  end if;
  update public.application_file_reconciliations
  set status = case when p_mark_dead then 'dead' else 'pending' end,
    locked_at = null,
    lock_token = null,
    available_at = case when p_mark_dead then available_at else pg_catalog.clock_timestamp() + pg_catalog.make_interval(secs => p_delay_seconds) end,
    last_error_code = p_error_code
  where id = p_id and status = 'processing' and lock_token = p_lock_token;
  get diagnostics transitioned_count = row_count;
  return transitioned_count = 1;
end;
$$;
alter function public.retry_application_file_reconciliation(uuid, uuid, text, integer, boolean) owner to postgres;
revoke all on function public.retry_application_file_reconciliation(uuid, uuid, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.retry_application_file_reconciliation(uuid, uuid, text, integer, boolean) to service_role;

create or replace function public.is_application_file_reconciliation_path_referenced(
  p_application_id uuid,
  p_idempotency_key uuid,
  p_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_application_id is not null
    and p_idempotency_key is not null
    and p_path is not null
    and exists (
      select 1
      from public.application_files files
      join public.applications applications on applications.id = files.application_id
      where files.storage_path = p_path
    );
$$;
alter function public.is_application_file_reconciliation_path_referenced(uuid, uuid, text) owner to postgres;
revoke all on function public.is_application_file_reconciliation_path_referenced(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.is_application_file_reconciliation_path_referenced(uuid, uuid, text) to service_role;

revoke all privileges on table public.application_file_reconciliations from public, anon, authenticated;
grant all privileges on table public.application_file_reconciliations to service_role;
