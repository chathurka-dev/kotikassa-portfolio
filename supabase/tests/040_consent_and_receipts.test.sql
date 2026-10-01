begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into families (id, name)
values ('13000000-0000-0000-0000-000000000001', 'Receipt Family');

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '23000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'receipt@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Receipt User"}',
  now(),
  now()
);

update profiles
set family_id = '13000000-0000-0000-0000-000000000001'
where id = '23000000-0000-0000-0000-000000000001';

insert into receipts (
  id,
  family_id,
  uploaded_by,
  image_url,
  store_name,
  receipt_date,
  status,
  scan_provider,
  scan_model,
  scan_prompt_version,
  scan_schema_version
)
values
  (
    '33000000-0000-0000-0000-000000000001',
    '13000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    '13000000-0000-0000-0000-000000000001/33000000-0000-0000-0000-000000000001/original.jpg',
    'Training Store',
    current_date,
    'confirmed',
    'openai',
    'test-model',
    'test-prompt',
    'test-schema'
  ),
  (
    '33000000-0000-0000-0000-000000000002',
    '13000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    null,
    'Recovery Store',
    current_date,
    'confirmed',
    null,
    null,
    null,
    null
  );

insert into expense_items (
  id,
  family_id,
  receipt_id,
  added_by,
  name,
  amount,
  quantity,
  unit,
  expense_date,
  is_manual,
  is_on_receipt,
  receipt_line_index
)
values
  (
    '43000000-0000-0000-0000-000000000001',
    '13000000-0000-0000-0000-000000000001',
    '33000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    'Training item',
    5,
    1,
    'kpl',
    current_date,
    false,
    true,
    0
  ),
  (
    '43000000-0000-0000-0000-000000000002',
    '13000000-0000-0000-0000-000000000001',
    '33000000-0000-0000-0000-000000000002',
    '23000000-0000-0000-0000-000000000001',
    'Recovered item',
    7,
    1,
    'kpl',
    current_date,
    true,
    null,
    null
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '23000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    select set_privacy_choices('privacy-test-v1', true, 'scanning-test-v1')
  $$,
  'a user can record versioned privacy and receipt-scanning choices'
);

select ok(
  (
    select receipt_scanning_enabled
    from user_privacy_choices
    where user_id = '23000000-0000-0000-0000-000000000001'
  ),
  'receipt-scanning consent is stored with the user choice'
);

select ok(
  claim_receipt_training_prompt(
    '33000000-0000-0000-0000-000000000001',
    'training-prompt-v1'
  ),
  'the first eligible receipt can claim a model-training prompt'
);

select ok(
  not claim_receipt_training_prompt(
    '33000000-0000-0000-0000-000000000001',
    'training-prompt-v1'
  ),
  'the same scan cannot claim the next scheduled prompt'
);

select lives_ok(
  $$
    select set_receipt_training_choice(
      true,
      'training-choice-v1',
      '33000000-0000-0000-0000-000000000001'
    )
  $$,
  'an eligible confirmed receipt can receive a consent snapshot'
);

select ok(
  (
    select training_eligible
    from receipts
    where id = '33000000-0000-0000-0000-000000000001'
  ),
  'training eligibility is stored on the consented receipt'
);

select lives_ok(
  $$
    select set_receipt_training_choice(
      false,
      'training-choice-v1',
      null
    )
  $$,
  'a user can withdraw receipt-training consent'
);

select ok(
  not (
    select training_eligible
    from receipts
    where id = '33000000-0000-0000-0000-000000000001'
  ),
  'withdrawal immediately removes receipt training eligibility'
);

select throws_like(
  $$
    select reconcile_receipt_image(
      '33000000-0000-0000-0000-000000000002',
      'wrong-family/33000000-0000-0000-0000-000000000002/recovered.jpg',
      7,
      '{"provider":"openai","model":"test-model","promptVersion":"test-prompt","schemaVersion":"test-schema"}'::jsonb
    )
  $$,
  '%Invalid receipt image path%',
  'receipt reconciliation rejects an image outside the family receipt path'
);

select lives_ok(
  $$
    select reconcile_receipt_image(
      '33000000-0000-0000-0000-000000000002',
      '13000000-0000-0000-0000-000000000001/33000000-0000-0000-0000-000000000002/recovered.jpg',
      7,
      '{"provider":"openai","model":"test-model","promptVersion":"test-prompt","schemaVersion":"test-schema"}'::jsonb
    )
  $$,
  'receipt reconciliation atomically attaches a valid recovered image'
);

select * from finish();
rollback;
