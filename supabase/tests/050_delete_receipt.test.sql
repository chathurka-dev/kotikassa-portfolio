begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

insert into families (id, name)
values
  ('15000000-0000-0000-0000-000000000001', 'Receipt Delete Family'),
  ('15000000-0000-0000-0000-000000000002', 'Other Family');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '25000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'receipt-delete@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Receipt Delete User"}',
  now(),
  now()
);

update profiles
set family_id = '15000000-0000-0000-0000-000000000001'
where id = '25000000-0000-0000-0000-000000000001';

insert into receipts (id, family_id, uploaded_by, image_url, receipt_date, status)
values
  (
    '35000000-0000-0000-0000-000000000001',
    '15000000-0000-0000-0000-000000000001',
    '25000000-0000-0000-0000-000000000001',
    '15000000-0000-0000-0000-000000000001/receipt-delete.jpg',
    current_date,
    'confirmed'
  ),
  (
    '35000000-0000-0000-0000-000000000002',
    '15000000-0000-0000-0000-000000000002',
    null,
    null,
    current_date,
    'confirmed'
  ),
  (
    '35000000-0000-0000-0000-000000000003',
    '15000000-0000-0000-0000-000000000001',
    '25000000-0000-0000-0000-000000000001',
    null,
    current_date,
    'confirmed'
  );

insert into expense_items (
  id, family_id, receipt_id, added_by, name, amount, quantity, unit,
  expense_date, is_manual
)
values
  (
    '45000000-0000-0000-0000-000000000001',
    '15000000-0000-0000-0000-000000000001',
    '35000000-0000-0000-0000-000000000001',
    '25000000-0000-0000-0000-000000000001',
    'First ordinary item', 2, 1, 'kpl', current_date, false
  ),
  (
    '45000000-0000-0000-0000-000000000002',
    '15000000-0000-0000-0000-000000000001',
    '35000000-0000-0000-0000-000000000001',
    '25000000-0000-0000-0000-000000000001',
    'Second ordinary item', 3, 1, 'kpl', current_date, false
  );

insert into people (id, family_id, name)
values (
  '65000000-0000-0000-0000-000000000001',
  '15000000-0000-0000-0000-000000000001',
  'Receipt-linked person'
);

insert into people_transactions (
  id, person_id, family_id, added_by, type, amount, transaction_date
)
values (
  '75000000-0000-0000-0000-000000000001',
  '65000000-0000-0000-0000-000000000001',
  '15000000-0000-0000-0000-000000000001',
  '25000000-0000-0000-0000-000000000001',
  'sent',
  4,
  current_date
);

insert into expense_items (
  id, family_id, receipt_id, added_by, name, amount, quantity, unit,
  expense_date, is_manual, people_transaction_id
)
values (
  '45000000-0000-0000-0000-000000000003',
  '15000000-0000-0000-0000-000000000001',
  '35000000-0000-0000-0000-000000000003',
  '25000000-0000-0000-0000-000000000001',
  'People-linked item', 4, 1, 'kpl', current_date, false,
  '75000000-0000-0000-0000-000000000001'
);

select ok(
  has_function_privilege('authenticated', 'public.delete_receipt(uuid)', 'EXECUTE'),
  'authenticated users can execute the receipt deletion RPC'
);

select ok(
  not has_function_privilege('anon', 'public.delete_receipt(uuid)', 'EXECUTE'),
  'anonymous users cannot execute the receipt deletion RPC'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '25000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(
  (
    select result->>'image_path' = '15000000-0000-0000-0000-000000000001/receipt-delete.jpg'
      and (result->>'deleted_item_count')::integer = 2
    from (select delete_receipt('35000000-0000-0000-0000-000000000001') as result) deletion
  ),
  'receipt deletion returns its image path and deleted item count'
);

select is(
  (select count(*) from receipts where id = '35000000-0000-0000-0000-000000000001'),
  0::bigint,
  'receipt deletion removes the family receipt'
);

select is(
  (select count(*) from expense_items where receipt_id = '35000000-0000-0000-0000-000000000001'),
  0::bigint,
  'receipt deletion removes all linked ordinary expense items atomically'
);

select throws_like(
  $$ select delete_receipt('35000000-0000-0000-0000-000000000002') $$,
  '%Receipt not found%',
  'receipt deletion does not reveal or mutate another family receipt'
);

select is(
  delete_receipt('35000000-0000-0000-0000-000000000003')->>'reason',
  'people_locked',
  'receipt deletion reports a stable reason when an item is People-linked'
);

select is(
  (select count(*) from receipts where id = '35000000-0000-0000-0000-000000000003'),
  1::bigint,
  'a People-linked receipt remains after deletion is refused'
);

select is(
  (select count(*) from expense_items where id = '45000000-0000-0000-0000-000000000003'),
  1::bigint,
  'a People-linked expense remains after deletion is refused'
);

select * from finish();
rollback;
