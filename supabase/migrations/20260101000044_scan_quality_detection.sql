-- Phase 9.1 Milestone 4: deterministic scan-risk evidence, private household
-- price context, and service-role monitoring. Warnings are advisory: this
-- migration never changes a confirmed financial value automatically.

ALTER TABLE receipts
  ADD COLUMN scan_quality_schema_version text,
  ADD COLUMN scan_quality_score smallint
    CHECK (scan_quality_score IS NULL OR scan_quality_score BETWEEN 0 AND 100),
  ADD COLUMN scan_quality_level text
    CHECK (scan_quality_level IS NULL OR scan_quality_level IN ('low', 'medium', 'high')),
  ADD COLUMN scan_quality_warnings jsonb
    CHECK (scan_quality_warnings IS NULL OR jsonb_typeof(scan_quality_warnings) = 'array'),
  ADD COLUMN scan_review_duration_ms integer
    CHECK (scan_review_duration_ms IS NULL OR scan_review_duration_ms >= 0),
  ADD COLUMN scan_low_review_risk boolean NOT NULL DEFAULT false,
  ADD COLUMN scan_saved_with_unresolved_warnings boolean NOT NULL DEFAULT false;

CREATE INDEX receipts_scan_quality_monitoring_idx
  ON receipts (scan_model, scan_prompt_version, scan_quality_level, created_at)
  WHERE scan_quality_schema_version IS NOT NULL;

CREATE OR REPLACE FUNCTION get_receipt_scan_quality_context(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_family uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT family_id INTO v_family FROM profiles WHERE id = v_user;
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'Household profile required';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) > 100
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_items) item
       WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
          OR jsonb_typeof(item->'lineIndex') IS DISTINCT FROM 'number'
          OR (item->>'lineIndex')::integer < 0
          OR NULLIF(btrim(item->>'name'), '') IS NULL
          OR length(item->>'name') > 120
     )
  THEN
    RAISE EXCEPTION 'Invalid scan quality context input';
  END IF;

  RETURN COALESCE((
    WITH requested AS (
      SELECT
        (item->>'lineIndex')::integer AS line_index,
        lower(regexp_replace(btrim(item->>'name'), '[[:space:]]+', ' ', 'g')) AS normalized_name
      FROM jsonb_array_elements(p_items) item
    ), history AS (
      SELECT
        requested.line_index,
        CASE
          WHEN lower(expense_items.unit) IN ('kg', 'g') THEN 'kg'
          WHEN lower(expense_items.unit) IN ('l', 'ml', 'cl') THEN 'l'
          WHEN lower(expense_items.unit) = 'kpl' THEN 'kpl'
        END AS canonical_unit,
        CASE
          WHEN lower(expense_items.unit) IN ('kg', 'l', 'kpl')
            THEN expense_items.amount / NULLIF(expense_items.quantity, 0)
          WHEN lower(expense_items.unit) IN ('g', 'ml')
            THEN expense_items.amount / NULLIF(expense_items.quantity / 1000, 0)
          WHEN lower(expense_items.unit) = 'cl'
            THEN expense_items.amount / NULLIF(expense_items.quantity / 100, 0)
        END AS unit_price
      FROM requested
      JOIN expense_items
        ON expense_items.family_id = v_family
       AND lower(regexp_replace(btrim(expense_items.name), '[[:space:]]+', ' ', 'g')) = requested.normalized_name
      WHERE expense_items.amount > 0
        AND expense_items.quantity > 0
        AND lower(expense_items.unit) IN ('kg', 'g', 'l', 'ml', 'cl', 'kpl')
        AND expense_items.expense_date >= current_date - interval '2 years'
    ), summaries AS (
      SELECT
        line_index,
        canonical_unit,
        count(*)::integer AS sample_count,
        percentile_cont(0.25) WITHIN GROUP (ORDER BY unit_price)::numeric AS lower_price,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY unit_price)::numeric AS median_price,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY unit_price)::numeric AS upper_price
      FROM history
      WHERE canonical_unit IS NOT NULL AND unit_price > 0
      GROUP BY line_index, canonical_unit
    )
    SELECT jsonb_agg(jsonb_build_object(
      'lineIndex', line_index,
      'sampleCount', sample_count,
      'canonicalUnit', canonical_unit,
      'medianUnitPrice', round(median_price, 4),
      'lowerUnitPrice', round(lower_price, 4),
      'upperUnitPrice', round(upper_price, 4)
    ) ORDER BY line_index, canonical_unit)
    FROM summaries
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION get_receipt_scan_quality_context(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_receipt_scan_quality_context(jsonb) TO authenticated, service_role;

CREATE VIEW receipt_scan_quality_monitoring
WITH (security_invoker = true)
AS
SELECT
  COALESCE(r.store_name, '(unknown)') AS store_name,
  COALESCE(r.scan_model, '(unknown)') AS scan_model,
  COALESCE(r.scan_prompt_version, '(unknown)') AS scan_prompt_version,
  r.scan_quality_schema_version,
  count(*) AS scan_count,
  round(avg(r.scan_quality_score), 2) AS average_risk_score,
  count(*) FILTER (WHERE r.scan_quality_level = 'high') AS high_risk_count,
  count(*) FILTER (WHERE r.scan_low_review_risk) AS low_review_risk_count,
  count(*) FILTER (WHERE r.scan_saved_with_unresolved_warnings) AS unresolved_warning_receipt_count,
  COALESCE(sum(warnings.corrected_count), 0) AS corrected_warning_count,
  COALESCE(sum(warnings.dismissed_count), 0) AS dismissed_warning_count,
  COALESCE(sum(warnings.unresolved_count), 0) AS unresolved_warning_count
FROM receipts r
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE warning->>'outcome' = 'corrected') AS corrected_count,
    count(*) FILTER (WHERE warning->>'outcome' = 'dismissed') AS dismissed_count,
    count(*) FILTER (WHERE warning->>'outcome' = 'unresolved') AS unresolved_count
  FROM jsonb_array_elements(COALESCE(r.scan_quality_warnings, '[]'::jsonb)) warning
) warnings ON true
WHERE r.scan_quality_schema_version IS NOT NULL
GROUP BY r.store_name, r.scan_model, r.scan_prompt_version, r.scan_quality_schema_version;

