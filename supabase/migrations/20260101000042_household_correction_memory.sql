-- Phase 9.1 Milestone 2: rebuildable household correction memory, detectable
-- feedback completion, meaningful category-memory confidence, and a private
-- consent-filtered global-candidate projection.

ALTER TABLE receipts
  ADD COLUMN scan_feedback_expected boolean NOT NULL DEFAULT false,
  ADD COLUMN scan_feedback_schema_version text,
  ADD COLUMN scan_feedback_recorded_at timestamptz,
  ADD CONSTRAINT receipts_scan_feedback_version_required CHECK (
    NOT scan_feedback_expected OR scan_feedback_schema_version IS NOT NULL
  );

ALTER TABLE receipt_scan_feedback_events
  ADD COLUMN processed_into_memory_at timestamptz;

ALTER TABLE item_category_memory
  ADD COLUMN support_count integer NOT NULL DEFAULT 1 CHECK (support_count >= 0),
  ADD COLUMN rejection_count integer NOT NULL DEFAULT 0 CHECK (rejection_count >= 0),
  ADD COLUMN confidence_score numeric(6,5) NOT NULL DEFAULT 0.5
    CHECK (confidence_score >= 0 AND confidence_score <= 1),
  ADD COLUMN last_used_at timestamptz NOT NULL DEFAULT now();

UPDATE item_category_memory
SET
  support_count = GREATEST(confidence, 1),
  confidence_score = GREATEST(confidence, 1)::numeric / (GREATEST(confidence, 1) + 1),
  last_used_at = updated_at;

CREATE TABLE household_correction_memory (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id                  uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  correction_kind            text NOT NULL CHECK (correction_kind IN ('item_name', 'store_name')),
  source_value                text NOT NULL CHECK (btrim(source_value) <> ''),
  source_normalized           text NOT NULL CHECK (source_normalized <> ''),
  target_value                text NOT NULL CHECK (btrim(target_value) <> ''),
  target_normalized           text NOT NULL CHECK (target_normalized <> ''),
  context_key                 text NOT NULL DEFAULT '',
  historical_support_count   integer NOT NULL DEFAULT 0 CHECK (historical_support_count >= 0),
  live_support_count         integer NOT NULL DEFAULT 0 CHECK (live_support_count >= 0),
  rejection_count            integer NOT NULL DEFAULT 0 CHECK (rejection_count >= 0),
  undo_count                 integer NOT NULL DEFAULT 0 CHECK (undo_count >= 0),
  disagreement_count         integer NOT NULL DEFAULT 0 CHECK (disagreement_count >= 0),
  distinct_receipt_count     integer NOT NULL DEFAULT 0 CHECK (distinct_receipt_count >= 0),
  distinct_contributor_count integer NOT NULL DEFAULT 0 CHECK (distinct_contributor_count >= 0),
  confidence_score           numeric(6,5) NOT NULL DEFAULT 0.33333
    CHECK (confidence_score >= 0 AND confidence_score <= 1),
  first_seen_at              timestamptz NOT NULL DEFAULT now(),
  last_seen_at               timestamptz NOT NULL DEFAULT now(),
  last_used_at               timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (
    family_id, correction_kind, source_normalized, target_normalized, context_key
  )
);

CREATE INDEX household_correction_memory_lookup_idx
  ON household_correction_memory (
    family_id, correction_kind, source_normalized, context_key, confidence_score DESC
  );

ALTER TABLE household_correction_memory ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON household_correction_memory TO authenticated;

