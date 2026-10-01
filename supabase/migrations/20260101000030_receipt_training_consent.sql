-- Phase 10: versioned consent for Kotikassa-owned receipt-model development.
-- Receipt-scanning consent and model-training consent remain separate purposes.

ALTER TABLE user_privacy_choices
  -- Keep privacy_acknowledged_at temporarily for compatibility with an older
  -- deployed web build while the database migration and Vercel deploy overlap.
  ADD COLUMN privacy_notice_shown_at          timestamptz,
  ADD COLUMN receipt_training_enabled         boolean     NOT NULL DEFAULT false,
  ADD COLUMN receipt_training_choice_version text,
  ADD COLUMN receipt_training_choice_at      timestamptz,
  ADD COLUMN receipt_training_consented_at   timestamptz,
  ADD COLUMN receipt_training_withdrawn_at   timestamptz,
  ADD CONSTRAINT receipt_training_consent_required CHECK (
    NOT receipt_training_enabled OR (
      receipt_training_choice_version IS NOT NULL
      AND receipt_training_choice_at IS NOT NULL
      AND receipt_training_consented_at IS NOT NULL
    )
  );

UPDATE user_privacy_choices
SET privacy_notice_shown_at = privacy_acknowledged_at
WHERE privacy_notice_shown_at IS NULL;

ALTER TABLE user_privacy_choices
  ALTER COLUMN privacy_notice_shown_at SET DEFAULT now(),
  ALTER COLUMN privacy_notice_shown_at SET NOT NULL;

ALTER TABLE receipts
  ADD COLUMN training_eligible         boolean     NOT NULL DEFAULT false,
  ADD COLUMN training_consent_version  text,
  ADD COLUMN training_consented_at     timestamptz,
  ADD CONSTRAINT receipt_training_snapshot_required CHECK (
    NOT training_eligible OR (
      training_consent_version IS NOT NULL
      AND training_consented_at IS NOT NULL
    )
  );

CREATE INDEX receipts_training_export_idx
  ON receipts (uploaded_by, created_at)
  WHERE training_eligible = true;

-- The local administrative exporter verifies both the receipt snapshot and
-- the uploader's current unwithdrawn choice.
GRANT SELECT ON user_privacy_choices TO service_role;

CREATE OR REPLACE FUNCTION set_privacy_choices(
  p_privacy_notice_version text,
  p_receipt_scanning_enabled boolean,
  p_receipt_scanning_consent_version text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NULLIF(trim(p_privacy_notice_version), '') IS NULL THEN
    RAISE EXCEPTION 'Privacy notice version is required';
  END IF;

  IF p_receipt_scanning_enabled
     AND NULLIF(trim(p_receipt_scanning_consent_version), '') IS NULL THEN
    RAISE EXCEPTION 'Receipt scanning consent version is required';
  END IF;

  INSERT INTO user_privacy_choices (
    user_id,
    privacy_notice_version,
    privacy_notice_shown_at,
    receipt_scanning_enabled,
    receipt_scanning_consent_version,
    receipt_scanning_consented_at,
    receipt_scanning_withdrawn_at,
    updated_at
  )
  VALUES (
    v_user_id,
    trim(p_privacy_notice_version),
    now(),
    p_receipt_scanning_enabled,
    CASE WHEN p_receipt_scanning_enabled
      THEN trim(p_receipt_scanning_consent_version)
      ELSE NULL
    END,
    CASE WHEN p_receipt_scanning_enabled THEN now() ELSE NULL END,
    NULL,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    privacy_notice_version = EXCLUDED.privacy_notice_version,
    privacy_notice_shown_at = CASE
      WHEN user_privacy_choices.privacy_notice_version
           IS DISTINCT FROM EXCLUDED.privacy_notice_version
      THEN now()
      ELSE user_privacy_choices.privacy_notice_shown_at
    END,
    receipt_scanning_enabled = EXCLUDED.receipt_scanning_enabled,
    receipt_scanning_consent_version = CASE
      WHEN EXCLUDED.receipt_scanning_enabled
      THEN EXCLUDED.receipt_scanning_consent_version
      ELSE user_privacy_choices.receipt_scanning_consent_version
    END,
    receipt_scanning_consented_at = CASE
      WHEN EXCLUDED.receipt_scanning_enabled
           AND (
             NOT user_privacy_choices.receipt_scanning_enabled
             OR user_privacy_choices.receipt_scanning_consent_version
                IS DISTINCT FROM EXCLUDED.receipt_scanning_consent_version
           )
      THEN now()
      ELSE user_privacy_choices.receipt_scanning_consented_at
    END,
    receipt_scanning_withdrawn_at = CASE
      WHEN NOT EXCLUDED.receipt_scanning_enabled
           AND user_privacy_choices.receipt_scanning_enabled
      THEN now()
      WHEN EXCLUDED.receipt_scanning_enabled THEN NULL
      ELSE user_privacy_choices.receipt_scanning_withdrawn_at
    END,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION set_receipt_training_choice(
  p_enabled boolean,
  p_choice_version text,
  p_receipt_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_previous_enabled boolean;
  v_previous_version text;
  v_rows_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Training choice is required';
  END IF;

  IF NULLIF(trim(p_choice_version), '') IS NULL THEN
    RAISE EXCEPTION 'Training choice version is required';
  END IF;

  SELECT receipt_training_enabled, receipt_training_choice_version
    INTO v_previous_enabled, v_previous_version
  FROM user_privacy_choices
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Privacy choices must be recorded first';
  END IF;

  UPDATE user_privacy_choices
  SET
    receipt_training_enabled = p_enabled,
    receipt_training_choice_version = trim(p_choice_version),
    receipt_training_choice_at = now(),
    receipt_training_consented_at = CASE
      WHEN p_enabled AND (
        NOT v_previous_enabled
        OR v_previous_version IS DISTINCT FROM trim(p_choice_version)
      ) THEN now()
      ELSE receipt_training_consented_at
    END,
    receipt_training_withdrawn_at = CASE
      WHEN NOT p_enabled AND v_previous_enabled THEN now()
      WHEN p_enabled THEN NULL
      ELSE receipt_training_withdrawn_at
    END,
    updated_at = now()
  WHERE user_id = v_user_id;

  IF NOT p_enabled THEN
    UPDATE receipts
    SET training_eligible = false
    WHERE uploaded_by = v_user_id
      AND training_eligible = true;
    RETURN;
  END IF;

  IF p_receipt_id IS NOT NULL THEN
    UPDATE receipts
    SET
      training_eligible = true,
      training_consent_version = trim(p_choice_version),
      training_consented_at = now()
    WHERE id = p_receipt_id
      AND uploaded_by = v_user_id
      AND status = 'confirmed'
      AND image_url IS NOT NULL
      AND scan_provider IS NOT NULL
      AND scan_schema_version IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM expense_items
        WHERE receipt_id = p_receipt_id
          AND is_on_receipt = true
      );

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated <> 1 THEN
      RAISE EXCEPTION 'Receipt is not eligible for training consent';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION set_receipt_training_choice(boolean, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_receipt_training_choice(boolean, text, uuid) TO authenticated;
