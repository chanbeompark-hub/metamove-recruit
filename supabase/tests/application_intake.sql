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

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select is(public.is_active_admin(), false, 'inactive authenticated caller is not admin');
select is((select count(*) from public.applications), 0::bigint, 'inactive admin sees no applications');
select is(
  (
    with changed as (
      update public.applications
      set status = 'accepted'
      where receipt_code = 'TEST-RECEIPT-001'
      returning 1
    )
    select count(*) from changed
  ),
  0::bigint,
  'inactive admin cannot update applications'
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
select lives_ok(
  'select * from storage.objects where bucket_id = ''application-files''',
  'active admin can query private application file objects'
);
select lives_ok(
  'update public.applications set status = ''reviewing'' where receipt_code = ''TEST-RECEIPT-001''',
  'active admin can update application status'
);
select lives_ok(
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
  'active admin can create their own review'
);
select lives_ok(
  $sql$
    update public.application_reviews
    set rating = 4
    where application_id = '20000000-0000-0000-0000-000000000001'
  $sql$,
  'active admin can update their own review'
);
select lives_ok(
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
  'active admin can append their own status history'
);
select throws_ok(
  'update public.applications set name = ''변조된 이름'' where receipt_code = ''TEST-RECEIPT-001''',
  '42501',
  null,
  'active admin cannot alter applicant personal data'
);
reset role;

select is(
  (select status::text from public.applications where receipt_code = 'TEST-RECEIPT-001'),
  'reviewing',
  'the permitted status update is persisted'
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
select throws_ok(
  $sql$
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
    )
  $sql$,
  '23514',
  null,
  'entry applications cannot store career history'
);

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
  $sql$
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
    )
  $sql$,
  '23514',
  null,
  'career history month sum must match careerMonths'
);
select lives_ok(
  $sql$
    insert into public.application_answers (
      application_id,
      answer_key,
      answer_json,
      display_order
    ) values (
      '20000000-0000-0000-0000-000000000002',
      'career_history',
      '[{"company":"가상센터","role":"트레이너","months":24}]'::jsonb,
      1
    )
  $sql$,
  'experienced career history accepts canonical JSON with a matching month total'
);
delete from public.applications where id = '20000000-0000-0000-0000-000000000002';

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
