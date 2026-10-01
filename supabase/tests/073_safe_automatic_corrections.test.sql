begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(21);

select has_table(
  'public', 'correction_automation_evaluations',
  'fixed-holdout automation evaluations are persisted'
);
select has_column(
  'public', 'correction_automation_evaluations', 'evaluation_order',
  'automation evaluations have deterministic insertion order'
);
select has_function(
  'public', 'record_correction_automation_evaluation',
  array['text', 'text', 'text', 'text', 'integer', 'integer', 'integer'],
  'service-role evaluation recorder exists'
);
select has_function(
  'public', 'get_receipt_correction_recommendations', array['text', 'jsonb'],
  'policy-enriched correction recommendation RPC exists'
);
select has_view(
  'public', 'correction_automation_monitoring',
  'automatic correction monitoring view exists'
);

insert into families (id, name) values
  ('1a000000-0000-0000-0000-000000000001', 'Automatic Family'),
  ('1a000000-0000-0000-0000-000000000002', 'Global Family');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('2a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'automatic@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Automatic"}', now(), now()),
  ('2a000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'global-automatic@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Global"}', now(), now());

update profiles set family_id = '1a000000-0000-0000-0000-000000000001'
where id = '2a000000-0000-0000-0000-000000000001';
update profiles set family_id = '1a000000-0000-0000-0000-000000000002'
where id = '2a000000-0000-0000-0000-000000000002';

insert into household_correction_memory (
  family_id, correction_kind, source_value, source_normalized,
  target_value, target_normalized, context_key,
  historical_support_count, disagreement_count, rejection_count, undo_count,
  distinct_receipt_count, distinct_contributor_count, confidence_score
) values (
  '1a000000-0000-0000-0000-000000000001', 'item_name', 'Banaanl', 'banaanl',
  'Banaani', 'banaani', 'k-market', 5, 0, 0, 0, 5, 1, 0.95
);

insert into global_correction_candidates (
  correction_kind, source_value, source_normalized, target_value,
  target_normalized, context_key, support_event_count,
  effective_support_count, disagreement_count, distinct_receipt_count,
  distinct_contributor_count, distinct_household_count, distinct_day_count,
  confidence_score, evidence_tier, first_seen_at, last_seen_at
) values
  ('item_name', 'GlobalStrong', 'globalstrong', 'Global Strong', 'global strong', '',
   20, 20, 0, 20, 4, 4, 5, 0.95, 'independent', now() - interval '30 days', now()),
  ('item_name', 'GlobalTwo', 'globaltwo', 'Global Two', 'global two', '',
   12, 12, 0, 12, 2, 2, 4, 0.95, 'independent', now() - interval '30 days', now()),
  ('item_name', 'GlobalStale', 'globalstale', 'Global Stale', 'global stale', '',
   20, 20, 0, 20, 4, 4, 5, 0.95, 'independent', now() - interval '2 years', now() - interval '2 years');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '2a000000-0000-0000-0000-000000000001', true);

select is(
  get_receipt_correction_recommendations(
    'K-Market', '[{"lineIndex":0,"name":"Banaanl"}]'::jsonb
  )->0->>'autoApply',
  'false', 'learned automation is disabled before a passing holdout evaluation'
);

set local role service_role;
select is(
  (record_correction_automation_evaluation(
    'household', 'item_name', 'household-low', repeat('a', 64), 49, 49, 180
  )->>'passed')::boolean,
  false, 'a household evaluation below the minimum sample cannot enable automation'
);
select is(
  (record_correction_automation_evaluation(
    'household', 'item_name', 'household-v1', repeat('b', 64), 50, 49, 180
  )->>'passed')::boolean,
  true, 'household automation requires at least 98 percent precision over 50 cases'
);
select is(
  (record_correction_automation_evaluation(
    'global', 'item_name', 'global-v1', repeat('c', 64), 200, 199, 180
  )->>'passed')::boolean,
  true, 'global automation requires at least 99.5 percent precision over 100 cases'
);
select throws_ok(
  $$select record_correction_automation_evaluation(
    'global', 'price', 'invalid', repeat('d', 64), 100, 100, 180
  )$$,
  'Invalid automation evaluation',
  'financial correction kinds cannot be enabled'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '2a000000-0000-0000-0000-000000000001', true);

select is(
  get_receipt_correction_recommendations(
    'K-Market', '[{"lineIndex":0,"name":"Banaanl"}]'::jsonb
  )->0->>'autoApply',
  'true', 'strong household aliases become reversible automatic corrections'
);
select is(
  get_receipt_correction_recommendations(
    'K-Market', '[{"lineIndex":0,"name":"Banaanl"}]'::jsonb
  )->0->>'automationReason',
  'household_verified', 'household automation explains its eligibility source'
);
select is(
  get_receipt_correction_recommendations(
    'K-Market', '[{"lineIndex":0,"name":"Banaanl"}]'::jsonb
  )->0->>'automationPolicyVersion',
  'household-v1', 'household automation exposes the evaluated policy version'
);

-- Correction memory is read-only to runtime users. Add the conflicting fixture
-- as the test owner, then restore the authenticated caller for the assertion.
reset role;

insert into household_correction_memory (
  family_id, correction_kind, source_value, source_normalized,
  target_value, target_normalized, context_key,
  historical_support_count, disagreement_count, rejection_count, undo_count,
  distinct_receipt_count, distinct_contributor_count, confidence_score
) values (
  '1a000000-0000-0000-0000-000000000001', 'item_name', 'Banaanl', 'banaanl',
  'Banaani premium', 'banaani premium', 'k-market', 2, 0, 0, 0, 2, 1, 0.8
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '2a000000-0000-0000-0000-000000000001', true);

select is(
  get_receipt_correction_recommendations(
    'K-Market', '[{"lineIndex":0,"name":"Banaanl"}]'::jsonb
  )->0->>'autoApply',
  'false', 'a competing active target keeps a household alias under review'
);

select set_config('request.jwt.claim.sub', '2a000000-0000-0000-0000-000000000002', true);

select is(
  get_receipt_correction_recommendations(
    '', '[{"lineIndex":0,"name":"GlobalStrong"}]'::jsonb
  )->0->>'autoApply',
  'true', 'independently supported global aliases can pass the stricter gate'
);
select is(
  get_receipt_correction_recommendations(
    '', '[{"lineIndex":0,"name":"GlobalStrong"}]'::jsonb
  )->0->>'automationReason',
  'global_holdout_verified', 'global automation reports holdout-verified provenance'
);
select is(
  get_receipt_correction_recommendations(
    '', '[{"lineIndex":0,"name":"GlobalTwo"}]'::jsonb
  )->0->>'autoApply',
  'false', 'two households are insufficient for global automatic correction'
);
select is(
  get_receipt_correction_recommendations(
    '', '[{"lineIndex":0,"name":"GlobalStale"}]'::jsonb
  )->0->>'autoApply',
  'false', 'stale global evidence cannot drive automatic correction'
);
select ok(
  not (get_receipt_correction_recommendations(
    '', '[{"lineIndex":0,"name":"GlobalStrong"}]'::jsonb
  )->0 ?| array['supportCount', 'contributors', 'households', 'precision']),
  'the automatic runtime projection keeps aggregate evidence private'
);

select ok(
  NOT has_table_privilege('authenticated', 'correction_automation_evaluations', 'SELECT'),
  'runtime users cannot read holdout evaluation records'
);
select ok(
  NOT has_table_privilege('authenticated', 'correction_automation_monitoring', 'SELECT'),
  'runtime users cannot read cross-household automation monitoring'
);

select * from finish();
rollback;
