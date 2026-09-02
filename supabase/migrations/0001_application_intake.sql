create type public.application_status as enum (
  'new',
  'reviewing',
  'interview',
  'accepted',
  'rejected'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create or replace function public.is_valid_trimmed_text_set(
  p_values text[],
  p_minimum integer,
  p_maximum integer
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    pg_catalog.cardinality(p_values) between p_minimum and p_maximum
    and not exists (
      select 1
      from pg_catalog.unnest(p_values) as entries(value)
      where value is null or pg_catalog.btrim(value) = ''
    )
    and pg_catalog.cardinality(p_values) = (
      select count(distinct pg_catalog.btrim(value))
      from pg_catalog.unnest(p_values) as entries(value)
    ),
    false
  );
$$;

create or replace function public.is_valid_career_history(p_value jsonb)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  entry jsonb;
  entry_months integer;
  total_months integer := 0;
begin
  if p_value is null
    or pg_catalog.jsonb_typeof(p_value) <> 'array'
    or pg_catalog.jsonb_array_length(p_value) = 0
  then
    return false;
  end if;

  for entry in
    select item
    from pg_catalog.jsonb_array_elements(p_value) as career_rows(item)
  loop
    if pg_catalog.jsonb_typeof(entry) <> 'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(entry)) <> 3
      or pg_catalog.jsonb_typeof(entry -> 'company') <> 'string'
      or pg_catalog.jsonb_typeof(entry -> 'role') <> 'string'
      or pg_catalog.jsonb_typeof(entry -> 'months') <> 'number'
      or pg_catalog.btrim(entry ->> 'company') = ''
      or pg_catalog.btrim(entry ->> 'role') = ''
      or (entry ->> 'months') !~ '^[1-9][0-9]*$'
    then
      return false;
    end if;

    entry_months := (entry ->> 'months')::integer;
    total_months := total_months + entry_months;
    if total_months > 600 then
      return false;
    end if;
  end loop;

  return true;
exception
  when numeric_value_out_of_range then
    return false;
end;
$$;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  receipt_code text unique not null check (char_length(btrim(receipt_code)) between 1 and 64),
  name text not null check (char_length(btrim(name)) between 2 and 50),
  phone text not null check (char_length(phone) between 10 and 13),
  email text not null check (char_length(email) between 3 and 254),
  level text not null check (level in ('entry', 'experienced')),
  available_from date not null,
  career_months integer not null check (career_months between 0 and 600),
  specialties text[] not null check (
    public.is_valid_trimmed_text_set(specialties, 1, 10)
  ),
  certifications text[] not null default '{}' check (
    public.is_valid_trimmed_text_set(certifications, 0, 20)
  ),
  status public.application_status not null default 'new',
  privacy_consent_version text not null check (char_length(btrim(privacy_consent_version)) > 0),
  privacy_consent_at timestamptz not null,
  retention_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_career_consistency check (
    (level = 'entry' and career_months = 0)
    or (level = 'experienced' and career_months between 1 and 600)
  ),
  constraint applications_retention_after_consent check (retention_until > privacy_consent_at)
);

create table public.application_answers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  answer_key text not null check (
    answer_key in ('career_history', 'motivation', 'strengths', 'goals')
  ),
  answer_text text,
  answer_json jsonb,
  display_order smallint not null check (display_order between 1 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, answer_key),
  unique (application_id, display_order),
  constraint application_answers_value_kind check (
    (
      answer_key = 'career_history'
      and answer_text is null
      and answer_json is not null
      and public.is_valid_career_history(answer_json)
    )
    or (
      answer_key in ('motivation', 'strengths', 'goals')
      and answer_text is not null
      and answer_json is null
      and char_length(btrim(answer_text)) between 100 and 2000
    )
  )
);