CREATE VIEW correction_candidate_performance_monitoring
WITH (security_invoker = true)
AS
WITH scoped AS (
  SELECT
    e.source_type, e.source_key, e.event_type, e.actor_id, e.family_id,
    COALESCE(r.store_name, '(unknown)') AS store_name,
    COALESCE(r.scan_model, '(unknown)') AS scan_model,
    COALESCE(r.scan_prompt_version, '(unknown)') AS scan_prompt_version
  FROM receipt_scan_feedback_events e
  JOIN receipts r ON r.id = e.receipt_id
  WHERE e.event_type IN (
    'suggestion_offered', 'suggestion_accepted', 'suggestion_rejected', 'suggestion_undone'
  )
), contributor_counts AS (
  SELECT source_type, source_key, store_name, scan_model, scan_prompt_version,
    actor_id, count(*) AS event_count
  FROM scoped
  GROUP BY source_type, source_key, store_name, scan_model, scan_prompt_version, actor_id
), concentration AS (
  SELECT source_type, source_key, store_name, scan_model, scan_prompt_version,
    count(*) FILTER (WHERE actor_id IS NOT NULL) AS distinct_contributor_count,
    round(max(event_count)::numeric / NULLIF(sum(event_count), 0), 4) AS largest_contributor_share
  FROM contributor_counts
  GROUP BY source_type, source_key, store_name, scan_model, scan_prompt_version
)
SELECT
  scoped.source_type, scoped.source_key, scoped.store_name,
  scoped.scan_model, scoped.scan_prompt_version,
  count(*) FILTER (WHERE scoped.event_type = 'suggestion_offered') AS offered_count,
  count(*) FILTER (WHERE scoped.event_type = 'suggestion_accepted') AS accepted_count,
  count(*) FILTER (
    WHERE scoped.event_type IN ('suggestion_rejected', 'suggestion_undone')
  ) AS rejected_count,
  concentration.distinct_contributor_count,
  count(DISTINCT scoped.family_id) AS distinct_household_count,
  concentration.largest_contributor_share,
  concentration.largest_contributor_share > 0.5
    OR concentration.distinct_contributor_count < 2 AS feedback_bias_risk
FROM scoped
JOIN concentration USING (source_type, source_key, store_name, scan_model, scan_prompt_version)
GROUP BY scoped.source_type, scoped.source_key, scoped.store_name,
  scoped.scan_model, scoped.scan_prompt_version,
  concentration.distinct_contributor_count, concentration.largest_contributor_share;

REVOKE ALL ON receipt_scan_quality_monitoring FROM PUBLIC, anon, authenticated;
REVOKE ALL ON correction_candidate_performance_monitoring FROM PUBLIC, anon, authenticated;
GRANT SELECT ON receipt_scan_quality_monitoring TO service_role;
GRANT SELECT ON correction_candidate_performance_monitoring TO service_role;

