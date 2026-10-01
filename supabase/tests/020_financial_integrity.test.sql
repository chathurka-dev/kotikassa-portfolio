begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

insert into families (id, name)
values ('11000000-0000-0000-0000-000000000001', 'Finance Family');

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
  '21000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'finance@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Finance User"}',
  now(),
  now()
);

update profiles
set family_id = '11000000-0000-0000-0000-000000000001',
    role = 'admin'
where id = '21000000-0000-0000-0000-000000000001';

insert into categories (id, family_id, name)
values (
  '31000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  'Groceries'
);

insert into savings_goals (
  id,
  family_id,
  created_by,
  name,
  target_amount,
  current_amount
)
values (
  '51000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  'Emergency fund',
  1000,
  100
);

insert into people (id, family_id, name)
values (
  '61000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  'Alex'
);

insert into people_transactions (
  id,
  person_id,
  family_id,
  added_by,
  type,
  amount,
  transaction_date
)
values (
  '71000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  'sent',
  25,
  current_date
);

insert into expense_items (
  id,
  family_id,
  added_by,
  name,
  amount,
  expense_date,
  is_manual,
  people_transaction_id
)
values (
  '41000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  'Money sent to Alex',
  25,
  current_date,
  true,
  '71000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '21000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    record_savings_transaction(
      '51000000-0000-0000-0000-000000000001',
      'deposit',
      50,
      'Monthly saving',
      current_date
    )->>'newBalance'
  )::numeric,
  150::numeric,
  'a deposit and cached savings balance update atomically'
);

select is(
  (
    record_savings_transaction(
      '51000000-0000-0000-0000-000000000001',
      'withdrawal',
      30,
      'Unexpected cost',
      current_date,
      null,
      true,
      10,
      current_date + 90
    )->>'newBalance'
  )::numeric,
  120::numeric,
  'a withdrawal updates the balance and creates a recovery plan atomically'
);

select is(
  (select count(*) from savings_recovery_plans where status = 'active'),
  1::bigint,
  'the withdrawal recovery plan is active'
);

select throws_like(
  $$
    select record_savings_transaction(
      '51000000-0000-0000-0000-000000000001',
      'withdrawal',
      1000,
      'Too much',
      current_date
    )
  $$,
  '%Withdrawal exceeds savings balance%',
  'a withdrawal cannot exceed the available savings balance'
);

select throws_like(
  $$
    insert into savings_contributions (
      goal_id,
      family_id,
      added_by,
      amount,
      contributed_at,
      transaction_type
    )
    values (
      '51000000-0000-0000-0000-000000000001',
      '11000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000001',
      5,
      current_date,
      'deposit'
    )
  $$,
  '%permission denied%',
  'clients cannot bypass the savings RPC with a direct ledger insert'
);

select lives_ok(
  $$
    delete from people_transactions
    where id = '71000000-0000-0000-0000-000000000001'
  $$,
  'a visible people transaction can be deleted'
);

select is(
  (
    select count(*)
    from expense_items
    where id = '41000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'deleting a people transaction cascades to its mirrored expense'
);

select lives_ok(
  $$
    insert into budgets (family_id, category_id, month, amount)
    values (
      '11000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      '2026-07-15',
      500
    )
  $$,
  'a positive budget can be recorded for a period'
);

select throws_like(
  $$
    insert into budgets (family_id, category_id, month, amount)
    values (
      '11000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      '2026-07-15',
      600
    )
  $$,
  '%duplicate key%',
  'a category cannot have two budgets for the same period'
);

select throws_like(
  $$
    insert into budgets (family_id, category_id, month, amount)
    values (
      '11000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      '2026-08-15',
      -1
    )
  $$,
  '%check constraint%',
  'budget amounts must be positive'
);

select throws_like(
  $$
    insert into people_transactions (
      person_id,
      family_id,
      added_by,
      type,
      amount
    )
    values (
      '61000000-0000-0000-0000-000000000001',
      '11000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000001',
      'invalid',
      10
    )
  $$,
  '%check constraint%',
  'people transaction types are constrained'
);

select * from finish();
rollback;
