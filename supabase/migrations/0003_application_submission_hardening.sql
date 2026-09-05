-- Format validation at intake is not malware scanning. Every new object remains
-- quarantined until a separate scanner marks it clean; future admin download
-- routes must refuse files unless security_status = 'clean'.
alter table public.applications add column idempotency_key uuid;
update public.applications set idempotency_key = gen_random_uuid() where idempotency_key is null;
alter table public.applications alter column idempotency_key set not null;
alter table public.applications alter column idempotency_key set default gen_random_uuid();
alter table public.applications add constraint applications_idempotency_key_key unique (idempotency_key);

alter table public.application_files
  add column security_status text not null default 'quarantined'
    check (security_status in ('quarantined', 'clean', 'rejected')),
  add column scan_completed_at timestamptz;
alter table public.application_files add constraint application_files_scan_state check (
  (security_status = 'quarantined' and scan_completed_at is null)
  or (security_status in ('clean', 'rejected') and scan_completed_at is not null)
);

create table public.application_file_reconciliations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  idempotency_key uuid not null,
  storage_paths text[] not null check (cardinality(storage_paths) between 1 and 2),
  reason text not null check (reason in ('cleanup_failed', 'graph_status_unknown')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'resolved')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index application_file_reconciliations_pending_idx
on public.application_file_reconciliations (status, created_at)
where status = 'pending';
alter table public.application_file_reconciliations enable row level security;
revoke all privileges on table public.application_file_reconciliations from public, anon, authenticated;
grant all privileges on table public.application_file_reconciliations to service_role;

create trigger set_application_file_reconciliations_updated_at
before update on public.application_file_reconciliations
for each row execute function public.set_updated_at();

create index submission_rate_limits_attempted_at_idx
on public.submission_rate_limits (attempted_at);