-- Global candidates already cap each contributor at three effective receipts.
-- Exclude new feedback when the review was too quick or unresolved warnings
-- were knowingly saved, so low-quality/high-volume behaviour cannot add weight.
CREATE OR REPLACE FUNCTION refresh_global_correction_candidates()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM global_correction_candidates;

  WITH eligible_events AS (
    SELECT DISTINCT
      e.family_id, e.receipt_id, e.actor_id, r.receipt_date, e.created_at,
      CASE
        WHEN e.entity_type = 'item' AND e.field_name = 'name' THEN 'item_name'
        WHEN e.entity_type = 'receipt' AND e.field_name = 'store_name' THEN 'store_name'
      END AS correction_kind,
      e.raw_value #>> '{}' AS source_value,
      lower(regexp_replace(btrim(e.raw_value #>> '{}'), '[[:space:]]+', ' ', 'g')) AS source_normalized,
      e.final_value #>> '{}' AS target_value,
      lower(regexp_replace(btrim(e.final_value #>> '{}'), '[[:space:]]+', ' ', 'g')) AS target_normalized,
      CASE WHEN e.entity_type = 'item'
        THEN lower(regexp_replace(btrim(COALESCE(e.context->>'storeName', '')), '[[:space:]]+', ' ', 'g'))
        ELSE ''
      END AS context_key
    FROM receipt_scan_feedback_events e
    JOIN receipts r ON r.id = e.receipt_id
    JOIN user_privacy_choices p ON p.user_id = r.uploaded_by
    WHERE e.event_type IN ('field_changed', 'suggestion_accepted')
      AND jsonb_typeof(e.raw_value) = 'string'
      AND jsonb_typeof(e.final_value) = 'string'
      AND r.training_eligible = true
      AND p.receipt_training_enabled = true
      AND p.receipt_training_withdrawn_at IS NULL
      AND r.training_consent_version = p.receipt_training_choice_version
      AND NOT r.scan_low_review_risk
      AND NOT r.scan_saved_with_unresolved_warnings
  ), per_contributor AS (
    SELECT correction_kind, source_value, source_normalized, target_value,
      target_normalized, context_key, family_id, actor_id,
      count(DISTINCT receipt_id)::integer AS receipt_count
    FROM eligible_events
    WHERE correction_kind IS NOT NULL AND source_normalized <> ''
      AND target_normalized <> '' AND source_normalized <> target_normalized
    GROUP BY correction_kind, source_value, source_normalized, target_value,
      target_normalized, context_key, family_id, actor_id
  ), raw_grouped AS (
    SELECT correction_kind, source_normalized, target_normalized, context_key,
      max(source_value) AS source_value, max(target_value) AS target_value,
      count(DISTINCT receipt_id)::integer AS support_event_count,
      count(DISTINCT receipt_id)::integer AS distinct_receipt_count,
      count(DISTINCT actor_id)::integer AS distinct_contributor_count,
      count(DISTINCT family_id)::integer AS distinct_household_count,
      count(DISTINCT receipt_date)::integer AS distinct_day_count,
      min(created_at) AS first_seen_at, max(created_at) AS last_seen_at
    FROM eligible_events
    WHERE correction_kind IS NOT NULL AND source_normalized <> ''
      AND target_normalized <> '' AND source_normalized <> target_normalized
    GROUP BY correction_kind, source_normalized, target_normalized, context_key
  ), effective_grouped AS (
    SELECT correction_kind, source_normalized, target_normalized, context_key,
      sum(LEAST(receipt_count, 3))::integer AS effective_support_count
    FROM per_contributor
    GROUP BY correction_kind, source_normalized, target_normalized, context_key
  ), grouped AS (
    SELECT raw_grouped.*, effective_grouped.effective_support_count
    FROM raw_grouped
    JOIN effective_grouped USING (correction_kind, source_normalized, target_normalized, context_key)
  ), scored AS (
    SELECT grouped.*,
      (sum(effective_support_count) OVER (
        PARTITION BY correction_kind, source_normalized, context_key
      ) - effective_support_count)::integer AS disagreement_count
    FROM grouped
  )
  INSERT INTO global_correction_candidates (
    correction_kind, source_value, source_normalized, target_value,
    target_normalized, context_key, support_event_count,
    effective_support_count, disagreement_count, distinct_receipt_count,
    distinct_contributor_count, distinct_household_count, distinct_day_count,
    confidence_score, evidence_tier, first_seen_at, last_seen_at, generated_at
  )
  SELECT correction_kind, source_value, source_normalized, target_value,
    target_normalized, context_key, support_event_count,
    effective_support_count, disagreement_count, distinct_receipt_count,
    distinct_contributor_count, distinct_household_count, distinct_day_count,
    round((effective_support_count + 1)::numeric /
      (effective_support_count + disagreement_count + 2), 5),
    CASE
      WHEN distinct_household_count >= 2 THEN 'independent'
      WHEN distinct_receipt_count >= 3 AND distinct_day_count >= 2 AND disagreement_count = 0
        THEN 'exploratory'
      ELSE 'observed'
    END,
    first_seen_at, last_seen_at, now()
  FROM scored;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION refresh_global_correction_candidates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION refresh_global_correction_candidates() TO service_role;
