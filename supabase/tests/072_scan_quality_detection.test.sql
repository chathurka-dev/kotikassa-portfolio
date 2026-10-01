begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

select has_column('public', 'receipts', 'scan_quality_score', 'receipt risk score is persisted');
select has_column('public', 'receipts', 'scan_quality_warnings', 'warning outcomes are persisted');
select has_column('public', 'receipts', 'scan_low_review_risk', 'low-review risk is persisted');
select has_function(
  'public', 'get_receipt_scan_quality_context', array['jsonb'],
  'family-scoped price context RPC exists'
);
select has_view('public', 'receipt_scan_quality_monitoring', 'scan quality monitoring view exists');
select has_view(
  'public', 'correction_candidate_performance_monitoring',
  'candidate performance monitoring view exists'
);

insert into families (id, name) values
  ('19000000-0000-0000-0000-000000000001', 'Quality Family'),
  ('19000000-0000-0000-0000-000000000002', 'Other Family');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('29000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'quality@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Quality"}', now(), now()),
  ('29000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'other-quality@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Other"}', now(), now());

update profiles set family_id = '19000000-0000-0000-0000-000000000001'
where id = '29000000-0000-0000-0000-000000000001';
update profiles set family_id = '19000000-0000-0000-0000-000000000002'
where id = '29000000-0000-0000-0000-000000000002';

insert into expense_items (family_id, added_by, name, amount, quantity, unit, expense_date)
values
  ('19000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'Sipuli', 2.00, 1, 'kg', current_date),
  ('19000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'Sipuli', 2.20, 1, 'kg', current_date),
  ('19000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'Sipuli', 1.80, 1, 'kg', current_date),
  ('19000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000002', 'Sipuli', 99.00, 1, 'kg', current_date);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '29000000-0000-0000-0000-000000000001', true);

select is(
  jsonb_array_length(get_receipt_scan_quality_context('[{"lineIndex":0,"name":"Sipuli"}]')),
  1,
  'quality context returns one private aggregate'
);
select is(
  get_receipt_scan_quality_context('[{"lineIndex":0,"name":"Sipuli"}]')->0->>'sampleCount',
  '3',
  'another household cannot affect the sample count'
);
select is(
  (get_receipt_scan_quality_context('[{"lineIndex":0,"name":"Sipuli"}]')->0->>'medianUnitPrice')::numeric,
  2.0000,
  'household median price is calculated in a canonical unit'
);

select throws_ok(
  $$select get_receipt_scan_quality_context('[{"lineIndex":-1,"name":"Sipuli"}]')$$,
  'Invalid scan quality context input',
  'invalid quality context input is rejected'
);

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select throws_like(
  $$select get_receipt_scan_quality_context('[]')$$,
  '%permission denied for function get_receipt_scan_quality_context%',
  'anonymous callers cannot read household price context'
);

select ok(
  NOT has_table_privilege('authenticated', 'receipt_scan_quality_monitoring', 'SELECT'),
  'runtime users cannot read cross-household monitoring'
);

select * from finish();
rollback;
