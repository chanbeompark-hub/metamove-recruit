begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select is(
  (
    select array_agg(enumlabel order by enumsortorder)::text
    from pg_catalog.pg_enum
    where enumtypid = 'public.application_status'::regtype
  ),
  array['new', 'reviewing', 'interview', 'accepted', 'rejected']::text,
  'application status has the exact five values'
);

select results_eq(
  $$
    select c.relname::text
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute as a
      on a.attrelid = c.oid
      and a.attname in ('id', 'user_id')
      and not a.attisdropped
    join pg_catalog.pg_index as i
      on i.indrelid = c.oid
      and i.indisprimary
      and a.attnum = any(i.indkey)
    where n.nspname = 'public'
      and c.relname = any(array[
        'applications',
        'application_answers',
        'application_files',
        'admin_profiles',
        'application_reviews',
        'application_status_history',
        'submission_rate_limits',
        'application_file_reconciliations'
      ])
      and a.atttypid = 'uuid'::regtype
    order by c.relname
  $$,
  $$
    values
      ('admin_profiles'::text),
      ('application_answers'::text),
      ('application_file_reconciliations'::text),
      ('application_files'::text),
      ('application_reviews'::text),
      ('application_status_history'::text),
      ('applications'::text),
      ('submission_rate_limits'::text)
  $$,
  'every public application table has a UUID primary key'
);

select results_eq(
  $$
    select c.relname::text
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname = any(array[
        'applications',
        'application_answers',
        'application_files',
        'admin_profiles',
        'application_reviews',
        'application_status_history',
        'submission_rate_limits',
        'application_file_reconciliations'
      ])
      and c.relrowsecurity
    order by c.relname
  $$,
  $$
    values
      ('admin_profiles'::text),
      ('application_answers'::text),
      ('application_file_reconciliations'::text),
      ('application_files'::text),
      ('application_reviews'::text),
      ('application_status_history'::text),
      ('applications'::text),
      ('submission_rate_limits'::text)
  $$,
  'RLS is enabled on every public application table'
);

select results_eq(
  $$
    select tgname::text
    from pg_catalog.pg_trigger
    where tgname in (
      'enforce_application_career_graph_from_applications',
      'enforce_application_career_graph_from_answers'
    )
      and tgdeferrable
      and tginitdeferred
    order by tgname
  $$,
  $$
    values
      ('enforce_application_career_graph_from_answers'::text),
      ('enforce_application_career_graph_from_applications'::text)
  $$,
  'career graph constraint triggers are DEFERRABLE INITIALLY DEFERRED'
);

select is(
  (
    select coalesce(bool_or(
      pg_catalog.has_table_privilege(
        'anon',
        pg_catalog.format('%I.%I', target_schema, target_table),
        privilege_name
      )
    ), false)
    from (
      values
        ('public', 'applications'),
        ('public', 'application_answers'),
        ('public', 'application_files'),
        ('public', 'admin_profiles'),
        ('public', 'application_reviews'),
        ('public', 'application_status_history'),
        ('public', 'submission_rate_limits'),
        ('public', 'application_file_reconciliations'),
        ('storage', 'buckets'),
        ('storage', 'objects')
    ) as targets(target_schema, target_table)
    cross join (
      values
        ('SELECT'),
        ('INSERT'),
        ('UPDATE'),
        ('DELETE'),
        ('TRUNCATE'),
        ('REFERENCES'),
        ('TRIGGER')
    ) as privileges(privilege_name)
  ),
  false,
  'anon has no application table or storage privileges'
);

set local role anon;
select throws_ok(
  'select * from public.applications',
  '42501',
  null,
  'anon cannot read applications'
);
select throws_ok(
  $sql$
    insert into public.applications (
      receipt_code,
      name,
      phone,
      email,
      level,
      available_from,
      career_months,
      specialties,
      privacy_consent_version,
      privacy_consent_at,
      retention_until
    ) values (
      'ANON-DENIED',
      '가상지원자',
      '01000000000',
      'applicant@example.test',
      'entry',
      current_date,
      0,
      array['웨이트 트레이닝'],
      'test-v1',
      now(),
      now() + interval '30 days'
    )
  $sql$,
  '42501',
  null,
  'anon cannot insert applications directly'
);
select throws_ok(
  'select * from storage.objects where bucket_id = ''application-files''',
  '42501',
  null,
  'anon cannot read application files'
);
select throws_ok(
  'select public.consume_submission_quota(''aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'', 5, 600)',
  '42501',
  null,
  'anon cannot consume submission quota'
);
reset role;

