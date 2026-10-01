-- Phase 9.1: durable, structured receipt-review feedback for household and
-- consent-governed global intelligence. Runtime users write only through the
-- validating RPC; cross-household use still requires the receipt consent gates
-- established by migration 030 and ADR-016.

CREATE TABLE receipt_scan_feedback_events (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id               uuid        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  receipt_id              uuid        NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  actor_id                uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  event_key               text        NOT NULL CHECK (event_key <> ''),
  event_type              text        NOT NULL CHECK (event_type IN (
    'review_saved', 'field_changed', 'field_confirmed', 'item_excluded',
    'item_added', 'suggestion_offered', 'suggestion_accepted',
    'suggestion_rejected', 'suggestion_undone'
  )),
  entity_type             text        NOT NULL CHECK (entity_type IN ('receipt', 'item')),
  receipt_line_index      integer     CHECK (receipt_line_index IS NULL OR receipt_line_index >= 0),
  field_name              text,
  raw_value               jsonb,
  final_value             jsonb,
  source_type             text        NOT NULL CHECK (source_type IN (
    'model', 'deterministic_rule', 'household_memory', 'global_candidate', 'user'
  )),
  source_key              text,
  source_version          text,
  context                 jsonb       NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context) = 'object'),
  feedback_schema_version text        NOT NULL CHECK (feedback_schema_version <> ''),
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receipt_id, event_key, feedback_schema_version)
);

CREATE INDEX receipt_scan_feedback_family_created_idx
  ON receipt_scan_feedback_events (family_id, created_at);

CREATE INDEX receipt_scan_feedback_candidate_idx
  ON receipt_scan_feedback_events (event_type, source_type, source_key)
  WHERE event_type <> 'review_saved';

ALTER TABLE receipt_scan_feedback_events ENABLE ROW LEVEL SECURITY;

-- Browser clients cannot read or insert raw feedback rows directly. This keeps
-- household data behind the validating RPC and administrative consent filters.
GRANT SELECT ON receipt_scan_feedback_events TO service_role;

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
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Eligible receipt not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_events) event
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
  ) THEN
    RAISE EXCEPTION 'Invalid feedback event';
  END IF;

  INSERT INTO receipt_scan_feedback_events (
    family_id,
    receipt_id,
    actor_id,
    event_key,
    event_type,
    entity_type,
    receipt_line_index,
    field_name,
    raw_value,
    final_value,
    source_type,
    source_key,
    source_version,
    context,
    feedback_schema_version
  )
  SELECT
    v_family,
    p_receipt_id,
    v_user,
    trim(event->>'eventKey'),
    event->>'eventType',
    event->>'entityType',
    NULLIF(event->>'receiptLineIndex', '')::integer,
    NULLIF(event->>'fieldName', ''),
    event->'rawValue',
    event->'finalValue',
    event->>'sourceType',
    NULLIF(event->>'sourceKey', ''),
    NULLIF(event->>'sourceVersion', ''),
    COALESCE(event->'context', '{}'::jsonb),
    trim(p_feedback_schema_version)
  FROM jsonb_array_elements(p_events) event
  ON CONFLICT (receipt_id, event_key, feedback_schema_version) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN v_inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION record_receipt_scan_feedback(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_receipt_scan_feedback(uuid, text, jsonb) TO authenticated;
