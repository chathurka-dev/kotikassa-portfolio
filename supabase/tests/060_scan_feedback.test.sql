begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

select has_table('public', 'receipt_scan_feedback_events', 'scan feedback table exists');
select has_function(
  'public',
  'record_receipt_scan_feedback',
  array['uuid', 'text', 'jsonb'],
  'validated scan feedback RPC exists'
);

insert into families (id, name)
values
  ('16000000-0000-0000-0000-000000000001', 'Feedback Family'),
  ('16000000-0000-0000-0000-000000000002', 'Other Family');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '26000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'feedback@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Feedback User"}', now(), now()
  ),
  (
    '26000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'other-feedback@example.test', '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Other Feedback User"}', now(), now()
  );

update profiles set family_id = '16000000-0000-0000-0000-000000000001'
where id = '26000000-0000-0000-0000-000000000001';
update profiles set family_id = '16000000-0000-0000-0000-000000000002'
where id = '26000000-0000-0000-0000-000000000002';

insert into receipts (
  id, family_id, uploaded_by, store_name, receipt_date, status,
  scan_provider, scan_model, scan_prompt_version, scan_schema_version
)
values
  (
    '36000000-0000-0000-0000-000000000001',
    '16000000-0000-0000-0000-000000000001',
    '26000000-0000-0000-0000-000000000001',
    'Feedback Store', current_date, 'confirmed',
    'openai', 'test-model', 'test-prompt', 'test-schema'
  ),
  (
    '36000000-0000-0000-0000-000000000002',
    '16000000-0000-0000-0000-000000000002',
    '26000000-0000-0000-0000-000000000002',
    'Other Store', current_date, 'confirmed',
    'openai', 'test-model', 'test-prompt', 'test-schema'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '26000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  record_receipt_scan_feedback(
    '36000000-0000-0000-0000-000000000001',
    'v1',
    '[{"eventKey":"review:saved","eventType":"review_saved","entityType":"receipt","sourceType":"user","context":{"confirmationMode":"save_only"}},{"eventKey":"item:0:field:name","eventType":"field_changed","entityType":"item","receiptLineIndex":0,"fieldName":"name","rawValue":"Banaanl","finalValue":"Banaani","sourceType":"model","sourceKey":"test-model","sourceVersion":"test-prompt","context":{}}]'::jsonb
  ),
  2,
  'the uploader can record validated feedback events'
);

-- Runtime users intentionally cannot query the private event table directly.
-- Verify persisted internals as the test owner, then restore the runtime role.
reset role;

select is(
  (select count(*)::integer from receipt_scan_feedback_events where receipt_id = '36000000-0000-0000-0000-000000000001'),
  2,
  'feedback events are stored'
);

select is(
  (select actor_id from receipt_scan_feedback_events where event_key = 'review:saved'),
  '26000000-0000-0000-0000-000000000001'::uuid,
  'the database records the authenticated contributor'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '26000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  record_receipt_scan_feedback(
    '36000000-0000-0000-0000-000000000001',
    'v1',
    '[{"eventKey":"review:saved","eventType":"review_saved","entityType":"receipt","sourceType":"user","context":{}}]'::jsonb
  ),
  0,
  'retries are idempotent'
);

select throws_like(
  $$select record_receipt_scan_feedback(
    '36000000-0000-0000-0000-000000000002', 'v1',
    '[{"eventKey":"review:saved","eventType":"review_saved","entityType":"receipt","sourceType":"user","context":{}}]'::jsonb
  )$$,
  '%Eligible receipt not found%',
  'a user cannot record feedback for another household'
);

select throws_like(
  $$select record_receipt_scan_feedback(
    '36000000-0000-0000-0000-000000000001', 'v1',
    '[{"eventKey":"bad","eventType":"trusted_without_review","entityType":"receipt","sourceType":"user","context":{}}]'::jsonb
  )$$,
  '%Invalid feedback event%',
  'unknown feedback semantics are rejected'
);

reset role;
delete from receipts where id = '36000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::integer from receipt_scan_feedback_events where receipt_id = '36000000-0000-0000-0000-000000000001'),
  0,
  'receipt deletion removes linked feedback lineage'
);

select * from finish();
rollback;
