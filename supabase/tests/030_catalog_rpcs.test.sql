begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

insert into families (id, name)
values
  ('12000000-0000-0000-0000-000000000001', 'Catalog Family'),
  ('12000000-0000-0000-0000-000000000002', 'Other Catalog Family');

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
    '22000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'catalog@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Catalog User"}',
    now(),
    now()
  ),
  (
    '22000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'other-catalog@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Other Catalog User"}',
    now(),
    now()
  );

update profiles
set family_id = '12000000-0000-0000-0000-000000000001'
where id = '22000000-0000-0000-0000-000000000001';

update profiles
set family_id = '12000000-0000-0000-0000-000000000002'
where id = '22000000-0000-0000-0000-000000000002';

insert into catalog_items (
  id,
  family_id,
  canonical_name,
  normalized_name
)
values (
  '52000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000002',
  'Other family item',
  normalize_catalog_item_name('Other family item')
);

insert into catalog_item_aliases (
  family_id,
  catalog_item_id,
  alias_name,
  normalized_alias
)
values (
  '12000000-0000-0000-0000-000000000002',
  '52000000-0000-0000-0000-000000000001',
  'Other family item',
  normalize_catalog_item_name('Other family item')
);

insert into expense_items (
  id,
  family_id,
  added_by,
  name,
  amount,
  quantity,
  unit,
  expense_date,
  is_manual
)
values
  (
    '42000000-0000-0000-0000-000000000001',
    '12000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    'Milk',
    2,
    1,
    'l',
    current_date,
    true
  ),
  (
    '42000000-0000-0000-0000-000000000002',
    '12000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    ' milk ',
    2.2,
    1,
    'l',
    current_date,
    true
  ),
  (
    '42000000-0000-0000-0000-000000000003',
    '12000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    'Banana',
    1.5,
    1,
    'kg',
    current_date,
    true
  ),
  (
    '42000000-0000-0000-0000-000000000004',
    '12000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    'Banana Chiquita',
    2,
    1,
    'kg',
    current_date,
    true
  ),
  (
    '42000000-0000-0000-0000-000000000005',
    '12000000-0000-0000-0000-000000000002',
    '22000000-0000-0000-0000-000000000002',
    'Other family item',
    3,
    1,
    'kpl',
    current_date,
    true
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(distinct catalog_item_id)
    from expense_items
    where id in (
      '42000000-0000-0000-0000-000000000001',
      '42000000-0000-0000-0000-000000000002'
    )
  ),
  1::bigint,
  'exact normalized expense names share one catalog item'
);

select isnt(
  (
    select catalog_item_id
    from expense_items
    where id = '42000000-0000-0000-0000-000000000003'
  ),
  (
    select catalog_item_id
    from expense_items
    where id = '42000000-0000-0000-0000-000000000004'
  ),
  'similar but non-identical names remain separate until explicitly merged'
);

select lives_ok(
  $$
    select merge_catalog_items(
      (
        select catalog_item_id
        from expense_items
        where id = '42000000-0000-0000-0000-000000000003'
      ),
      (
        select catalog_item_id
        from expense_items
        where id = '42000000-0000-0000-0000-000000000004'
      )
    )
  $$,
  'a family member can explicitly merge two family catalog items'
);

select is(
  (
    select count(distinct catalog_item_id)
    from expense_items
    where id in (
      '42000000-0000-0000-0000-000000000003',
      '42000000-0000-0000-0000-000000000004'
    )
  ),
  1::bigint,
  'merging reassigns historical expenses to the target item'
);

select lives_ok(
  $$
    select separate_catalog_item_alias(
      (
        select catalog_item_id
        from expense_items
        where id = '42000000-0000-0000-0000-000000000003'
      ),
      (
        select id
        from catalog_item_aliases
        where normalized_alias = normalize_catalog_item_name('Banana Chiquita')
      )
    )
  $$,
  'a mistakenly merged non-primary alias can be separated'
);

select isnt(
  (
    select catalog_item_id
    from expense_items
    where id = '42000000-0000-0000-0000-000000000003'
  ),
  (
    select catalog_item_id
    from expense_items
    where id = '42000000-0000-0000-0000-000000000004'
  ),
  'separation restores different catalog items for exact historical names'
);

select throws_like(
  $$
    select rename_catalog_item(
      '52000000-0000-0000-0000-000000000001',
      'Forbidden rename'
    )
  $$,
  '%Catalog item not found%',
  'a user cannot rename another family catalog item'
);

select throws_like(
  $$
    insert into catalog_items (family_id, canonical_name, normalized_name)
    values (
      '12000000-0000-0000-0000-000000000001',
      'Direct item',
      'direct item'
    )
  $$,
  '%permission denied%',
  'clients cannot bypass catalog RPCs with direct writes'
);

select * from finish();
rollback;
