-- Preserve the immutable migration-045 history while making "latest evaluation"
-- deterministic when multiple evaluations are recorded in one transaction.

ALTER TABLE correction_automation_evaluations
  ADD COLUMN evaluation_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE;

DROP INDEX correction_automation_evaluation_latest_idx;

CREATE INDEX correction_automation_evaluation_latest_idx
  ON correction_automation_evaluations (
    scope, correction_kind, evaluated_at DESC, evaluation_order DESC
  );

CREATE OR REPLACE FUNCTION get_receipt_correction_recommendations(
  p_store_name text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_suggestion jsonb;
  v_results jsonb := '[]'::jsonb;
  v_kind text;
  v_scope text;
  v_policy_version text;
  v_policy_passed boolean;
  v_policy_expires_at timestamptz;
  v_auto_apply boolean;
  v_reason text;
BEGIN
  FOR v_suggestion IN
    SELECT value FROM jsonb_array_elements(
      get_receipt_correction_suggestions(p_store_name, p_items)
    )
  LOOP
    v_kind := CASE v_suggestion->>'fieldName'
      WHEN 'store_name' THEN 'store_name'
      WHEN 'name' THEN 'item_name'
    END;
    v_scope := CASE v_suggestion->>'sourceType'
      WHEN 'household_memory' THEN 'household'
      WHEN 'global_candidate' THEN 'global'
    END;
    v_auto_apply := false;
    v_reason := NULL;
    v_policy_version := NULL;
    v_policy_passed := NULL;
    v_policy_expires_at := NULL;

    IF v_kind IS NOT NULL AND v_scope IS NOT NULL THEN
      SELECT evaluation.holdout_version, evaluation.passed, evaluation.expires_at
      INTO v_policy_version, v_policy_passed, v_policy_expires_at
      FROM correction_automation_evaluations evaluation
      WHERE evaluation.scope = v_scope
        AND evaluation.correction_kind = v_kind
      ORDER BY evaluation.evaluated_at DESC, evaluation.evaluation_order DESC
      LIMIT 1;

      IF v_policy_passed IS TRUE AND v_policy_expires_at > now() THEN
        IF v_scope = 'household' THEN
          SELECT EXISTS (
            SELECT 1
            FROM household_correction_memory memory
            WHERE memory.id::text = v_suggestion->>'sourceKey'
              AND memory.historical_support_count + memory.live_support_count >= 5
              AND memory.distinct_receipt_count >= 5
              AND memory.confidence_score >= 0.9
              AND memory.disagreement_count = 0
              AND memory.rejection_count = 0
              AND memory.undo_count = 0
              AND memory.last_seen_at >= now() - interval '365 days'
              AND NOT EXISTS (
                SELECT 1
                FROM household_correction_memory conflicting
                WHERE conflicting.id <> memory.id
                  AND conflicting.family_id = memory.family_id
                  AND conflicting.correction_kind = memory.correction_kind
                  AND conflicting.source_normalized = memory.source_normalized
                  AND conflicting.context_key = memory.context_key
                  AND conflicting.target_normalized <> memory.target_normalized
                  AND conflicting.historical_support_count + conflicting.live_support_count
                    > conflicting.rejection_count + conflicting.undo_count
              )
              AND NOT EXISTS (
                SELECT 1 FROM receipt_scan_feedback_events feedback
                WHERE feedback.source_type = 'household_memory'
                  AND feedback.source_key = memory.id::text
                  AND feedback.event_type IN ('suggestion_rejected', 'suggestion_undone')
                  AND feedback.created_at >= now() - interval '90 days'
              )
          ) INTO v_auto_apply;
          IF v_auto_apply THEN v_reason := 'household_verified'; END IF;
        ELSE
          SELECT EXISTS (
            SELECT 1
            FROM global_correction_candidates candidate
            WHERE 'global:' || candidate.correction_kind || ':' || md5(
              candidate.source_normalized || '|' || candidate.target_normalized || '|' || candidate.context_key
            ) = v_suggestion->>'sourceKey'
              AND candidate.evidence_tier = 'independent'
              AND candidate.distinct_household_count >= 3
              AND candidate.distinct_contributor_count >= 3
              AND candidate.distinct_receipt_count >= 10
              AND candidate.distinct_day_count >= 3
              AND candidate.confidence_score >= 0.9
              AND candidate.disagreement_count <= floor(candidate.effective_support_count * 0.05)
              AND candidate.last_seen_at >= now() - interval '365 days'
              AND NOT EXISTS (
                SELECT 1
                FROM global_correction_candidates conflicting
                WHERE conflicting.id <> candidate.id
                  AND conflicting.correction_kind = candidate.correction_kind
                  AND conflicting.source_normalized = candidate.source_normalized
                  AND conflicting.context_key = candidate.context_key
                  AND conflicting.target_normalized <> candidate.target_normalized
                  AND conflicting.effective_support_count > conflicting.disagreement_count
              )
              AND NOT EXISTS (
                SELECT 1 FROM receipt_scan_feedback_events feedback
                WHERE feedback.source_type = 'global_candidate'
                  AND feedback.source_key = v_suggestion->>'sourceKey'
                  AND feedback.event_type IN ('suggestion_rejected', 'suggestion_undone')
                  AND feedback.created_at >= now() - interval '90 days'
              )
          ) INTO v_auto_apply;
          IF v_auto_apply THEN v_reason := 'global_holdout_verified'; END IF;
        END IF;
      END IF;
    END IF;

    v_results := v_results || jsonb_build_array(
      v_suggestion || jsonb_build_object(
        'autoApply', v_auto_apply,
        'automationReason', v_reason,
        'automationPolicyVersion', CASE
          WHEN v_auto_apply THEN v_policy_version
          ELSE NULL
        END
      )
    );
  END LOOP;

  RETURN v_results;
END;
$$;

REVOKE ALL ON FUNCTION get_receipt_correction_recommendations(text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_receipt_correction_recommendations(text, jsonb)
  TO authenticated;