select is(public.is_active_admin(), false, 'unauthenticated caller is not admin');
select is(
  (
    select pg_catalog.pg_get_userbyid(proowner)
    from pg_catalog.pg_proc
    where oid = 'public.is_active_admin()'::regprocedure
  ),
  'postgres',
  'active-admin guard is owned by postgres'
);
select is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.is_active_admin()'::regprocedure
  ),
  true,
  'active-admin guard is SECURITY DEFINER'
);
select is(
  (
    select proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc
    where oid = 'public.is_active_admin()'::regprocedure
  ),
  true,
  'active-admin guard has exactly an empty fixed search_path'
);
select is(
  pg_catalog.has_function_privilege('anon', 'public.is_active_admin()', 'EXECUTE'),
  false,
  'anon cannot execute the active-admin guard'
);
select is(
  pg_catalog.has_function_privilege('authenticated', 'public.is_active_admin()', 'EXECUTE'),
  true,
  'authenticated can execute the active-admin guard used by read policies'
);
select is(
  (select public from storage.buckets where id = 'application-files'),
  false,
  'application bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'application-files'),
  10485760::bigint,
  'application bucket limits each file to 10 MiB'
);
select is(
  (select allowed_mime_types::text from storage.buckets where id = 'application-files'),
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text,
  'application bucket uses the canonical MIME allowlist'
);
select is(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.consume_submission_quota(text,integer,integer)',
    'EXECUTE'
  ),
  false,
  'authenticated has no quota RPC execute privilege'
);
select is(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.consume_submission_quota(text,integer,integer)',
    'EXECUTE'
  ),
  true,
  'service_role has quota RPC execute privilege'
);
select is(
  pg_catalog.has_function_privilege(
    'anon',
    'public.insert_application_graph(jsonb)',
    'EXECUTE'
  ),
  false,
  'anon has no application graph RPC execute privilege'
);
select is(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.insert_application_graph(jsonb)',
    'EXECUTE'
  ),
  false,
  'authenticated has no application graph RPC execute privilege'
);
select is(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.insert_application_graph(jsonb)',
    'EXECUTE'
  ),
  true,
  'service role has application graph RPC execute privilege'
);
select is(
  (
    select prosecdef
      and proconfig = array['search_path=""']::text[]
    from pg_catalog.pg_proc
    where oid = 'public.insert_application_graph(jsonb)'::regprocedure
  ),
  true,
  'application graph RPC is SECURITY DEFINER with exactly an empty fixed search_path'
);
select is(
  (
    select pg_catalog.pg_get_userbyid(proowner)
    from pg_catalog.pg_proc
    where oid = 'public.insert_application_graph(jsonb)'::regprocedure
  ),
  'postgres',
  'application graph RPC has the trusted postgres owner'
);
select is(
  pg_catalog.has_function_privilege('anon', 'public.find_application_by_idempotency(uuid)', 'EXECUTE'),
  false,
  'anon has no idempotency lookup RPC execute privilege'
);
select is(
  pg_catalog.has_function_privilege('authenticated', 'public.enqueue_application_file_reconciliation(uuid,uuid,text[],text)', 'EXECUTE'),
  false,
  'authenticated has no reconciliation RPC execute privilege'
);
select is(
  pg_catalog.has_function_privilege('service_role', 'public.find_application_by_idempotency(uuid)', 'EXECUTE')
    and pg_catalog.has_function_privilege('service_role', 'public.enqueue_application_file_reconciliation(uuid,uuid,text[],text)', 'EXECUTE')
    and pg_catalog.has_function_privilege('service_role', 'public.purge_submission_rate_limits(timestamptz,integer)', 'EXECUTE'),
  true,
  'service role can execute the idempotency, reconciliation, and bounded purge RPCs'
);
select is(
  (
    select bool_and(prosecdef and proconfig = array['search_path=""']::text[])
    from pg_catalog.pg_proc
    where oid = any(array[
      'public.find_application_by_idempotency(uuid)'::regprocedure,
      'public.enqueue_application_file_reconciliation(uuid,uuid,text[],text)'::regprocedure,
      'public.purge_submission_rate_limits(timestamptz,integer)'::regprocedure
    ])
  ),
  true,
  'new service RPCs are SECURITY DEFINER with exactly an empty fixed search_path'
);
select is(
  pg_catalog.to_regclass('public.submission_rate_limits_attempted_at_idx') is not null,
  true,
  'rate-limit retention has a global attempted_at index'
);
select is(
  (
    select coalesce(bool_or(column_name in ('ip', 'ip_address', 'raw_ip', 'email')), false)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'submission_rate_limits'
  ),
  false,
  'rate limits store no raw IP or email column'
);