CREATE POLICY "family members can read correction memory"
  ON household_correction_memory FOR SELECT
  TO authenticated
  USING (
    family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

CREATE TABLE household_correction_memory_evidence (
  memory_id   uuid NOT NULL REFERENCES household_correction_memory(id) ON DELETE CASCADE,
  event_id    uuid NOT NULL REFERENCES receipt_scan_feedback_events(id) ON DELETE CASCADE,
  receipt_id  uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (memory_id, event_id)
);

ALTER TABLE household_correction_memory_evidence ENABLE ROW LEVEL SECURITY;

CREATE TABLE global_correction_candidates (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_kind            text NOT NULL CHECK (correction_kind IN ('item_name', 'store_name')),
  source_value                text NOT NULL,
  source_normalized           text NOT NULL,
  target_value                text NOT NULL,
  target_normalized           text NOT NULL,
  context_key                 text NOT NULL DEFAULT '',
  support_event_count        integer NOT NULL CHECK (support_event_count >= 0),
  effective_support_count    integer NOT NULL CHECK (effective_support_count >= 0),
  disagreement_count         integer NOT NULL CHECK (disagreement_count >= 0),
  distinct_receipt_count     integer NOT NULL CHECK (distinct_receipt_count >= 0),
  distinct_contributor_count integer NOT NULL CHECK (distinct_contributor_count >= 0),
  distinct_household_count   integer NOT NULL CHECK (distinct_household_count >= 0),
  distinct_day_count         integer NOT NULL CHECK (distinct_day_count >= 0),
  confidence_score           numeric(6,5) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  evidence_tier              text NOT NULL CHECK (evidence_tier IN ('observed', 'exploratory', 'independent')),
  first_seen_at              timestamptz NOT NULL,
  last_seen_at               timestamptz NOT NULL,
  generated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (correction_kind, source_normalized, target_normalized, context_key)
);

ALTER TABLE global_correction_candidates ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON global_correction_candidates TO service_role;

CREATE OR REPLACE FUNCTION sync_receipt_feedback_memory(p_receipt_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event receipt_scan_feedback_events%ROWTYPE;
  v_kind text;
  v_source text;
  v_target text;
  v_source_normalized text;
  v_target_normalized text;
  v_context_key text;
  v_memory_id uuid;
  v_processed integer := 0;
BEGIN
  FOR v_event IN
    SELECT *
    FROM receipt_scan_feedback_events
    WHERE receipt_id = p_receipt_id
      AND processed_into_memory_at IS NULL
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    v_kind := CASE
      WHEN v_event.entity_type = 'item' AND v_event.field_name = 'name' THEN 'item_name'
      WHEN v_event.entity_type = 'receipt' AND v_event.field_name = 'store_name' THEN 'store_name'
      ELSE NULL
    END;

    IF v_kind IS NOT NULL
       AND jsonb_typeof(v_event.raw_value) = 'string'
       AND jsonb_typeof(v_event.final_value) = 'string'
    THEN
      v_source := v_event.raw_value #>> '{}';
      v_target := v_event.final_value #>> '{}';
      v_source_normalized := lower(regexp_replace(btrim(v_source), '[[:space:]]+', ' ', 'g'));
      v_target_normalized := lower(regexp_replace(btrim(v_target), '[[:space:]]+', ' ', 'g'));
      v_context_key := CASE
        WHEN v_kind = 'item_name'
          THEN lower(regexp_replace(btrim(COALESCE(v_event.context->>'storeName', '')), '[[:space:]]+', ' ', 'g'))
        ELSE ''
      END;

      IF v_source_normalized <> ''
         AND v_target_normalized <> ''
         AND v_source_normalized <> v_target_normalized
      THEN
        IF v_event.event_type IN ('field_changed', 'suggestion_accepted') THEN
          UPDATE household_correction_memory
          SET disagreement_count = disagreement_count + 1, updated_at = now()
          WHERE family_id = v_event.family_id
            AND correction_kind = v_kind
            AND source_normalized = v_source_normalized
            AND context_key = v_context_key
            AND target_normalized <> v_target_normalized;

          INSERT INTO household_correction_memory (
            family_id, correction_kind, source_value, source_normalized,
            target_value, target_normalized, context_key, live_support_count,
            distinct_receipt_count, distinct_contributor_count,
            first_seen_at, last_seen_at, last_used_at
          ) VALUES (
            v_event.family_id, v_kind, v_source, v_source_normalized,
            v_target, v_target_normalized, v_context_key, 1, 1,
            CASE WHEN v_event.actor_id IS NULL THEN 0 ELSE 1 END,
            v_event.created_at, v_event.created_at, v_event.created_at
          )
          ON CONFLICT (
            family_id, correction_kind, source_normalized, target_normalized, context_key
          ) DO UPDATE SET
            live_support_count = household_correction_memory.live_support_count + 1,
            distinct_receipt_count = household_correction_memory.distinct_receipt_count + 1,
            distinct_contributor_count = GREATEST(
              household_correction_memory.distinct_contributor_count,
              CASE WHEN v_event.actor_id IS NULL THEN 0 ELSE 1 END
            ),
            source_value = EXCLUDED.source_value,
            target_value = EXCLUDED.target_value,
            last_seen_at = GREATEST(household_correction_memory.last_seen_at, EXCLUDED.last_seen_at),
            last_used_at = EXCLUDED.last_used_at,
            updated_at = now()
          RETURNING id INTO v_memory_id;

          INSERT INTO household_correction_memory_evidence (
            memory_id, event_id, receipt_id, actor_id, created_at
          ) VALUES (
            v_memory_id, v_event.id, v_event.receipt_id, v_event.actor_id, v_event.created_at
          )
          ON CONFLICT (memory_id, event_id) DO NOTHING;

          UPDATE household_correction_memory memory
          SET
            distinct_receipt_count = memory.historical_support_count + (
              SELECT count(DISTINCT evidence.receipt_id)
              FROM household_correction_memory_evidence evidence
              WHERE evidence.memory_id = memory.id
            ),
            distinct_contributor_count = GREATEST(
              memory.distinct_contributor_count,
              (
                SELECT count(DISTINCT evidence.actor_id)
                FROM household_correction_memory_evidence evidence
                WHERE evidence.memory_id = memory.id
              )
            )
          WHERE memory.id = v_memory_id;

          UPDATE household_correction_memory memory
          SET disagreement_count = COALESCE((
            SELECT sum(other.historical_support_count + other.live_support_count)::integer
            FROM household_correction_memory other
            WHERE other.family_id = memory.family_id
              AND other.correction_kind = memory.correction_kind
              AND other.source_normalized = memory.source_normalized
              AND other.context_key = memory.context_key
              AND other.target_normalized <> memory.target_normalized
          ), 0)
          WHERE memory.id = v_memory_id;
        ELSIF v_event.event_type = 'suggestion_rejected' THEN
          UPDATE household_correction_memory
          SET rejection_count = rejection_count + 1, last_seen_at = v_event.created_at, updated_at = now()
          WHERE family_id = v_event.family_id
            AND correction_kind = v_kind
            AND source_normalized = v_source_normalized
            AND target_normalized = v_target_normalized
            AND context_key = v_context_key;
        ELSIF v_event.event_type = 'suggestion_undone' THEN
          UPDATE household_correction_memory
          SET undo_count = undo_count + 1, last_seen_at = v_event.created_at, updated_at = now()
          WHERE family_id = v_event.family_id
            AND correction_kind = v_kind
            AND source_normalized = v_source_normalized
            AND target_normalized = v_target_normalized
            AND context_key = v_context_key;
        END IF;
      END IF;
    END IF;

    UPDATE receipt_scan_feedback_events
    SET processed_into_memory_at = now()
    WHERE id = v_event.id;
    v_processed := v_processed + 1;
  END LOOP;

  UPDATE household_correction_memory
  SET confidence_score = ROUND(
    (
      historical_support_count + live_support_count + 1
    )::numeric / GREATEST(
      historical_support_count + live_support_count + disagreement_count +
      rejection_count + (undo_count * 2) + 2,
      1
    ),
    5
  )
  WHERE family_id = (
    SELECT family_id FROM receipts WHERE id = p_receipt_id
  );

  RETURN v_processed;
END;
$$;

REVOKE ALL ON FUNCTION sync_receipt_feedback_memory(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW household_historical_correction_candidates AS
WITH evidence AS (
  SELECT
    c.family_id,
    'item_name'::text AS correction_kind,
    c.ocr_raw_name AS source_value,
    lower(regexp_replace(btrim(c.ocr_raw_name), '[[:space:]]+', ' ', 'g')) AS source_normalized,
    c.corrected_name AS target_value,
    lower(regexp_replace(btrim(c.corrected_name), '[[:space:]]+', ' ', 'g')) AS target_normalized,
    lower(regexp_replace(btrim(COALESCE(c.store_name, '')), '[[:space:]]+', ' ', 'g')) AS context_key,
    c.receipt_id,
    r.uploaded_by AS contributor_id,
    c.created_at
  FROM ocr_corrections c
  JOIN receipts r ON r.id = c.receipt_id AND r.family_id = c.family_id
  WHERE c.corrected_name IS NOT NULL
    AND btrim(c.corrected_name) <> ''
    AND lower(btrim(c.ocr_raw_name)) <> lower(btrim(c.corrected_name))
    AND EXISTS (
      SELECT 1 FROM expense_items i
      WHERE i.receipt_id = c.receipt_id
        AND lower(btrim(i.name)) = lower(btrim(c.corrected_name))
    )
    AND NOT EXISTS (
      SELECT 1 FROM receipt_scan_feedback_events e
      WHERE e.receipt_id = c.receipt_id
        AND e.event_type = 'field_changed'
        AND e.entity_type = 'item'
        AND e.field_name = 'name'
    )
  UNION ALL
  SELECT
    c.family_id,
    'store_name'::text,
    c.ocr_raw_store_name,
    lower(regexp_replace(btrim(c.ocr_raw_store_name), '[[:space:]]+', ' ', 'g')),
    c.corrected_store_name,
    lower(regexp_replace(btrim(c.corrected_store_name), '[[:space:]]+', ' ', 'g')),
    '',
    c.receipt_id,
    r.uploaded_by,
    c.created_at
  FROM ocr_receipt_corrections c
  JOIN receipts r ON r.id = c.receipt_id AND r.family_id = c.family_id
  WHERE c.corrected_store_name IS NOT NULL
    AND btrim(c.corrected_store_name) <> ''
    AND lower(btrim(c.ocr_raw_store_name)) <> lower(btrim(c.corrected_store_name))
    AND lower(btrim(r.store_name)) = lower(btrim(c.corrected_store_name))
    AND NOT EXISTS (
      SELECT 1 FROM receipt_scan_feedback_events e
      WHERE e.receipt_id = c.receipt_id
        AND e.event_type = 'field_changed'
        AND e.entity_type = 'receipt'
        AND e.field_name = 'store_name'
    )
), grouped AS (
  SELECT
    family_id, correction_kind, source_normalized, target_normalized, context_key,
    max(source_value) AS source_value,
    max(target_value) AS target_value,
    count(DISTINCT receipt_id)::integer AS support_count,
    count(DISTINCT contributor_id)::integer AS contributor_count,
    min(created_at) AS first_seen_at,
    max(created_at) AS last_seen_at
  FROM evidence
  WHERE source_normalized <> '' AND target_normalized <> ''
  GROUP BY family_id, correction_kind, source_normalized, target_normalized, context_key
)
SELECT
  grouped.*,
  (
    sum(support_count) OVER (
      PARTITION BY family_id, correction_kind, source_normalized, context_key
    ) - support_count
  )::integer AS disagreement_count
FROM grouped;

REVOKE ALL ON household_historical_correction_candidates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON household_historical_correction_candidates TO service_role;

CREATE OR REPLACE FUNCTION backfill_household_correction_memory(
  p_family_id uuid,
  p_apply boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_candidates integer;
  v_support integer;
  v_upserted integer := 0;
BEGIN
  SELECT count(*)::integer, COALESCE(sum(support_count), 0)::integer
  INTO v_candidates, v_support
  FROM household_historical_correction_candidates
  WHERE family_id = p_family_id;

  IF p_apply THEN
    INSERT INTO household_correction_memory (
      family_id, correction_kind, source_value, source_normalized,
      target_value, target_normalized, context_key,
      historical_support_count, disagreement_count,
      distinct_receipt_count, distinct_contributor_count,
      confidence_score, first_seen_at, last_seen_at, updated_at
    )
    SELECT
      family_id, correction_kind, source_value, source_normalized,
      target_value, target_normalized, context_key,
      support_count, disagreement_count, support_count, contributor_count,
      ROUND((support_count + 1)::numeric / (support_count + disagreement_count + 2), 5),
      first_seen_at, last_seen_at, now()
    FROM household_historical_correction_candidates
    WHERE family_id = p_family_id
    ON CONFLICT (
      family_id, correction_kind, source_normalized, target_normalized, context_key
    ) DO UPDATE SET
      historical_support_count = EXCLUDED.historical_support_count,
      disagreement_count = EXCLUDED.disagreement_count,
      distinct_receipt_count = GREATEST(
        household_correction_memory.distinct_receipt_count,
        EXCLUDED.distinct_receipt_count
      ),
      distinct_contributor_count = GREATEST(
        household_correction_memory.distinct_contributor_count,
        EXCLUDED.distinct_contributor_count
      ),
      confidence_score = ROUND(
        (
          EXCLUDED.historical_support_count + household_correction_memory.live_support_count + 1
        )::numeric / GREATEST(
          EXCLUDED.historical_support_count + household_correction_memory.live_support_count +
          EXCLUDED.disagreement_count + household_correction_memory.rejection_count +
          (household_correction_memory.undo_count * 2) + 2,
          1
        ),
        5
      ),
      first_seen_at = LEAST(household_correction_memory.first_seen_at, EXCLUDED.first_seen_at),
      last_seen_at = GREATEST(household_correction_memory.last_seen_at, EXCLUDED.last_seen_at),
      updated_at = now();
    GET DIAGNOSTICS v_upserted = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'familyId', p_family_id,
    'dryRun', NOT p_apply,
    'candidateCount', v_candidates,
    'supportReceiptCount', v_support,
    'upsertedCount', v_upserted
  );
END;
$$;

REVOKE ALL ON FUNCTION backfill_household_correction_memory(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION backfill_household_correction_memory(uuid, boolean) TO service_role;

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
      e.family_id,
      e.receipt_id,
      e.actor_id,
      r.receipt_date,
      e.created_at,
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
  ), per_contributor AS (
    SELECT
      correction_kind, source_value, source_normalized, target_value,
      target_normalized, context_key, family_id, actor_id,
      count(DISTINCT receipt_id)::integer AS receipt_count
    FROM eligible_events
    WHERE correction_kind IS NOT NULL
      AND source_normalized <> ''
      AND target_normalized <> ''
      AND source_normalized <> target_normalized
    GROUP BY correction_kind, source_value, source_normalized, target_value,
      target_normalized, context_key, family_id, actor_id
  ), raw_grouped AS (
    SELECT
      correction_kind, source_normalized, target_normalized, context_key,
      max(source_value) AS source_value,
      max(target_value) AS target_value,
      count(DISTINCT receipt_id)::integer AS support_event_count,
      count(DISTINCT receipt_id)::integer AS distinct_receipt_count,
      count(DISTINCT actor_id)::integer AS distinct_contributor_count,
      count(DISTINCT family_id)::integer AS distinct_household_count,
      count(DISTINCT receipt_date)::integer AS distinct_day_count,
      min(created_at) AS first_seen_at,
      max(created_at) AS last_seen_at
    FROM eligible_events
    WHERE correction_kind IS NOT NULL
      AND source_normalized <> ''
      AND target_normalized <> ''
      AND source_normalized <> target_normalized
    GROUP BY correction_kind, source_normalized, target_normalized, context_key
  ), effective_grouped AS (
    SELECT
      correction_kind, source_normalized, target_normalized, context_key,
      sum(LEAST(receipt_count, 3))::integer AS effective_support_count
    FROM per_contributor
    GROUP BY correction_kind, source_normalized, target_normalized, context_key
  ), grouped AS (
    SELECT raw_grouped.*, effective_grouped.effective_support_count
    FROM raw_grouped
    JOIN effective_grouped USING (
      correction_kind, source_normalized, target_normalized, context_key
    )
  ), scored AS (
    SELECT
      grouped.*,
      (
        sum(effective_support_count) OVER (
          PARTITION BY correction_kind, source_normalized, context_key
        ) - effective_support_count
      )::integer AS disagreement_count
    FROM grouped
  )
  INSERT INTO global_correction_candidates (
    correction_kind, source_value, source_normalized, target_value,
    target_normalized, context_key, support_event_count,
    effective_support_count, disagreement_count, distinct_receipt_count,
    distinct_contributor_count, distinct_household_count, distinct_day_count,
    confidence_score, evidence_tier, first_seen_at, last_seen_at, generated_at
  )
  SELECT
    correction_kind, source_value, source_normalized, target_value,
    target_normalized, context_key, support_event_count,
    effective_support_count, disagreement_count, distinct_receipt_count,
    distinct_contributor_count, distinct_household_count, distinct_day_count,
    ROUND((effective_support_count + 1)::numeric /
      (effective_support_count + disagreement_count + 2), 5),
    CASE
      WHEN distinct_household_count >= 2 THEN 'independent'
      WHEN distinct_receipt_count >= 3 AND distinct_day_count >= 2 AND disagreement_count = 0
        THEN 'exploratory'
      ELSE 'observed'
    END,
    first_seen_at,
    last_seen_at,
    now()
  FROM scored;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION refresh_global_correction_candidates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION refresh_global_correction_candidates() TO service_role;

-- Replace migration 041's recorder so event insertion, memory projection, and
-- completion marking happen in one database transaction. Retries are safe.
CREATE OR REPLACE FUNCTION record_receipt_scan_feedback(
  p_receipt_id uuid,
  p_feedback_schema_version text,
  p_events jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_family uuid;
  v_event_count integer;
  v_inserted_count integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NULLIF(trim(p_feedback_schema_version), '') IS NULL THEN
    RAISE EXCEPTION 'Feedback schema version is required';
  END IF;
  IF jsonb_typeof(p_events) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Feedback events must be an array';
  END IF;
  v_event_count := jsonb_array_length(p_events);
  IF v_event_count < 1 OR v_event_count > 500 THEN
    RAISE EXCEPTION 'Feedback event count must be between 1 and 500';
  END IF;

  SELECT r.family_id INTO v_family
  FROM receipts r
  JOIN profiles p ON p.id = v_user AND p.family_id = r.family_id
  WHERE r.id = p_receipt_id
    AND r.uploaded_by = v_user
    AND r.status = 'confirmed'
    AND r.scan_provider IS NOT NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Eligible receipt not found'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_events) event
    WHERE jsonb_typeof(event) IS DISTINCT FROM 'object'
      OR NULLIF(trim(event->>'eventKey'), '') IS NULL
      OR event->>'eventType' NOT IN (
        'review_saved', 'field_changed', 'field_confirmed', 'item_excluded',
        'item_added', 'suggestion_offered', 'suggestion_accepted',
        'suggestion_rejected', 'suggestion_undone'
      )
      OR event->>'entityType' NOT IN ('receipt', 'item')
      OR event->>'sourceType' NOT IN (
        'model', 'deterministic_rule', 'household_memory', 'global_candidate', 'user'
      )
      OR COALESCE(jsonb_typeof(event->'context'), 'object') <> 'object'
  ) THEN RAISE EXCEPTION 'Invalid feedback event'; END IF;

  INSERT INTO receipt_scan_feedback_events (
    family_id, receipt_id, actor_id, event_key, event_type, entity_type,
    receipt_line_index, field_name, raw_value, final_value, source_type,
    source_key, source_version, context, feedback_schema_version
  )
  SELECT
    v_family, p_receipt_id, v_user, trim(event->>'eventKey'),
    event->>'eventType', event->>'entityType',
    NULLIF(event->>'receiptLineIndex', '')::integer,
    NULLIF(event->>'fieldName', ''), event->'rawValue', event->'finalValue',
    event->>'sourceType', NULLIF(event->>'sourceKey', ''),
    NULLIF(event->>'sourceVersion', ''), COALESCE(event->'context', '{}'::jsonb),
    trim(p_feedback_schema_version)
  FROM jsonb_array_elements(p_events) event
  ON CONFLICT (receipt_id, event_key, feedback_schema_version) DO NOTHING;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  PERFORM sync_receipt_feedback_memory(p_receipt_id);

  UPDATE receipts
  SET
    scan_feedback_expected = true,
    scan_feedback_schema_version = trim(p_feedback_schema_version),
    scan_feedback_recorded_at = now()
  WHERE id = p_receipt_id;

  RETURN v_inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION record_receipt_scan_feedback(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_receipt_scan_feedback(uuid, text, jsonb) TO authenticated;

-- Make category confidence a bounded probability-like score while retaining the
-- legacy integer confidence for compatibility.
CREATE OR REPLACE FUNCTION public.sync_expense_item_category_memory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_item_name text := lower(btrim(NEW.name));
  old_item_name text := CASE WHEN TG_OP = 'UPDATE' THEN lower(btrim(OLD.name)) ELSE NULL END;
BEGIN
  IF TG_OP = 'UPDATE'
     AND (OLD.family_id IS DISTINCT FROM NEW.family_id OR old_item_name IS DISTINCT FROM new_item_name)
     AND old_item_name IS NOT NULL AND old_item_name <> ''
     AND NOT EXISTS (
       SELECT 1 FROM public.expense_items
       WHERE family_id = OLD.family_id AND lower(btrim(name)) = old_item_name
     )
  THEN
    DELETE FROM public.item_category_memory
    WHERE family_id = OLD.family_id AND item_name = old_item_name;
  END IF;

  IF new_item_name = '' THEN RETURN NEW; END IF;
  IF NEW.category_id IS NULL THEN
    DELETE FROM public.item_category_memory
    WHERE family_id = NEW.family_id AND item_name = new_item_name;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.categories
    WHERE id = NEW.category_id AND family_id = NEW.family_id
  ) THEN RETURN NEW; END IF;

  INSERT INTO public.item_category_memory (
    family_id, item_name, category_id, confidence, support_count,
    rejection_count, confidence_score, updated_at, last_used_at
  ) VALUES (
    NEW.family_id, new_item_name, NEW.category_id, 1, 1, 0, 0.5, now(), now()
  )
  ON CONFLICT (family_id, item_name) DO UPDATE SET
    category_id = EXCLUDED.category_id,
    confidence = CASE
      WHEN item_category_memory.category_id = EXCLUDED.category_id
        THEN item_category_memory.confidence + 1 ELSE 1 END,
    support_count = CASE
      WHEN item_category_memory.category_id = EXCLUDED.category_id
        THEN item_category_memory.support_count + 1 ELSE 1 END,
    rejection_count = CASE
      WHEN item_category_memory.category_id = EXCLUDED.category_id
        THEN item_category_memory.rejection_count ELSE 0 END,
    confidence_score = CASE
      WHEN item_category_memory.category_id = EXCLUDED.category_id
        THEN ROUND((item_category_memory.support_count + 2)::numeric /
          (item_category_memory.support_count + item_category_memory.rejection_count + 3), 5)
      ELSE 0.5 END,
    updated_at = now(),
    last_used_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_expense_item_category_memory() FROM PUBLIC, anon, authenticated;
