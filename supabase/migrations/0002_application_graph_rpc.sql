-- Supabase/PostgREST cannot make separate parent, answer, and file inserts one
-- atomic client operation. Keep the full graph inside this single transaction.
create or replace function public.insert_application_graph(p_graph jsonb)
returns void
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
begin
  if p_graph is null or pg_catalog.jsonb_typeof(p_graph) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'invalid application graph';
  end if;

  application_value := p_graph -> 'application';
  answers_value := p_graph -> 'answers';
  files_value := p_graph -> 'files';

  if pg_catalog.jsonb_typeof(application_value) <> 'object'
    or pg_catalog.jsonb_typeof(answers_value) <> 'array'
    or pg_catalog.jsonb_typeof(files_value) <> 'array'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid application graph';
  end if;

  application_id := (application_value ->> 'id')::uuid;

  insert into public.applications (
    id,
    receipt_code,
    name,
    phone,
    email,
    level,
    available_from,
    career_months,
    specialties,
    certifications,
    privacy_consent_version,
    privacy_consent_at,
    retention_until
  ) values (
    application_id,
    application_value ->> 'receipt_code',
    application_value ->> 'name',
    application_value ->> 'phone',
    application_value ->> 'email',
    application_value ->> 'level',
    (application_value ->> 'available_from')::date,
    (application_value ->> 'career_months')::integer,
    array(
      select specialty
      from pg_catalog.jsonb_array_elements_text(application_value -> 'specialties')
        with ordinality as specialty_values(specialty, position)
      order by position
    ),
    array(
      select certification
      from pg_catalog.jsonb_array_elements_text(application_value -> 'certifications')
        with ordinality as certification_values(certification, position)
      order by position
    ),
    application_value ->> 'privacy_consent_version',
    (application_value ->> 'privacy_consent_at')::timestamptz,
    (application_value ->> 'retention_until')::timestamptz
  );

  insert into public.application_answers (
    application_id,
    answer_key,
    answer_text,
    answer_json,
    display_order
  )
  select
    application_id,
    answer ->> 'answer_key',
    answer ->> 'answer_text',
    case
      when answer -> 'answer_json' is null or answer -> 'answer_json' = 'null'::jsonb then null
      else answer -> 'answer_json'
    end,
    (answer ->> 'display_order')::smallint
  from pg_catalog.jsonb_array_elements(answers_value) as answer_values(answer);

  perform public.assert_application_career_graph(application_id);

  insert into public.application_files (
    application_id,
    storage_path,
    original_filename,
    mime_type,
    size_bytes,
    file_kind
  )
  select
    application_id,
    file_value ->> 'storage_path',
    file_value ->> 'original_filename',
    file_value ->> 'mime_type',
    (file_value ->> 'size_bytes')::bigint,
    file_value ->> 'file_kind'
  from pg_catalog.jsonb_array_elements(files_value) as file_values(file_value);
end;
$$;

alter function public.insert_application_graph(jsonb) owner to postgres;
revoke all on function public.insert_application_graph(jsonb) from public, anon, authenticated;
grant execute on function public.insert_application_graph(jsonb) to service_role;