insert into storage.buckets (id, name, public)
values ('unrelated-private', 'unrelated-private', false)
on conflict (id) do update set public = false;

insert into storage.objects (bucket_id, name)
values
  ('application-files', 'applications/test/resume.pdf'),
  ('unrelated-private', 'unrelated/secret.pdf');

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'inactive-admin@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'active-admin@example.test');

insert into public.admin_profiles (user_id, display_name, role, active)
values
  ('10000000-0000-0000-0000-000000000001', '비활성 관리자', 'reviewer', false),
  ('10000000-0000-0000-0000-000000000002', '활성 관리자', 'admin', true);

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
  '20000000-0000-0000-0000-000000000001',
  'TEST-RECEIPT-001',
  '가상지원자',
  '010-1234-5678',
  'applicant@example.test',
  'entry',
  current_date,
  0,
  array['웨이트 트레이닝'],
  array['생활스포츠지도사'],
  'test-v1',
  now(),
  now() + interval '30 days'
);

select throws_ok(
  $sql$
    insert into public.applications (
      receipt_code,
      name,
      phone,
      email,
      level,
      available_from,
      career_months,
      specialties,
      privacy_consent_version,
      privacy_consent_at,
      retention_until
    ) values (
      'DUPLICATE-SPECIALTY',
      '가상지원자',
      '010-1234-5678',
      'duplicate@example.test',
      'entry',
      current_date,
      0,
      array['웨이트 트레이닝', ' 웨이트 트레이닝 '],
      'test-v1',
      now(),
      now() + interval '30 days'
    )
  $sql$,
  '23514',
  null,
  'database preserves the canonical set semantics for specialties'
);

insert into public.application_reviews (
  application_id,
  admin_id,
  rating,
  note
) values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  4,
  '테스트 전용 메모'
);

insert into public.application_status_history (
  application_id,
  previous_status,
  new_status,
  admin_id,
  reason
) values (
  '20000000-0000-0000-0000-000000000001',
  'new',
  'reviewing',
  '10000000-0000-0000-0000-000000000002',
  '테스트 전용 상태 변경'
);

