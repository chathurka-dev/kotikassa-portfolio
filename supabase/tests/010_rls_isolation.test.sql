begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into families (id, name)
values
  ('10000000-0000-0000-0000-000000000001', 'Family Alpha'),
  ('10000000-0000-0000-0000-000000000002', 'Family Beta');

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
values
  (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'alpha-admin@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Alpha Admin"}',
    now(),
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'alpha-member@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Alpha Member"}',
    now(),
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'beta-admin@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Beta Admin"}',
    now(),
    now()
  );

update profiles
set family_id = '10000000-0000-0000-0000-000000000001',
    role = case
      when id = '20000000-0000-0000-0000-000000000001' then 'admin'
      else 'member'
    end
where id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002'
);

update profiles
set family_id = '10000000-0000-0000-0000-000000000002',
    role = 'admin'
where id = '20000000-0000-0000-0000-000000000003';

insert into categories (id, family_id, name)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Alpha groceries'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'Beta groceries'
  );

insert into expense_items (
  id,
  family_id,
  added_by,
  category_id,
  name,
  amount,
  expense_date,
  is_manual
)
values
  (
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'Alpha item',
    10,
    current_date,
    true
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000002',
    'Beta item',
    20,
    current_date,
    true
  );

insert into savings_goals (
  id,
  family_id,
  created_by,
  name,
  target_amount,
  current_amount,
  is_private
)
values
  (
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Shared Alpha goal',
    1000,
    100,
    false
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Private Alpha goal',
    500,
    50,
    true
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000003',
    'Beta goal',
    700,
    70,
    false
  );

insert into user_privacy_choices (user_id, privacy_notice_version)
values
  ('20000000-0000-0000-0000-000000000001', 'privacy-test-v1'),
  ('20000000-0000-0000-0000-000000000003', 'privacy-test-v1');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from families),
  1::bigint,
  'a member sees only their own family'
);

select is(
  (select count(*) from categories),
  1::bigint,
  'family categories are isolated'
);

select is(
  (select count(*) from expense_items),
  1::bigint,
  'family expenses are isolated'
);

select is(
  (select count(*) from savings_goals),
  1::bigint,
  'a family member sees shared goals but not another member private goal'
);

select is(
  (select count(*) from user_privacy_choices),
  0::bigint,
  'privacy choices remain private to their owner'
);

select throws_like(
  $$
    insert into categories (family_id, name)
    values ('10000000-0000-0000-0000-000000000002', 'Cross-family write')
  $$,
  '%row-level security%',
  'a member cannot insert data for another family'
);

with changed as (
  update categories
  set name = 'Changed by Alpha'
  where id = '30000000-0000-0000-0000-000000000002'
  returning 1
)
select is(
  (select count(*) from changed),
  0::bigint,
  'a member cannot update another family row'
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000001',
  true
);

select is(
  (select count(*) from savings_goals),
  2::bigint,
  'a private goal remains visible to its creator'
);

select is(
  (select count(*) from user_privacy_choices),
  1::bigint,
  'a user can read their own privacy choices'
);

with removed as (
  delete from expense_items
  where id = '40000000-0000-0000-0000-000000000002'
  returning 1
)
select is(
  (select count(*) from removed),
  0::bigint,
  'a user cannot delete another family expense'
);

select * from finish();
rollback;