create table public.application_files (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  storage_path text unique not null check (char_length(btrim(storage_path)) > 0),
  original_filename text not null check (char_length(btrim(original_filename)) between 1 and 255),
  mime_type text not null check (
    mime_type in (
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  file_kind text not null check (file_kind in ('resume', 'portfolio')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, file_kind)
);

create table public.admin_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
  role text not null check (role in ('reviewer', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.application_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  admin_id uuid not null references public.admin_profiles (user_id),
  rating smallint check (rating between 1 and 5),
  note text not null default '' check (char_length(note) <= 5000),
  next_action_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, admin_id)
);

create table public.application_status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  previous_status public.application_status,
  new_status public.application_status not null,
  admin_id uuid not null references public.admin_profiles (user_id),
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint application_status_must_change check (
    previous_status is null or previous_status <> new_status
  )
);

create table public.submission_rate_limits (
  id uuid primary key default gen_random_uuid(),
  actor_hash text not null check (char_length(actor_hash) between 32 and 128),
  attempted_at timestamptz not null default now()
);

create index applications_status_created_at_idx
on public.applications (status, created_at desc);

create index applications_level_created_at_idx
on public.applications (level, created_at desc);

create index applications_specialties_idx
on public.applications using gin (specialties);

create index application_answers_application_id_idx
on public.application_answers (application_id);

create index application_files_application_id_idx
on public.application_files (application_id);

create index application_reviews_application_id_idx
on public.application_reviews (application_id);

create index application_status_history_application_id_created_at_idx
on public.application_status_history (application_id, created_at desc);

create index submission_rate_limits_actor_attempted_idx
on public.submission_rate_limits (actor_hash, attempted_at);

create or replace function public.validate_application_answer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  applicant_level text;
  expected_months integer;
  answer_months integer;
begin
  if new.answer_key <> 'career_history' then
    return new;
  end if;

  select level, career_months
  into strict applicant_level, expected_months
  from public.applications
  where id = new.application_id;

  if applicant_level <> 'experienced' then
    raise exception using
      errcode = '23514',
      message = 'entry applications cannot include career history';
  end if;

  select sum((entry ->> 'months')::integer)
  into answer_months
  from pg_catalog.jsonb_array_elements(new.answer_json) as career_rows(entry);

  if answer_months is distinct from expected_months then
    raise exception using
      errcode = '23514',
      message = 'career history months must match application career months';
  end if;

  return new;
end;
$$;

create trigger validate_application_answers
before insert or update on public.application_answers
for each row execute function public.validate_application_answer();

create trigger set_applications_updated_at
before update on public.applications
for each row execute function public.set_updated_at();

create trigger set_application_answers_updated_at
before update on public.application_answers
for each row execute function public.set_updated_at();

create trigger set_application_files_updated_at
before update on public.application_files
for each row execute function public.set_updated_at();

create trigger set_admin_profiles_updated_at
before update on public.admin_profiles
for each row execute function public.set_updated_at();

create trigger set_application_reviews_updated_at
before update on public.application_reviews
for each row execute function public.set_updated_at();

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
      and active
  );
$$;

create or replace function public.consume_submission_quota(
  p_actor_hash text,
  p_maximum integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_attempts bigint;
  observed_at timestamptz;
begin
  if p_actor_hash is null
    or pg_catalog.char_length(pg_catalog.btrim(p_actor_hash)) not between 32 and 128
    or p_maximum <= 0
    or p_window_seconds <= 0
  then
    raise exception using
      errcode = '22023',
      message = 'invalid submission quota arguments';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_hash, 0)
  );
  observed_at := pg_catalog.clock_timestamp();

  delete from public.submission_rate_limits
  where actor_hash = p_actor_hash
    and attempted_at <= observed_at - pg_catalog.make_interval(secs => p_window_seconds);

  select count(*)
  into current_attempts
  from public.submission_rate_limits
  where actor_hash = p_actor_hash
    and attempted_at > observed_at - pg_catalog.make_interval(secs => p_window_seconds);

  if current_attempts >= p_maximum then
    return false;
  end if;

  insert into public.submission_rate_limits (actor_hash, attempted_at)
  values (p_actor_hash, observed_at);

  return true;