select is(
  pg_catalog.has_table_privilege('authenticated', 'public.applications', 'UPDATE'),
  false,
  'authenticated has no direct application update privilege'
);
select is(
  not pg_catalog.has_table_privilege('authenticated', 'public.application_reviews', 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.application_reviews', 'UPDATE'),
  true,
  'authenticated has no direct review mutation privilege'
);
select is(
  pg_catalog.has_table_privilege('authenticated', 'public.application_status_history', 'INSERT'),
  false,
  'authenticated has no direct status-history mutation privilege'
);
select is(
  pg_catalog.has_table_privilege('authenticated', 'storage.objects', 'SELECT'),
  false,
  'authenticated has no direct storage object read privilege'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select is(public.is_active_admin(), false, 'inactive authenticated caller is not admin');
select is((select count(*) from public.applications), 0::bigint, 'inactive admin sees no applications');
select throws_ok(
  'update public.applications set status = ''accepted'' where receipt_code = ''TEST-RECEIPT-001''',
  '42501',
  null,
  'inactive admin has no direct application update capability'
);
select throws_ok(
  'select public.consume_submission_quota(''bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'', 5, 600)',
  '42501',
  null,
  'authenticated admins cannot call the service quota RPC'
);
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select is(public.is_active_admin(), true, 'active authenticated caller is admin');
select is((select count(*) from public.applications), 1::bigint, 'active admin can read applications');
select lives_ok('select * from public.application_answers', 'active admin can read application answers');
select lives_ok('select * from public.application_files', 'active admin can read application file metadata');
select lives_ok('select * from public.admin_profiles', 'active admin can read admin profiles');
select is((select count(*) from public.application_reviews), 1::bigint, 'active admin can read reviews');
select is((select count(*) from public.application_status_history), 1::bigint, 'active admin can read status history');
select throws_ok(
  'select * from storage.objects where bucket_id = ''application-files''',
  '42501',
  null,
  'active admin cannot list application file objects directly'
);
select throws_ok(
  'select * from storage.objects where bucket_id = ''unrelated-private''',
  '42501',
  null,
  'active admin cannot list objects from another private bucket directly'
);
select throws_ok(
  'update public.applications set status = ''reviewing'' where receipt_code = ''TEST-RECEIPT-001''',
  '42501',
  null,
  'active admin cannot update application status directly'
);
select throws_ok(
  $sql$
    insert into public.application_reviews (
      application_id,
      admin_id,
      rating,
      note
    ) values (
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002',
      3,
      '테스트 전용 메모'
    )
  $sql$,
  '42501',
  null,
  'active admin cannot create reviews directly'
);
select throws_ok(
  $sql$
    update public.application_reviews
    set rating = 4
    where application_id = '20000000-0000-0000-0000-000000000001'
  $sql$,
  '42501',
  null,
  'active admin cannot update reviews directly'
);
select throws_ok(
  $sql$
    insert into public.application_status_history (
      application_id,
      previous_status,
      new_status,
      admin_id,
      reason
    ) values (
      '20000000-0000-0000-0000-000000000001',
      'new',
      'reviewing',
      '10000000-0000-0000-0000-000000000002',
      '테스트 전용 상태 변경'
    )
  $sql$,
  '42501',
  null,
  'active admin cannot append status history directly'
);
select throws_ok(
  'update public.applications set name = ''변조된 이름'' where receipt_code = ''TEST-RECEIPT-001''',
  '42501',
  null,
  'active admin cannot alter applicant personal data'
);
reset role;

set local role service_role;
select lives_ok(
  $sql$
    select public.insert_application_graph(
      pg_catalog.jsonb_build_object(
        'application', pg_catalog.jsonb_build_object(
          'id', '30000000-0000-4000-8000-000000000001',
          'idempotency_key', '50000000-0000-4000-8000-000000000001',
          'receipt_code', 'MMG-00000000000000000000000000000001',
          'name', 'RPC가상지원자',
          'phone', '010-2222-3333',
          'email', 'rpc-applicant@example.test',
          'level', 'entry',
          'available_from', current_date::text,
          'career_months', 0,
          'specialties', pg_catalog.jsonb_build_array('웨이트 트레이닝'),
          'certifications', '[]'::jsonb,
          'privacy_consent_version', 'test-v1',
          'privacy_consent_at', now()::text,
          'retention_until', (now() + interval '30 days')::text
        ),
        'answers', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'answer_key', 'motivation',
            'answer_text', repeat('가', 100),
            'answer_json', null,
            'display_order', 1
          ),
          pg_catalog.jsonb_build_object(
            'answer_key', 'strengths',
            'answer_text', repeat('나', 100),
            'answer_json', null,
            'display_order', 2
          ),
          pg_catalog.jsonb_build_object(
            'answer_key', 'goals',
            'answer_text', repeat('다', 100),
            'answer_json', null,
            'display_order', 3
          )
        ),
        'files', pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'storage_path', 'applications/30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001.pdf',
            'original_filename', 'rpc-resume.pdf',
            'mime_type', 'application/pdf',
            'size_bytes', 1024,
            'file_kind', 'resume',
            'security_status', 'quarantined'
          )
        )
      )
    )
  $sql$,
  'service role can persist the complete application graph through one RPC'
);
reset role;

