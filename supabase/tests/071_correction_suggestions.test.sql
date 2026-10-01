begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

select has_table(
  'public', 'correction_suggestion_daily_usage',
  'exploratory suggestion usage table exists'
);
select has_function(
  'public', 'get_receipt_correction_suggestions', array['text', 'jsonb'],
  'privacy-safe correction suggestion function exists'
);
select has_index(
  'public', 'receipt_scan_feedback_events',
  'receipt_scan_feedback_global_suggestion_idx',
  'global suggestion feedback suppression has a focused lookup index'
);

insert into families (id, name) values
  ('18000000-0000-0000-0000-000000000001', 'Suggestion Family'),
  ('18000000-0000-0000-0000-000000000002', 'New User Family');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('28000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'suggestion-one@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Suggestion One"}', now(), now()),
  ('28000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'suggestion-two@example.test', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Suggestion Two"}', now(), now());

update profiles set family_id = '18000000-0000-0000-0000-000000000001'
where id = '28000000-0000-0000-0000-000000000001';
update profiles set family_id = '18000000-0000-0000-0000-000000000002'
where id = '28000000-0000-0000-0000-000000000002';

insert into household_correction_memory (
  family_id, correction_kind, source_value, source_normalized,
  target_value, target_normalized, context_key,
  historical_support_count, disagreement_count, confidence_score
)
values
  ('18000000-0000-0000-0000-000000000001', 'item_name', 'Banaanl', 'banaanl',
   'Banaani', 'banaani', 'k-market', 1, 0, 0.49),
  ('18000000-0000-0000-0000-000000000001', 'store_name', 'K Markef', 'k markef',
   'K-Market', 'k-market', '', 2, 0, 0.75);

insert into global_correction_candidates (
  correction_kind, source_value, source_normalized, target_value,
  target_normalized, context_key, support_event_count,
  effective_support_count, disagreement_count, distinct_receipt_count,
  distinct_contributor_count, distinct_household_count, distinct_day_count,
  confidence_score, evidence_tier, first_seen_at, last_seen_at
)
values (
  'item_name', 'Banaanl', 'banaanl', 'Banana', 'banana', 'k-market',
  4, 4, 0, 4, 3, 2, 3, 0.8, 'independent', now() - interval '3 days', now()
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '28000000-0000-0000-0000-000000000001', true);

select is(
  get_receipt_correction_suggestions(
    'K Markef', '[{"lineIndex":0,"name":"Banaanl"}]'::jsonb
  )->0->>'suggestedValue',
  'K-Market', 'store suggestions are returned for the current household'
);
select is(
  get_receipt_correction_suggestions(
    'K-Market', '[{"lineIndex":0,"name":"Banaanl"}]'::jsonb
  )->0->>'sourceType',
  'household_memory', 'private household memory ranks ahead of a global candidate'
);
select is(
  get_receipt_correction_suggestions(
    'K-Market', '[{"lineIndex":0,"name":"Banaanl"}]'::jsonb
  )->0->>'evidenceTier',
  'single', 'single historical evidence remains an explainable suggestion'
);

select set_config('request.jwt.claim.sub', '28000000-0000-0000-0000-000000000002', true);
select is(
  get_receipt_correction_suggestions(
    'K-Market', '[{"lineIndex":0,"name":"Banaanl"}]'::jsonb
  )->0->>'suggestedValue',
  'Banana', 'a new household can receive an independently supported global suggestion'
);
select is(
  get_receipt_correction_suggestions(
    'K-Market', '[{"lineIndex":0,"name":"Banaanl"}]'::jsonb
  )->0->>'sourceType',
  'global_candidate', 'global provenance is explicit without exposing raw evidence'
);
select ok(
  not (get_receipt_correction_suggestions(
    'K-Market', '[{"lineIndex":0,"name":"Banaanl"}]'::jsonb
  )->0 ?| array['familyId', 'contributors', 'supportCount', 'rawEvents']),
  'the runtime projection omits household identities and evidence counts'
);
select is(
  jsonb_array_length(get_receipt_correction_suggestions(
    'K-Market', '[{"lineIndex":0,"name":"Unknown"}]'::jsonb
  )),
  0, 'unknown values are left unchanged'
);
select throws_ok(
  $$select get_receipt_correction_suggestions('K-Market', '{"name":"not-an-array"}'::jsonb)$$,
  'Invalid correction suggestion input',
  'invalid suggestion input is rejected'
);

select * from finish();
rollback;
