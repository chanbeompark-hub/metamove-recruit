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
        'submission_rate_limits'
      ])
      and a.atttypid = 'uuid'::regtype
    order by c.relname
  $$,
  $$
    values
      ('admin_profiles'::text),
      ('application_answers'::text),
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
        'submission_rate_limits'
      ])
      and c.relrowsecurity
    order by c.relname
  $$,
  $$
    values
      ('admin_profiles'::text),
      ('application_answers'::text),
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

select * from finish();
rollback;