select is(
  (select count(*) from public.applications where receipt_code = 'MMG-00000000000000000000000000000001'),
  1::bigint,
  'atomic graph RPC inserts one application'
);
select is(
  (
    select count(*)
    from public.application_answers
    where application_id = '30000000-0000-4000-8000-000000000001'
  ),
  3::bigint,
  'atomic graph RPC inserts its answers'
);
select is(
  (
    select count(*)
    from public.application_files
    where application_id = '30000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'atomic graph RPC inserts its file metadata'
);

create temporary table application_graph_fixture as
select pg_catalog.jsonb_build_object(
  'application', pg_catalog.jsonb_build_object(
    'id', a.id::text, 'idempotency_key', a.idempotency_key::text, 'receipt_code', a.receipt_code,
    'name', a.name, 'phone', a.phone, 'email', a.email, 'level', a.level,
    'available_from', a.available_from::text, 'career_months', a.career_months,
    'specialties', to_jsonb(a.specialties), 'certifications', to_jsonb(a.certifications),
    'privacy_consent_version', a.privacy_consent_version,
    'privacy_consent_at', a.privacy_consent_at::text, 'retention_until', a.retention_until::text
  ),
  'answers', (select jsonb_agg(jsonb_build_object('answer_key',answer_key,'answer_text',answer_text,'answer_json',answer_json,'display_order',display_order) order by display_order) from public.application_answers where application_id = a.id),
  'files', (select jsonb_agg(jsonb_build_object('storage_path',storage_path,'original_filename',original_filename,'mime_type',mime_type,'size_bytes',size_bytes,'file_kind',file_kind,'security_status',security_status)) from public.application_files where application_id = a.id)
) as graph
from public.applications a
where a.id = '30000000-0000-4000-8000-000000000001';
grant select on application_graph_fixture to service_role;

set local role service_role;
select is(
  (select inserted from public.insert_application_graph((select graph from application_graph_fixture))),
  false,
  'same idempotency key replays without another insert'
);
select is(
  (
    select pg_catalog.jsonb_build_object(
      'application_id', application_id::text,
      'receipt_code', receipt_code
    )
    from public.find_application_by_idempotency(
      '50000000-0000-4000-8000-000000000001'::uuid
    )
  ),
  pg_catalog.jsonb_build_object(
    'application_id', '30000000-0000-4000-8000-000000000001',
    'receipt_code', 'MMG-00000000000000000000000000000001'
  ),
  'idempotency lookup returns the authoritative application identity and receipt'
);
select throws_ok(
  'select public.insert_application_graph((select graph - ''files'' from application_graph_fixture))',
  '22023', null, 'graph rejects a missing top-level key'
);
select throws_ok(
  'select public.insert_application_graph((select jsonb_set(graph, ''{answers}'', ''{}''::jsonb) from application_graph_fixture))',
  '22023', null, 'graph rejects a wrong JSON type'
);
select throws_ok(
  'select public.insert_application_graph((select graph #- ''{application,name}'' from application_graph_fixture))',
  '22023', null, 'graph rejects a missing scalar'
);
select throws_ok(
  'select public.insert_application_graph((select jsonb_set(graph, ''{application,name}'', ''""''::jsonb) from application_graph_fixture))',
  '22023', null, 'graph rejects an empty scalar'
);
select throws_ok(
  'select public.insert_application_graph((select jsonb_set(graph, ''{answers}'', ''[]''::jsonb) from application_graph_fixture))',
  '22023', null, 'graph rejects empty and incomplete essays'
);
select throws_ok(
  'select public.insert_application_graph((select jsonb_set(graph, ''{answers}'', (graph->''answers'') || (graph->''answers''->0)) from application_graph_fixture))',
  '22023', null, 'graph rejects duplicate essays'
);
select throws_ok(
  'select public.insert_application_graph((select jsonb_set(graph, ''{files}'', ''[]''::jsonb) from application_graph_fixture))',
  '22023', null, 'graph rejects a missing resume'
);
select throws_ok(
  'select public.insert_application_graph((select jsonb_set(graph, ''{files,0,file_kind}'', ''"portfolio"''::jsonb) from application_graph_fixture))',
  '22023', null, 'graph rejects a portfolio-only graph'
);
select throws_ok(
  'select public.insert_application_graph((select jsonb_set(graph, ''{files}'', (graph->''files'') || (graph->''files''->0)) from application_graph_fixture))',
  '22023', null, 'graph rejects duplicate resume metadata'
);
select throws_ok(
  'select public.insert_application_graph((select jsonb_set(graph, ''{files,0,storage_path}'', ''"applications/00000000-0000-4000-8000-000000000000/40000000-0000-4000-8000-000000000001.pdf"''::jsonb) from application_graph_fixture))',
  '22023', null, 'graph rejects a path outside the application namespace'
);
select throws_ok(
  $sql$
    select public.insert_application_graph(
      (select jsonb_set(
        jsonb_set(
          jsonb_set(graph, '{application,id}', '"30000000-0000-4000-8000-000000000099"'),
          '{application,idempotency_key}', '"50000000-0000-4000-8000-000000000099"'
        ),
        '{files,0,storage_path}',
        '"applications/30000000-0000-4000-8000-000000000099/40000000-0000-4000-8000-000000000001.pdf"'
      ) from application_graph_fixture)
    )
  $sql$,
  '23505', null, 'a different idempotency key cannot reuse a receipt'
);
reset role;

create function pg_temp.reject_test_application_file()
returns trigger
language plpgsql
as $$
begin
  if new.application_id = '30000000-0000-4000-8000-000000000098'::uuid then
    raise exception using errcode = 'P0001', message = 'forced test file failure';
  end if;
  return new;
end;
$$;
create trigger reject_test_application_file
before insert on public.application_files
for each row execute function pg_temp.reject_test_application_file();

set local role service_role;
select throws_ok(
  $sql$
    select public.insert_application_graph(
      (select jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(graph, '{application,id}', '"30000000-0000-4000-8000-000000000098"'),
            '{application,idempotency_key}', '"50000000-0000-4000-8000-000000000098"'
          ),
          '{application,receipt_code}', '"MMG-00000000000000000000000000000098"'
        ),
        '{files,0,storage_path}',
        '"applications/30000000-0000-4000-8000-000000000098/40000000-0000-4000-8000-000000000001.pdf"'
      ) from application_graph_fixture)
    )
  $sql$,
  'P0001',
  null,
  'a failure after parent and answer inserts aborts the complete graph transaction'
);
reset role;
drop trigger reject_test_application_file on public.application_files;

