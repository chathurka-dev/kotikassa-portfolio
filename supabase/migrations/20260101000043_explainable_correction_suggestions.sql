-- Phase 9.1 Milestone 3: privacy-safe, household-first correction suggestions
-- with a bounded exploratory budget for one-household global candidates.

CREATE TABLE correction_suggestion_daily_usage (
  family_id          uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  usage_date         date NOT NULL DEFAULT current_date,
  exploratory_offers integer NOT NULL DEFAULT 0 CHECK (exploratory_offers >= 0),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, usage_date)
);

ALTER TABLE correction_suggestion_daily_usage ENABLE ROW LEVEL SECURITY;

CREATE INDEX receipt_scan_feedback_global_suggestion_idx
  ON receipt_scan_feedback_events (family_id, source_key, event_type)
  WHERE source_type = 'global_candidate'
    AND event_type IN ('suggestion_rejected', 'suggestion_undone');

-- This function is the only runtime boundary for global correction candidates.
-- It returns an opaque, minimal projection and never exposes evidence counts,
-- contributor identities, household identities, or raw feedback rows.
CREATE OR REPLACE FUNCTION get_receipt_correction_suggestions(
  p_store_name text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_family uuid;
  v_store_context text := lower(regexp_replace(btrim(COALESCE(p_store_name, '')), '[[:space:]]+', ' ', 'g'));
  v_input record;
  v_candidate record;
  v_results jsonb := '[]'::jsonb;
  v_daily_offers integer := 0;
  v_new_exploratory_offers integer := 0;
  v_source_normalized text;
  v_confidence_tier text;
  v_evidence_tier text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT family_id INTO v_family
  FROM profiles
  WHERE id = v_user;

  IF v_family IS NULL THEN
    RAISE EXCEPTION 'Household profile required';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid correction suggestion input';
  END IF;

  IF jsonb_array_length(p_items) > 100
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_items) item
       WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
          OR jsonb_typeof(item->'lineIndex') IS DISTINCT FROM 'number'
          OR (item->>'lineIndex')::integer < 0
          OR NULLIF(btrim(item->>'name'), '') IS NULL
          OR length(item->>'name') > 120
     )
  THEN
    RAISE EXCEPTION 'Invalid correction suggestion input';
  END IF;

  INSERT INTO correction_suggestion_daily_usage (
    family_id, usage_date, exploratory_offers, updated_at
  ) VALUES (
    v_family, current_date, 0, now()
  )
  ON CONFLICT (family_id, usage_date) DO NOTHING;

  SELECT exploratory_offers INTO v_daily_offers
  FROM correction_suggestion_daily_usage
  WHERE family_id = v_family AND usage_date = current_date
  FOR UPDATE;

  FOR v_input IN
    SELECT
      'receipt'::text AS entity_type,
      NULL::integer AS line_index,
      'store_name'::text AS field_name,
      btrim(p_store_name) AS source_value,
      ''::text AS context_key
    WHERE NULLIF(btrim(p_store_name), '') IS NOT NULL
    UNION ALL
    SELECT
      'item'::text,
      (item->>'lineIndex')::integer,
      'name'::text,
      btrim(item->>'name'),
      v_store_context
    FROM jsonb_array_elements(p_items) item
    ORDER BY line_index NULLS FIRST
  LOOP
    v_source_normalized := lower(regexp_replace(v_input.source_value, '[[:space:]]+', ' ', 'g'));
    SELECT
      memory.id,
      memory.id::text AS candidate_key,
      memory.target_value,
      memory.confidence_score,
      memory.historical_support_count + memory.live_support_count AS support_count,
      memory.disagreement_count,
      'household_memory'::text AS source_type,
      'household-memory-v1'::text AS source_version,
      NULL::text AS global_evidence_tier
    INTO v_candidate
    FROM household_correction_memory memory
    WHERE memory.family_id = v_family
      AND memory.correction_kind = CASE
        WHEN v_input.entity_type = 'receipt' THEN 'store_name'
        ELSE 'item_name'
      END
      AND memory.source_normalized = v_source_normalized
      AND memory.target_normalized <> v_source_normalized
      AND memory.historical_support_count + memory.live_support_count
        > memory.rejection_count + memory.undo_count
      AND (
        v_input.entity_type = 'receipt'
        OR memory.context_key IN ('', v_input.context_key)
      )
    ORDER BY
      CASE WHEN memory.context_key = v_input.context_key THEN 0 ELSE 1 END,
      memory.confidence_score DESC,
      (memory.historical_support_count + memory.live_support_count) DESC,
      memory.disagreement_count ASC,
      memory.last_seen_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      SELECT
        candidate.id,
        'global:' || candidate.correction_kind || ':' || md5(
          candidate.source_normalized || '|' || candidate.target_normalized || '|' || candidate.context_key
        ) AS candidate_key,
        candidate.target_value,
        candidate.confidence_score,
        candidate.effective_support_count AS support_count,
        candidate.disagreement_count,
        'global_candidate'::text AS source_type,
        candidate.generated_at::text AS source_version,
        candidate.evidence_tier AS global_evidence_tier
      INTO v_candidate
      FROM global_correction_candidates candidate
      WHERE candidate.correction_kind = CASE
          WHEN v_input.entity_type = 'receipt' THEN 'store_name'
          ELSE 'item_name'
        END
        AND candidate.source_normalized = v_source_normalized
        AND candidate.target_normalized <> v_source_normalized
        AND NOT EXISTS (
          SELECT 1
          FROM receipt_scan_feedback_events feedback
          WHERE feedback.family_id = v_family
            AND feedback.source_type = 'global_candidate'
            AND feedback.source_key = 'global:' || candidate.correction_kind || ':' || md5(
              candidate.source_normalized || '|' || candidate.target_normalized || '|' || candidate.context_key
            )
            AND feedback.event_type IN ('suggestion_rejected', 'suggestion_undone')
        )
        AND (
          v_input.entity_type = 'receipt'
          OR candidate.context_key IN ('', v_input.context_key)
        )
        AND (
          (
            candidate.evidence_tier = 'independent'
            AND candidate.distinct_household_count >= 2
            AND candidate.confidence_score >= 0.5
          )
          OR (
            candidate.evidence_tier = 'exploratory'
            AND v_daily_offers + v_new_exploratory_offers < 3
            AND candidate.effective_support_count >= 3
            AND candidate.distinct_day_count >= 2
            AND candidate.disagreement_count = 0
            AND candidate.confidence_score >= 0.6
            -- A stable 20% exploration cohort limits the blast radius of a
            -- pattern supported by only one household.
            AND mod(
              hashtext(
                v_user::text || ':' || candidate.correction_kind || ':' || md5(
                  candidate.source_normalized || '|' || candidate.target_normalized || '|' || candidate.context_key
                )
              )::bigint + 2147483648,
              5
            ) = 0
          )
        )
      ORDER BY
        CASE candidate.evidence_tier WHEN 'independent' THEN 0 ELSE 1 END,
        CASE WHEN candidate.context_key = v_input.context_key THEN 0 ELSE 1 END,
        candidate.confidence_score DESC,
        candidate.distinct_household_count DESC,
        candidate.last_seen_at DESC
      LIMIT 1;
    END IF;

    IF FOUND THEN
      v_confidence_tier := CASE
        WHEN v_candidate.source_type = 'global_candidate'
             AND v_candidate.global_evidence_tier = 'exploratory' THEN 'low'
        WHEN v_candidate.confidence_score >= 0.8 THEN 'high'
        WHEN v_candidate.confidence_score >= 0.55 THEN 'medium'
        ELSE 'low'
      END;
      v_evidence_tier := CASE
        WHEN v_candidate.source_type = 'global_candidate' THEN v_candidate.global_evidence_tier
        WHEN v_candidate.disagreement_count > 0 THEN 'conflicting'
        WHEN v_candidate.support_count <= 1 THEN 'single'
        ELSE 'repeated'
      END;

      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'key', v_candidate.source_type || ':' || v_candidate.candidate_key,
        'entityType', v_input.entity_type,
        'lineIndex', v_input.line_index,
        'fieldName', v_input.field_name,
        'originalValue', v_input.source_value,
        'suggestedValue', v_candidate.target_value,
        'sourceType', v_candidate.source_type,
        'sourceKey', v_candidate.candidate_key,
        'sourceVersion', v_candidate.source_version,
        'confidenceTier', v_confidence_tier,
        'evidenceTier', v_evidence_tier
      ));

      IF v_candidate.source_type = 'global_candidate'
         AND v_candidate.global_evidence_tier = 'exploratory'
      THEN
        v_new_exploratory_offers := v_new_exploratory_offers + 1;
      END IF;
    END IF;
  END LOOP;

  IF v_new_exploratory_offers > 0 THEN
    UPDATE correction_suggestion_daily_usage
    SET
      exploratory_offers = exploratory_offers + v_new_exploratory_offers,
      updated_at = now()
    WHERE family_id = v_family AND usage_date = current_date;
  END IF;

  RETURN v_results;
END;
$$;

REVOKE ALL ON FUNCTION get_receipt_correction_suggestions(text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_receipt_correction_suggestions(text, jsonb)
  TO authenticated;
