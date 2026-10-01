-- Phase 9.1 Milestone 5: reversible automatic aliases behind fixed-holdout
-- precision gates. Financial values, item presence, and ambiguous dates are
-- never eligible for learned automation.

CREATE TABLE correction_automation_evaluations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope              text NOT NULL CHECK (scope IN ('household', 'global')),
  correction_kind    text NOT NULL CHECK (correction_kind IN ('item_name', 'store_name')),
  holdout_version    text NOT NULL CHECK (btrim(holdout_version) <> ''),
  dataset_sha256     text NOT NULL CHECK (dataset_sha256 ~ '^[0-9a-f]{64}$'),
  sample_size        integer NOT NULL CHECK (sample_size > 0),
  correct_count      integer NOT NULL CHECK (correct_count BETWEEN 0 AND sample_size),
  precision_score    numeric(8,7) NOT NULL CHECK (precision_score BETWEEN 0 AND 1),
  passed             boolean NOT NULL,
  evaluated_at       timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > evaluated_at)
);

CREATE INDEX correction_automation_evaluation_latest_idx
  ON correction_automation_evaluations (
    scope, correction_kind, evaluated_at DESC, created_at DESC
  );

ALTER TABLE correction_automation_evaluations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON correction_automation_evaluations TO service_role;

CREATE OR REPLACE FUNCTION record_correction_automation_evaluation(
  p_scope text,
  p_correction_kind text,
  p_holdout_version text,
  p_dataset_sha256 text,
  p_sample_size integer,
  p_correct_count integer,
  p_valid_days integer DEFAULT 180
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_precision numeric(8,7);
  v_minimum_sample integer;
  v_minimum_precision numeric(8,7);
  v_passed boolean;
  v_evaluation_id uuid;
BEGIN
  IF p_scope NOT IN ('household', 'global')
     OR p_correction_kind NOT IN ('item_name', 'store_name')
     OR NULLIF(btrim(p_holdout_version), '') IS NULL
     OR lower(p_dataset_sha256) !~ '^[0-9a-f]{64}$'
     OR p_sample_size IS NULL OR p_sample_size < 1
     OR p_correct_count IS NULL OR p_correct_count < 0 OR p_correct_count > p_sample_size
     OR p_valid_days IS NULL OR p_valid_days < 1 OR p_valid_days > 365
  THEN
    RAISE EXCEPTION 'Invalid automation evaluation';
  END IF;

  v_minimum_sample := CASE p_scope WHEN 'global' THEN 100 ELSE 50 END;
  v_minimum_precision := CASE p_scope WHEN 'global' THEN 0.995 ELSE 0.98 END;
  v_precision := round(p_correct_count::numeric / p_sample_size, 7);
  v_passed := p_sample_size >= v_minimum_sample AND v_precision >= v_minimum_precision;

  INSERT INTO correction_automation_evaluations (
    scope, correction_kind, holdout_version, dataset_sha256,
    sample_size, correct_count, precision_score, passed, expires_at
  ) VALUES (
    p_scope, p_correction_kind, btrim(p_holdout_version), lower(p_dataset_sha256),
    p_sample_size, p_correct_count, v_precision, v_passed,
    now() + make_interval(days => p_valid_days)
  )
  RETURNING id INTO v_evaluation_id;

  RETURN jsonb_build_object(
    'evaluationId', v_evaluation_id,
    'scope', p_scope,
    'correctionKind', p_correction_kind,
    'sampleSize', p_sample_size,
    'precision', v_precision,
    'minimumSampleSize', v_minimum_sample,
    'minimumPrecision', v_minimum_precision,
    'passed', v_passed
  );
END;
$$;

REVOKE ALL ON FUNCTION record_correction_automation_evaluation(
  text, text, text, text, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_correction_automation_evaluation(
  text, text, text, text, integer, integer, integer
) TO service_role;

-- Enrich Milestone 3 suggestions without exposing evidence counts. The
-- original suggestion RPC remains the privacy/ranking boundary.
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
      ORDER BY evaluation.evaluated_at DESC, evaluation.created_at DESC
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

CREATE VIEW correction_automation_monitoring
WITH (security_invoker = true)
AS
SELECT
  feedback.source_type,
  feedback.context->>'automationPolicyVersion' AS policy_version,
  COALESCE(receipt.scan_model, '(unknown)') AS scan_model,
  COALESCE(receipt.scan_prompt_version, '(unknown)') AS scan_prompt_version,
  count(*) FILTER (WHERE feedback.event_type = 'suggestion_accepted') AS applied_count,
  count(*) FILTER (WHERE feedback.event_type = 'suggestion_undone') AS undone_count,
  round(
    count(*) FILTER (WHERE feedback.event_type = 'suggestion_undone')::numeric /
      NULLIF(count(*) FILTER (WHERE feedback.event_type = 'suggestion_accepted'), 0),
    5
  ) AS observed_undo_rate,
  count(DISTINCT feedback.actor_id) AS distinct_contributor_count,
  count(DISTINCT feedback.family_id) AS distinct_household_count
FROM receipt_scan_feedback_events feedback
JOIN receipts receipt ON receipt.id = feedback.receipt_id
WHERE feedback.context->>'autoApplied' = 'true'
GROUP BY feedback.source_type, feedback.context->>'automationPolicyVersion',
  receipt.scan_model, receipt.scan_prompt_version;

REVOKE ALL ON correction_automation_monitoring FROM PUBLIC, anon, authenticated;
GRANT SELECT ON correction_automation_monitoring TO service_role;