select is(
  (select count(*) from public.applications where id = '30000000-0000-4000-8000-000000000098'),
  0::bigint,
  'file insert failure rolls back the application parent'
);
select is(
  (select count(*) from public.application_answers where application_id = '30000000-0000-4000-8000-000000000098'),
  0::bigint,
  'file insert failure rolls back application answers'
);

set local role service_role;
select throws_ok(
  $sql$
    select public.insert_application_graph(
      pg_catalog.jsonb_build_object(
        'application', pg_catalog.jsonb_build_object(
          'id', '30000000-0000-4000-8000-000000000002',
          'idempotency_key', '50000000-0000-4000-8000-000000000002',
          'receipt_code', 'MMG-00000000000000000000000000000002',
          'name', 'RPC경력지원자',
          'phone', '010-4444-5555',
          'email', 'rpc-experienced@example.test',
          'level', 'experienced',
          'available_from', current_date::text,
          'career_months', 12,
          'specialties', pg_catalog.jsonb_build_array('재활 트레이닝'),
          'certifications', '[]'::jsonb,
          'privacy_consent_version', 'test-v1',
          'privacy_consent_at', now()::text,
          'retention_until', (now() + interval '30 days')::text
        ),
        'answers', '[]'::jsonb,
        'files', '[]'::jsonb
      )
    )
  $sql$,
  '22023',
  null,
  'invalid career graph rejects the entire RPC statement'
);
reset role;

select is(
  (select count(*) from public.applications where receipt_code = 'MMG-00000000000000000000000000000002'),
  0::bigint,
  'failed graph RPC leaves no partial application parent'
);

set local role service_role;
select throws_ok(
  'select public.consume_submission_quota(''aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'', null::integer, 600)',
  '22023',
  null,
  'quota rejects a NULL maximum'
);
select throws_ok(
  'select public.consume_submission_quota(''aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'', 5, null::integer)',
  '22023',
  null,
  'quota rejects a NULL window'
);
select throws_ok(
  'select public.consume_submission_quota(''aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'', 0, 600)',
  '22023',
  null,
  'quota rejects a zero maximum'
);
select throws_ok(
  'select public.consume_submission_quota(''aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'', 5, -1)',
  '22023',
  null,
  'quota rejects a negative window'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'application-files'),
  1::bigint,
  'service role can access the server-owned application file object'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'unrelated-private'),
  1::bigint,
  'service role remains unrestricted across private buckets'
);
reset role;

update public.applications
set status = 'reviewing'
where receipt_code = 'TEST-RECEIPT-001';

select is(
  (select status::text from public.applications where receipt_code = 'TEST-RECEIPT-001'),
  'reviewing',
  'a trusted database-side status update is persisted'
);
select ok(
  (
    select updated_at > created_at
    from public.applications
    where receipt_code = 'TEST-RECEIPT-001'
  ),
  'application updates advance updated_at'
);

