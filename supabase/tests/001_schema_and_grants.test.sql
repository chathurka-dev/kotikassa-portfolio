begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

select ok(
  to_regclass('public.expense_items') is not null
    and to_regclass('public.savings_recovery_plans') is not null
    and to_regclass('public.catalog_items') is not null,
  'all migrations create the critical financial and reporting tables'
);

select ok(
  not exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any (array[
        'families',
        'profiles',
        'family_invites',
        'categories',
        'receipts',
        'expense_items',
        'income_entries',
        'savings_goals',
        'budgets',
        'item_category_memory',
        'recurring_expenses',
        'savings_contributions',
        'investments',
        'investment_contributions',
        'family_income_sources',
        'people',
        'people_transactions',
        'ocr_corrections',
        'ocr_receipt_corrections',
        'user_privacy_choices',
        'scan_rate_limits',
        'savings_recovery_plans',
        'catalog_items',
        'catalog_item_aliases'
      ])
      and not relation.relrowsecurity
  ),
  'RLS is enabled on every family or user scoped table'
);

select ok(
  has_table_privilege('authenticated', 'public.expense_items', 'SELECT'),
  'authenticated users can read expense items through RLS'
);

select ok(
  has_table_privilege('authenticated', 'public.people_transactions', 'DELETE'),
  'authenticated users can delete visible people transactions'
);

select ok(
  has_table_privilege('authenticated', 'public.catalog_items', 'SELECT')
    and not has_table_privilege('authenticated', 'public.catalog_items', 'INSERT'),
  'catalog tables are read-only outside their RPCs and triggers'
);

select ok(
  has_table_privilege('authenticated', 'public.savings_contributions', 'SELECT')
    and not has_table_privilege('authenticated', 'public.savings_contributions', 'INSERT'),
  'savings ledger writes are restricted to transaction-safe RPCs'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.record_savings_transaction(uuid,text,numeric,text,date,uuid,boolean,numeric,date)',
    'EXECUTE'
  ),
  'authenticated users can execute the savings transaction RPC'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.reconcile_receipt_image(uuid,text,numeric,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated users can execute the receipt reconciliation RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.merge_catalog_items(uuid,uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot execute catalog mutation RPCs'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'families_currency_check'
  )
    and exists (
      select 1
      from pg_constraint
      where conname = 'receipt_training_snapshot_required'
    )
    and exists (
      select 1
      from pg_constraint
      where conname = 'savings_contributions_transaction_type_check'
    ),
  'critical currency, consent, and savings constraints exist'
);

select * from finish();
rollback;