create or replace function public.purge_submission_rate_limits(
  p_before timestamptz default (now() - interval '1 day'),
  p_limit integer default 10000
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  deleted_count bigint;
begin
  if p_before is null or p_limit is null or p_limit < 1 or p_limit > 10000 then
    raise exception using errcode = '22023', message = 'invalid purge request';
  end if;
  with candidates as (
    select id
    from public.submission_rate_limits
    where attempted_at < p_before
    order by attempted_at, id
    limit p_limit
    for update skip locked
  )
  delete from public.submission_rate_limits target
  using candidates
  where target.id = candidates.id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
alter function public.purge_submission_rate_limits(timestamptz, integer) owner to postgres;
revoke all on function public.purge_submission_rate_limits(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.purge_submission_rate_limits(timestamptz, integer) to service_role;

do $schedule$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
      execute 'create extension if not exists pg_cron with schema pg_catalog';
    end if;
    execute $cron$
      select cron.schedule(
        'purge-application-submission-rate-limits',
        '17 * * * *',
        'select public.purge_submission_rate_limits(now() - interval ''1 day'', 10000)'
      )
      where not exists (
        select 1 from cron.job where jobname = 'purge-application-submission-rate-limits'
      )
    $cron$;
  end if;
end;
$schedule$;

create or replace function public.find_application_by_idempotency(p_idempotency_key uuid)
returns table (
  application_id uuid,
  receipt_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  select id, receipt_code
  from public.applications
  where idempotency_key = p_idempotency_key;
$$;
alter function public.find_application_by_idempotency(uuid) owner to postgres;
revoke all on function public.find_application_by_idempotency(uuid) from public, anon, authenticated;
grant execute on function public.find_application_by_idempotency(uuid) to service_role;

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
  insert into public.application_file_reconciliations (application_id, idempotency_key, storage_paths, reason)
  values (p_application_id, p_idempotency_key, p_paths, p_reason);
end;
$$;
alter function public.enqueue_application_file_reconciliation(uuid, uuid, text[], text) owner to postgres;
revoke all on function public.enqueue_application_file_reconciliation(uuid, uuid, text[], text) from public, anon, authenticated;
grant execute on function public.enqueue_application_file_reconciliation(uuid, uuid, text[], text) to service_role;

drop function public.insert_application_graph(jsonb);
create or replace function public.insert_application_graph(p_graph jsonb)
returns table(receipt_code text, inserted boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  application_value jsonb;
  answers_value jsonb;
  files_value jsonb;
  application_id uuid;
  idempotency_value uuid;
  receipt_value text;
  existing_receipt text;
  applicant_level text;
  available_date date;
  career_months_value integer;
  consent_at timestamptz;
  retention_at timestamptz;
begin
  if p_graph is null or pg_catalog.jsonb_typeof(p_graph) is distinct from 'object'
    or not (p_graph ?& array['application', 'answers', 'files'])
    or exists (select 1 from pg_catalog.jsonb_object_keys(p_graph) keys(key) where key <> all(array['application', 'answers', 'files']))
  then raise exception using errcode = '22023', message = 'invalid application graph'; end if;
  application_value := p_graph -> 'application'; answers_value := p_graph -> 'answers'; files_value := p_graph -> 'files';
  if pg_catalog.jsonb_typeof(application_value) is distinct from 'object'
    or pg_catalog.jsonb_typeof(answers_value) is distinct from 'array'
    or pg_catalog.jsonb_typeof(files_value) is distinct from 'array'
    or not (application_value ?& array['id','idempotency_key','receipt_code','name','phone','email','level','available_from','career_months','specialties','certifications','privacy_consent_version','privacy_consent_at','retention_until'])
    or exists (select 1 from pg_catalog.jsonb_object_keys(application_value) keys(key) where key <> all(array['id','idempotency_key','receipt_code','name','phone','email','level','available_from','career_months','specialties','certifications','privacy_consent_version','privacy_consent_at','retention_until']))
  then raise exception using errcode = '22023', message = 'invalid application graph'; end if;
  if exists (
    select 1 from unnest(array['id','idempotency_key','receipt_code','name','phone','email','level','available_from','privacy_consent_version','privacy_consent_at','retention_until']) keys(key)
    where pg_catalog.jsonb_typeof(application_value -> key) is distinct from 'string' or pg_catalog.btrim(application_value ->> key) = ''
  ) or pg_catalog.jsonb_typeof(application_value -> 'career_months') is distinct from 'number'
    or pg_catalog.jsonb_typeof(application_value -> 'specialties') is distinct from 'array'
    or pg_catalog.jsonb_typeof(application_value -> 'certifications') is distinct from 'array'
  then raise exception using errcode = '22023', message = 'invalid application graph'; end if;
  if application_value ->> 'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or application_value ->> 'idempotency_key' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or application_value ->> 'career_months' !~ '^\d+$'
  then raise exception using errcode = '22023', message = 'invalid application graph'; end if;
  begin
    application_id := (application_value ->> 'id')::uuid;
    idempotency_value := (application_value ->> 'idempotency_key')::uuid;
    available_date := (application_value ->> 'available_from')::date;
    career_months_value := (application_value ->> 'career_months')::integer;
    consent_at := (application_value ->> 'privacy_consent_at')::timestamptz;
    retention_at := (application_value ->> 'retention_until')::timestamptz;
  exception when others then raise exception using errcode = '22023', message = 'invalid application graph'; end;
  receipt_value := application_value ->> 'receipt_code'; applicant_level := application_value ->> 'level';
  if receipt_value !~ '^MMG-[0-9A-F]{32}$' or applicant_level not in ('entry','experienced')
    or char_length(pg_catalog.btrim(application_value ->> 'name')) not between 2 and 50
    or char_length(application_value ->> 'phone') not between 10 and 13
    or char_length(application_value ->> 'email') not between 3 and 254
    or char_length(pg_catalog.btrim(application_value ->> 'privacy_consent_version')) < 1
    or not ((applicant_level = 'entry' and career_months_value = 0) or (applicant_level = 'experienced' and career_months_value between 1 and 600))
    or consent_at > pg_catalog.clock_timestamp() + interval '5 minutes'
    or consent_at < pg_catalog.clock_timestamp() - interval '1 day'
    or retention_at <= consent_at or retention_at > consent_at + interval '3650 days'
    or mod(extract(epoch from retention_at - consent_at)::bigint, 86400) <> 0
  then raise exception using errcode = '22023', message = 'invalid application graph'; end if;
  if pg_catalog.jsonb_array_length(application_value -> 'specialties') not between 1 and 10
    or pg_catalog.jsonb_array_length(application_value -> 'certifications') not between 0 and 20
    or exists (select 1 from pg_catalog.jsonb_array_elements(application_value -> 'specialties') item where pg_catalog.jsonb_typeof(item) is distinct from 'string' or pg_catalog.btrim(item #>> '{}') = '')
    or exists (select 1 from pg_catalog.jsonb_array_elements(application_value -> 'certifications') item where pg_catalog.jsonb_typeof(item) is distinct from 'string' or pg_catalog.btrim(item #>> '{}') = '')
    or pg_catalog.jsonb_array_length(application_value -> 'specialties') is distinct from (select count(distinct pg_catalog.btrim(item #>> '{}'))::integer from pg_catalog.jsonb_array_elements(application_value -> 'specialties') item)
    or pg_catalog.jsonb_array_length(application_value -> 'certifications') is distinct from (select count(distinct pg_catalog.btrim(item #>> '{}'))::integer from pg_catalog.jsonb_array_elements(application_value -> 'certifications') item)
  then raise exception using errcode = '22023', message = 'invalid application graph'; end if;

  if pg_catalog.jsonb_array_length(answers_value) is distinct from case when applicant_level = 'experienced' then 4 else 3 end
    or exists (select 1 from pg_catalog.jsonb_array_elements(answers_value) item where pg_catalog.jsonb_typeof(item) is distinct from 'object'
      or not (item ?& array['answer_key','answer_text','answer_json','display_order'])
      or exists (select 1 from pg_catalog.jsonb_object_keys(item) keys(key) where key <> all(array['answer_key','answer_text','answer_json','display_order']))
      or pg_catalog.jsonb_typeof(item -> 'answer_key') is distinct from 'string'
      or pg_catalog.jsonb_typeof(item -> 'display_order') is distinct from 'number'
      or item ->> 'display_order' !~ '^\d+$'
      or (item ->> 'display_order')::integer not between 1 and 4
      or not (
        (item ->> 'answer_key' = 'career_history'
          and pg_catalog.jsonb_typeof(item -> 'answer_text') is distinct from 'null'
          and pg_catalog.jsonb_typeof(item -> 'answer_json') is distinct from 'array'
          and public.is_valid_career_history(item -> 'answer_json'))
        or (item ->> 'answer_key' in ('motivation','strengths','goals')
          and pg_catalog.jsonb_typeof(item -> 'answer_text') is distinct from 'string'
          and char_length(pg_catalog.btrim(item ->> 'answer_text')) between 100 and 2000
          and pg_catalog.jsonb_typeof(item -> 'answer_json') is distinct from 'null')
      ))
    or (select count(*) from pg_catalog.jsonb_array_elements(answers_value) item where item ->> 'answer_key' = 'motivation') is distinct from 1::bigint
    or (select count(*) from pg_catalog.jsonb_array_elements(answers_value) item where item ->> 'answer_key' = 'strengths') is distinct from 1::bigint
    or (select count(*) from pg_catalog.jsonb_array_elements(answers_value) item where item ->> 'answer_key' = 'goals') is distinct from 1::bigint
    or (select count(*) from pg_catalog.jsonb_array_elements(answers_value) item where item ->> 'answer_key' = 'career_history') is distinct from case when applicant_level = 'experienced' then 1::bigint else 0::bigint end
    or exists (select 1 from pg_catalog.jsonb_array_elements(answers_value) item where item ->> 'answer_key' not in ('career_history','motivation','strengths','goals'))
    or (select count(distinct (item ->> 'display_order')::integer) from pg_catalog.jsonb_array_elements(answers_value) item) is distinct from pg_catalog.jsonb_array_length(answers_value)::bigint
  then raise exception using errcode = '22023', message = 'invalid application graph'; end if;

  if pg_catalog.jsonb_array_length(files_value) not between 1 and 2
    or exists (select 1 from pg_catalog.jsonb_array_elements(files_value) item where pg_catalog.jsonb_typeof(item) is distinct from 'object'
      or not (item ?& array['storage_path','original_filename','mime_type','size_bytes','file_kind','security_status'])
      or exists (select 1 from pg_catalog.jsonb_object_keys(item) keys(key) where key <> all(array['storage_path','original_filename','mime_type','size_bytes','file_kind','security_status']))
      or exists (select 1 from unnest(array['storage_path','original_filename','mime_type','file_kind','security_status']) keys(key) where pg_catalog.jsonb_typeof(item -> key) is distinct from 'string' or pg_catalog.btrim(item ->> key) = '')
      or pg_catalog.jsonb_typeof(item -> 'size_bytes') is distinct from 'number'
      or item ->> 'size_bytes' !~ '^\d+$'
      or (item ->> 'size_bytes')::bigint not between 1 and 10485760
      or item ->> 'security_status' is distinct from 'quarantined'
      or item ->> 'file_kind' not in ('resume','portfolio')
      or item ->> 'original_filename' ~ '[\\/[:cntrl:]]'
      or char_length(item ->> 'original_filename') > 255
      or item ->> 'storage_path' !~ ('^applications/' || application_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|doc|docx)$')
      or not ((item ->> 'mime_type' = 'application/pdf' and item ->> 'storage_path' like '%.pdf')
        or (item ->> 'mime_type' = 'application/msword' and item ->> 'storage_path' like '%.doc')
        or (item ->> 'mime_type' = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' and item ->> 'storage_path' like '%.docx')))
    or (select count(*) from pg_catalog.jsonb_array_elements(files_value) item where item ->> 'file_kind' = 'resume') is distinct from 1::bigint
    or (select count(*) from pg_catalog.jsonb_array_elements(files_value) item where item ->> 'file_kind' = 'portfolio') > 1
    or (select count(distinct item ->> 'storage_path') from pg_catalog.jsonb_array_elements(files_value) item) is distinct from pg_catalog.jsonb_array_length(files_value)::bigint
  then raise exception using errcode = '22023', message = 'invalid application graph'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(idempotency_value::text, 1));
  select applications.receipt_code into existing_receipt from public.applications where idempotency_key = idempotency_value;
  if existing_receipt is not null then return query select existing_receipt, false; return; end if;

  insert into public.applications (id,idempotency_key,receipt_code,name,phone,email,level,available_from,career_months,specialties,certifications,privacy_consent_version,privacy_consent_at,retention_until)
  values (application_id,idempotency_value,receipt_value,application_value->>'name',application_value->>'phone',application_value->>'email',applicant_level,available_date,career_months_value,array(select item #>> '{}' from pg_catalog.jsonb_array_elements(application_value->'specialties') item),array(select item #>> '{}' from pg_catalog.jsonb_array_elements(application_value->'certifications') item),application_value->>'privacy_consent_version',consent_at,retention_at);
  insert into public.application_answers (application_id,answer_key,answer_text,answer_json,display_order)
  select application_id,item->>'answer_key',case when item->'answer_text'='null'::jsonb then null else item->>'answer_text' end,case when item->'answer_json'='null'::jsonb then null else item->'answer_json' end,(item->>'display_order')::smallint from pg_catalog.jsonb_array_elements(answers_value) item;
  perform public.assert_application_career_graph(application_id);
  insert into public.application_files (application_id,storage_path,original_filename,mime_type,size_bytes,file_kind,security_status)
  select application_id,item->>'storage_path',item->>'original_filename',item->>'mime_type',(item->>'size_bytes')::bigint,item->>'file_kind',item->>'security_status' from pg_catalog.jsonb_array_elements(files_value) item;
  return query select receipt_value, true;
end;
$$;
alter function public.insert_application_graph(jsonb) owner to postgres;
revoke all on function public.insert_application_graph(jsonb) from public, anon, authenticated;
grant execute on function public.insert_application_graph(jsonb) to service_role;