select throws_ok(
  $sql$
    insert into public.application_answers (
      application_id,
      answer_key,
      answer_text,
      answer_json,
      display_order
    ) values (
      '20000000-0000-0000-0000-000000000001',
      'career_history',
      'JSON을 텍스트 칼럼에 저장하면 안 됩니다.',
      null,
      1
    )
  $sql$,
  '23514',
  null,
  'career history cannot be stored as answer text'
);
select throws_ok(
  $sql$
    insert into public.application_answers (
      application_id,
      answer_key,
      answer_text,
      answer_json,
      display_order
    ) values (
      '20000000-0000-0000-0000-000000000001',
      'motivation',
      null,
      '{"text":"JSON에 에세이를 저장하면 안 됩니다."}'::jsonb,
      2
    )
  $sql$,
  '23514',
  null,
  'essay text cannot be stored as answer JSON'
);
insert into public.application_answers (
  application_id,
  answer_key,
  answer_json,
  display_order
) values (
  '20000000-0000-0000-0000-000000000001',
  'career_history',
  '[{"company":"가상센터","role":"트레이너","months":1}]'::jsonb,
  2
);
select throws_ok(
  'set constraints all immediate',
  '23514',
  null,
  'deferred graph validation rejects entry career history at the transaction boundary'
);
delete from public.application_answers
where application_id = '20000000-0000-0000-0000-000000000001'
  and answer_key = 'career_history';
select lives_ok(
  'set constraints all immediate',
  'entry graph becomes valid after deleting career history in the same transaction'
);
set constraints all deferred;

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
  privacy_consent_version,
  privacy_consent_at,
  retention_until
) values (
  '20000000-0000-0000-0000-000000000002',
  'TEST-RECEIPT-002',
  '가상경력지원자',
  '010-9876-5432',
  'experienced@example.test',
  'experienced',
  current_date,
  24,
  array['재활 트레이닝'],
  'test-v1',
  now(),
  now() + interval '30 days'
);

select throws_ok(
  'set constraints all immediate',
  '23514',
  null,
  'experienced application requires exactly one career history answer by commit'
);

insert into public.application_answers (
  application_id,
  answer_key,
  answer_json,
  display_order
) values (
  '20000000-0000-0000-0000-000000000002',
  'career_history',
  '[{"company":"가상센터","role":"트레이너","months":12}]'::jsonb,
  1
);
select throws_ok(
  'set constraints all immediate',
  '23514',
  null,
  'deferred graph validation rejects a mismatched career month sum'
);

update public.application_answers
set answer_json = '[{"company":"가상센터","role":"트레이너","months":24}]'::jsonb
where application_id = '20000000-0000-0000-0000-000000000002'
  and answer_key = 'career_history';
select lives_ok(
  'set constraints all immediate',
  'experienced graph passes once canonical career history matches the month total'
);
set constraints all deferred;

update public.applications
set career_months = 36
where id = '20000000-0000-0000-0000-000000000002';
update public.application_answers
set answer_json = '[{"company":"가상센터","role":"트레이너","months":36}]'::jsonb
where application_id = '20000000-0000-0000-0000-000000000002'
  and answer_key = 'career_history';
select lives_ok(
  'set constraints all immediate',
  'parent-first updates may restore a coherent graph before transaction validation'
);
set constraints all deferred;

delete from public.application_answers
where application_id = '20000000-0000-0000-0000-000000000002'
  and answer_key = 'career_history';
select throws_ok(
  'set constraints all immediate',
  '23514',
  null,
  'deleting the only experienced career history row is rejected at the transaction boundary'
);
insert into public.application_answers (
  application_id,
  answer_key,
  answer_json,
  display_order
) values (
  '20000000-0000-0000-0000-000000000002',
  'career_history',
  '[{"company":"가상센터","role":"트레이너","months":36}]'::jsonb,
  1
);
select lives_ok('set constraints all immediate', 'restoring the deleted answer repairs the graph');
set constraints all deferred;

delete from public.applications where id = '20000000-0000-0000-0000-000000000002';
select lives_ok(
  'set constraints all immediate',
  'parent deletion and cascading answer deletion do not revalidate a removed graph'
);
set constraints all deferred;