end;
$$;

alter table public.applications enable row level security;
alter table public.application_answers enable row level security;
alter table public.application_files enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.application_reviews enable row level security;
alter table public.application_status_history enable row level security;
alter table public.submission_rate_limits enable row level security;

create policy "active admins can read applications"
on public.applications
for select
to authenticated
using ((select public.is_active_admin()));

create policy "active admins can update application status"
on public.applications
for update
to authenticated
using ((select public.is_active_admin()))
with check ((select public.is_active_admin()));

create policy "active admins can read application answers"
on public.application_answers
for select
to authenticated
using ((select public.is_active_admin()));

create policy "active admins can read application file metadata"
on public.application_files
for select
to authenticated
using ((select public.is_active_admin()));

create policy "active admins can read admin profiles"
on public.admin_profiles
for select
to authenticated
using ((select public.is_active_admin()));

create policy "active admins can read reviews"
on public.application_reviews
for select
to authenticated
using ((select public.is_active_admin()));

create policy "active admins can create their own reviews"
on public.application_reviews
for insert
to authenticated
with check (
  (select public.is_active_admin())
  and admin_id = (select auth.uid())
);

create policy "active admins can update their own reviews"
on public.application_reviews
for update
to authenticated
using (
  (select public.is_active_admin())
  and admin_id = (select auth.uid())
)
with check (
  (select public.is_active_admin())
  and admin_id = (select auth.uid())
);

create policy "active admins can read status history"
on public.application_status_history
for select
to authenticated
using ((select public.is_active_admin()));

create policy "active admins can append status history"
on public.application_status_history
for insert
to authenticated
with check (
  (select public.is_active_admin())
  and admin_id = (select auth.uid())
);

revoke all privileges on table
  public.applications,
  public.application_answers,
  public.application_files,
  public.admin_profiles,
  public.application_reviews,
  public.application_status_history,
  public.submission_rate_limits
from public, anon, authenticated;

grant select on table
  public.applications,
  public.application_answers,
  public.application_files,
  public.admin_profiles,
  public.application_reviews,
  public.application_status_history
to authenticated;

grant update (status) on public.applications to authenticated;

grant insert (
  application_id,
  admin_id,
  rating,
  note,
  next_action_at
) on public.application_reviews to authenticated;

grant update (
  rating,
  note,
  next_action_at
) on public.application_reviews to authenticated;

grant insert (
  application_id,
  previous_status,
  new_status,
  admin_id,
  reason
) on public.application_status_history to authenticated;

grant all privileges on table
  public.applications,
  public.application_answers,
  public.application_files,
  public.admin_profiles,
  public.application_reviews,
  public.application_status_history,
  public.submission_rate_limits
to service_role;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.is_valid_trimmed_text_set(text[], integer, integer) from public, anon;
grant execute on function public.is_valid_trimmed_text_set(text[], integer, integer) to authenticated, service_role;
revoke all on function public.is_valid_career_history(jsonb) from public, anon, authenticated;
grant execute on function public.is_valid_career_history(jsonb) to service_role;
revoke all on function public.validate_application_answer() from public, anon, authenticated;
revoke all on function public.is_active_admin() from public, anon;
grant execute on function public.is_active_admin() to authenticated, service_role;
revoke all on function public.consume_submission_quota(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_submission_quota(text, integer, integer) to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'application-files',
  'application-files',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "active admins can read application files" on storage.objects;

create policy "active admins can read application files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'application-files'
  and (select public.is_active_admin())
);

revoke all privileges on table storage.buckets, storage.objects from public, anon, authenticated;
grant select on table storage.buckets, storage.objects to authenticated;
grant all privileges on table storage.buckets, storage.objects to service_role;
