begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(26);

select has_table('public', 'household_correction_memory', 'household correction memory exists');
select has_table('public', 'global_correction_candidates', 'private global candidate table exists');
select ok(
  has_table_privilege('service_role', 'public.household_correction_memory', 'INSERT'),
  'service-role correction-memory inserts are explicitly allowed'
);
select has_function(
  'public', 'backfill_household_correction_memory', array['uuid', 'boolean'],
  'idempotent household backfill function exists'
);

insert into families (id, name) values
  ('17000000-0000-0000-0000-000000000001', 'Memory Family'),
  ('17000000-0000-0000-0000-000000000002', 'Independent Family');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('27000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'memory-one@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Memory One"}', now(), now()),
  ('27000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'memory-two@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Memory Two"}', now(), now()),
  ('27000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'memory-three@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Memory Three"}', now(), now());

update profiles set family_id = '17000000-0000-0000-0000-000000000001'
where id in ('27000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000002');
update profiles set family_id = '17000000-0000-0000-0000-000000000002'
where id = '27000000-0000-0000-0000-000000000003';

insert into receipts (
  id, family_id, uploaded_by, store_name, receipt_date, status,
  scan_provider, scan_model, scan_prompt_version, scan_schema_version,
  scan_feedback_expected, scan_feedback_schema_version
)
values
  ('37000000-0000-0000-0000-000000000001', '17000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', 'K-Market', current_date - 3, 'confirmed', 'openai', 'test-model', 'v1', 'v1', true, 'v1'),
  ('37000000-0000-0000-0000-000000000002', '17000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', 'K-Market', current_date - 2, 'confirmed', 'openai', 'test-model', 'v1', 'v1', true, 'v1'),
  ('37000000-0000-0000-0000-000000000003', '17000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000002', 'K-Market', current_date - 1, 'confirmed', 'openai', 'test-model', 'v1', 'v1', true, 'v1'),
  ('37000000-0000-0000-0000-000000000004', '17000000-0000-0000-0000-000000000002', '27000000-0000-0000-0000-000000000003', 'K-Market', current_date, 'confirmed', 'openai', 'test-model', 'v1', 'v1', true, 'v1'),
  ('37000000-0000-0000-0000-000000000005', '17000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', 'Legacy Store Corrected', current_date - 10, 'confirmed', 'openai', 'legacy-model', 'legacy-v1', 'v1', false, null);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '27000000-0000-0000-0000-000000000001', true);

select is(
  record_receipt_scan_feedback(
    '37000000-0000-0000-0000-000000000001', 'v1',
    '[{"eventKey":"review:saved","eventType":"review_saved","entityType":"receipt","sourceType":"user","context":{"confirmationMode":"save_only"}},{"eventKey":"item:0:field:name","eventType":"field_changed","entityType":"item","receiptLineIndex":0,"fieldName":"name","rawValue":"Banaanl","finalValue":"Banaani","sourceType":"model","sourceKey":"test-model","sourceVersion":"v1","context":{"storeName":"K-Market"}}]'::jsonb
  ), 2, 'feedback creates the first memory evidence'
);

select is(
  (select live_support_count from household_correction_memory where family_id = '17000000-0000-0000-0000-000000000001' and target_normalized = 'banaani'),
  1, 'the first correction creates one live support'
);
select ok(
  (select scan_feedback_recorded_at is not null from receipts where id = '37000000-0000-0000-0000-000000000001'),
  'feedback completion is visible on the receipt'
);
select is(
  record_receipt_scan_feedback(
    '37000000-0000-0000-0000-000000000001', 'v1',
    '[{"eventKey":"review:saved","eventType":"review_saved","entityType":"receipt","sourceType":"user","context":{}}]'::jsonb
  ), 0, 'feedback retry is idempotent'
);
select is(
  (select live_support_count from household_correction_memory where family_id = '17000000-0000-0000-0000-000000000001' and target_normalized = 'banaani'),
  1, 'an idempotent retry cannot inflate memory support'
);

select is(record_receipt_scan_feedback(
  '37000000-0000-0000-0000-000000000002', 'v1',
  '[{"eventKey":"review:saved","eventType":"review_saved","entityType":"receipt","sourceType":"user","context":{}},{"eventKey":"item:0:field:name","eventType":"field_changed","entityType":"item","receiptLineIndex":0,"fieldName":"name","rawValue":"Banaanl","finalValue":"Banaani","sourceType":"model","context":{"storeName":"K-Market"}}]'::jsonb
), 2, 'the same contributor can add repeated household evidence');

select set_config('request.jwt.claim.sub', '27000000-0000-0000-0000-000000000002', true);
select is(record_receipt_scan_feedback(
  '37000000-0000-0000-0000-000000000003', 'v1',
  '[{"eventKey":"review:saved","eventType":"review_saved","entityType":"receipt","sourceType":"user","context":{}},{"eventKey":"item:0:field:name","eventType":"field_changed","entityType":"item","receiptLineIndex":0,"fieldName":"name","rawValue":"Banaanl","finalValue":"Banaani","sourceType":"model","context":{"storeName":"K-Market"}}]'::jsonb
), 2, 'another family member can add independent contributor evidence');

select is(
  (select distinct_receipt_count from household_correction_memory where family_id = '17000000-0000-0000-0000-000000000001' and target_normalized = 'banaani'),
  3, 'memory counts distinct supporting receipts'
);
select is(
  (select distinct_contributor_count from household_correction_memory where family_id = '17000000-0000-0000-0000-000000000001' and target_normalized = 'banaani'),
  2, 'memory counts distinct contributors separately from repeats'
);

select set_config('request.jwt.claim.sub', '27000000-0000-0000-0000-000000000001', true);
select is(record_receipt_scan_feedback(
  '37000000-0000-0000-0000-000000000001', 'v2',
  '[{"eventKey":"item:0:suggestion:rejected","eventType":"suggestion_rejected","entityType":"item","fieldName":"name","rawValue":"Banaanl","finalValue":"Banaani","sourceType":"household_memory","context":{"storeName":"K-Market"}},{"eventKey":"item:0:suggestion:undone","eventType":"suggestion_undone","entityType":"item","fieldName":"name","rawValue":"Banaanl","finalValue":"Banaani","sourceType":"household_memory","context":{"storeName":"K-Market"}}]'::jsonb
), 2, 'rejection and undo outcomes are captured');
select results_eq(
  $$select rejection_count, undo_count from household_correction_memory where family_id = '17000000-0000-0000-0000-000000000001' and target_normalized = 'banaani'$$,
  $$values (1, 1)$$,
  'negative feedback lowers the same candidate instead of creating support'
);

reset role;
select is(refresh_global_correction_candidates(), 0, 'non-consented feedback is excluded globally');

insert into user_privacy_choices (
  user_id, privacy_notice_version, receipt_training_enabled,
  receipt_training_choice_version, receipt_training_choice_at,
  receipt_training_consented_at
)
values
  ('27000000-0000-0000-0000-000000000001', 'v1', true, 'training-v1', now(), now()),
  ('27000000-0000-0000-0000-000000000002', 'v1', true, 'training-v1', now(), now()),
  ('27000000-0000-0000-0000-000000000003', 'v1', true, 'training-v1', now(), now());

update receipts set
  training_eligible = true,
  training_consent_version = 'training-v1',
  training_consented_at = now()
where id in (
  '37000000-0000-0000-0000-000000000001',
  '37000000-0000-0000-0000-000000000002',
  '37000000-0000-0000-0000-000000000003',
  '37000000-0000-0000-0000-000000000004'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '27000000-0000-0000-0000-000000000003', true);
select is(record_receipt_scan_feedback(
  '37000000-0000-0000-0000-000000000004', 'v1',
  '[{"eventKey":"review:saved","eventType":"review_saved","entityType":"receipt","sourceType":"user","context":{}},{"eventKey":"item:0:field:name","eventType":"field_changed","entityType":"item","receiptLineIndex":0,"fieldName":"name","rawValue":"Banaanl","finalValue":"Banaani","sourceType":"model","context":{"storeName":"K-Market"}}]'::jsonb
), 2, 'a consented independent household can add matching evidence');
reset role;

select is(refresh_global_correction_candidates(), 1, 'global refresh emits one consent-filtered candidate');
select is(
  (select distinct_household_count from global_correction_candidates),
  2, 'global candidates count independent households'
);
select is(
  (select evidence_tier from global_correction_candidates),
  'independent', 'two households produce independent evidence'
);

insert into expense_items (
  family_id, receipt_id, added_by, name, amount, quantity, unit, expense_date,
  is_manual, is_on_receipt
)
values (
  '17000000-0000-0000-0000-000000000001',
  '37000000-0000-0000-0000-000000000005',
  '27000000-0000-0000-0000-000000000001',
  'Legacy Store Corrected', 1, 1, 'kpl', current_date - 10, false, true
);
insert into ocr_receipt_corrections (
  family_id, receipt_id, ocr_raw_store_name, corrected_store_name,
  ocr_raw_date, corrected_date
)
values (
  '17000000-0000-0000-0000-000000000001',
  '37000000-0000-0000-0000-000000000005',
  'Legacy Store', 'Legacy Store Corrected', null, null
);

select is(
  (backfill_household_correction_memory('17000000-0000-0000-0000-000000000001', false)->>'dryRun')::boolean,
  true, 'historical backfill defaults to a dry run'
);
select is(
  (backfill_household_correction_memory('17000000-0000-0000-0000-000000000001', true)->>'candidateCount')::integer,
  1, 'reliable legacy evidence can be applied'
);
select lives_ok(
  $$select backfill_household_correction_memory('17000000-0000-0000-0000-000000000001', true)$$,
  'historical backfill is safely repeatable'
);
select is(
  (select historical_support_count from household_correction_memory where source_normalized = 'legacy store'),
  1, 'repeating backfill does not inflate historical support'
);

insert into categories (id, family_id, name)
values (
  '47000000-0000-0000-0000-000000000001',
  '17000000-0000-0000-0000-000000000001',
  'Memory Category'
);
insert into expense_items (
  family_id, added_by, category_id, name, amount, expense_date, is_manual
)
values
  ('17000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000001', 'Category Memory Item', 1, current_date, true),
  ('17000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001', '47000000-0000-0000-0000-000000000001', 'Category Memory Item', 2, current_date, true);

select is(
  (select support_count from item_category_memory where item_name = 'category memory item'),
  2, 'category memory tracks repeated support explicitly'
);
select ok(
  (select confidence_score > 0.5 from item_category_memory where item_name = 'category memory item'),
  'category memory exposes a bounded confidence score'
);

select * from finish();
rollback;