insert into public.application_answers (
  application_id,
  answer_key,
  answer_text,
  display_order
) values (
  '20000000-0000-0000-0000-000000000001',
  'motivation',
  repeat('가', 100),
  1
);

insert into public.application_files (
  application_id,
  storage_path,
  original_filename,
  mime_type,
  size_bytes,
  file_kind
) values (
  '20000000-0000-0000-0000-000000000001',
  'applications/20000000-0000-0000-0000-000000000001/resume.pdf',
  'fictional-resume.pdf',
  'application/pdf',
  1024,
  'resume'
);

delete from public.applications where id = '20000000-0000-0000-0000-000000000001';
select is((select count(*) from public.application_answers), 0::bigint, 'answers cascade on application deletion');
select is((select count(*) from public.application_files), 0::bigint, 'file metadata cascades on application deletion');
select is((select count(*) from public.application_reviews), 0::bigint, 'reviews cascade on application deletion');
select is((select count(*) from public.application_status_history), 0::bigint, 'status history cascades on application deletion');

set local role service_role;
select is(
  public.consume_submission_quota('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 5, 600),
  true,
  'quota allows attempt one'
);
select is(public.consume_submission_quota('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 5, 600), true, 'quota allows attempt two');
select is(public.consume_submission_quota('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 5, 600), true, 'quota allows attempt three');
select is(public.consume_submission_quota('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 5, 600), true, 'quota allows attempt four');
select is(public.consume_submission_quota('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 5, 600), true, 'quota allows attempt five');
select is(public.consume_submission_quota('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 5, 600), false, 'quota rejects attempt six');
select is(
  public.consume_submission_quota('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 5, 600),
  true,
  'quota is independent per actor hash'
);
reset role;

select is(
  (
    select count(*)
    from public.submission_rate_limits
    where actor_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  ),
  5::bigint,
  'rejected quota attempt is not recorded'
);

update public.submission_rate_limits
set attempted_at = now() - interval '601 seconds'
where actor_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

set local role service_role;
select is(
  public.consume_submission_quota('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 5, 600),
  true,
  'expired attempts are cleaned before quota counting'
);
reset role;

select is(
  (
    select count(*)
    from public.submission_rate_limits
    where actor_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  ),
  1::bigint,
  'expired attempts are removed and one current attempt remains'
);
select like(
  pg_catalog.pg_get_functiondef(
    'public.consume_submission_quota(text,integer,integer)'::regprocedure
  ),
  '%pg_advisory_xact_lock%',
  'quota RPC serializes concurrent calls per actor with an advisory transaction lock'
);

insert into public.submission_rate_limits (actor_hash, attempted_at)
values
  ('dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', now() - interval '2 days'),
  ('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', now() - interval '2 days');

set local role service_role;
select is(
  public.purge_submission_rate_limits(now() - interval '1 day', 1),
  1::bigint,
  'global rate-limit purge deletes at most the requested batch size'
);
reset role;
select is(
  (
    select count(*)
    from public.submission_rate_limits
    where actor_hash in (
      'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    )
  ),
  1::bigint,
  'bounded purge leaves the next old row for a later batch'
);

set local role service_role;
select is(
  public.purge_submission_rate_limits(now() - interval '1 day', 10000),
  1::bigint,
  'a later global purge removes the remaining old rate row'
);
select throws_ok(
  'select public.purge_submission_rate_limits(now(), 0)',
  '22023',
  null,
  'global rate-limit purge rejects an invalid batch size'
);
select lives_ok(
  $sql$
    select public.enqueue_application_file_reconciliation(
      '60000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      array['applications/60000000-0000-4000-8000-000000000001/80000000-0000-4000-8000-000000000001.pdf'],
      'cleanup_failed'
    )
  $sql$,
  'service role can durably enqueue an application-file reconciliation'
);
select throws_ok(
  $sql$
    select public.enqueue_application_file_reconciliation(
      '60000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      array['applications/00000000-0000-4000-8000-000000000000/80000000-0000-4000-8000-000000000001.pdf'],
      'cleanup_failed'
    )
  $sql$,
  '22023',
  null,
  'reconciliation rejects paths outside the application namespace'
);
reset role;

select is(
  (select count(*) from public.application_file_reconciliations where idempotency_key = '70000000-0000-4000-8000-000000000001'),
  1::bigint,
  'reconciliation RPC records one durable pending cleanup item'
);

select * from finish();
rollback;
