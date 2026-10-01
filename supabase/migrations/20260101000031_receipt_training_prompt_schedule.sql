-- Phase 10: record model-development prompt views and schedule limited follow-ups.
-- Standard milestones are the 1st, 5th and 20th eligible scans. If an existing
-- user first saw the prompt later, preserve the same 4-scan and 15-scan spacing.

ALTER TABLE user_privacy_choices
  ADD COLUMN receipt_training_prompt_count           integer     NOT NULL DEFAULT 0,
  ADD COLUMN receipt_training_prompt_version         text,
  ADD COLUMN receipt_training_last_prompted_at       timestamptz,
  ADD COLUMN receipt_training_last_prompted_scan_count integer,
  ADD CONSTRAINT receipt_training_prompt_count_valid CHECK (
    receipt_training_prompt_count BETWEEN 0 AND 3
  ),
  ADD CONSTRAINT receipt_training_prompt_scan_count_valid CHECK (
    receipt_training_last_prompted_scan_count IS NULL
    OR receipt_training_last_prompted_scan_count >= 1
  );

-- Migration 030 already showed one prompt before recording prompt views existed.
UPDATE user_privacy_choices choices
SET
  receipt_training_prompt_count = 1,
  receipt_training_prompt_version = choices.receipt_training_choice_version,
  receipt_training_last_prompted_at = choices.receipt_training_choice_at,
  receipt_training_last_prompted_scan_count = GREATEST(
    1,
    (
      SELECT COUNT(*)::integer
      FROM receipts receipt
      WHERE receipt.uploaded_by = choices.user_id
        AND receipt.status = 'confirmed'
        AND receipt.image_url IS NOT NULL
        AND receipt.scan_provider IS NOT NULL
        AND receipt.scan_schema_version IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM expense_items item
          WHERE item.receipt_id = receipt.id
            AND item.is_on_receipt = true
        )
    )
  )
WHERE choices.receipt_training_choice_at IS NOT NULL;

CREATE OR REPLACE FUNCTION claim_receipt_training_prompt(
  p_receipt_id uuid,
  p_prompt_version text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_prompt_count integer;
  v_last_prompted_scan_count integer;
  v_training_enabled boolean;
  v_withdrawn_at timestamptz;
  v_scan_count integer;
  v_next_scan_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_receipt_id IS NULL THEN
    RAISE EXCEPTION 'Receipt is required';
  END IF;

  IF NULLIF(trim(p_prompt_version), '') IS NULL THEN
    RAISE EXCEPTION 'Prompt version is required';
  END IF;

  SELECT
    receipt_training_prompt_count,
    receipt_training_last_prompted_scan_count,
    receipt_training_enabled,
    receipt_training_withdrawn_at
  INTO
    v_prompt_count,
    v_last_prompted_scan_count,
    v_training_enabled,
    v_withdrawn_at
  FROM user_privacy_choices
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_training_enabled OR v_withdrawn_at IS NOT NULL OR v_prompt_count >= 3 THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM receipts receipt
    WHERE receipt.id = p_receipt_id
      AND receipt.uploaded_by = v_user_id
      AND receipt.status = 'confirmed'
      AND receipt.image_url IS NOT NULL
      AND receipt.scan_provider IS NOT NULL
      AND receipt.scan_schema_version IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM expense_items item
        WHERE item.receipt_id = receipt.id
          AND item.is_on_receipt = true
      )
  ) THEN
    RETURN false;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_scan_count
  FROM receipts receipt
  WHERE receipt.uploaded_by = v_user_id
    AND receipt.status = 'confirmed'
    AND receipt.image_url IS NOT NULL
    AND receipt.scan_provider IS NOT NULL
    AND receipt.scan_schema_version IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM expense_items item
      WHERE item.receipt_id = receipt.id
        AND item.is_on_receipt = true
    );

  v_next_scan_count := CASE v_prompt_count
    WHEN 0 THEN 1
    WHEN 1 THEN GREATEST(5, COALESCE(v_last_prompted_scan_count, 1) + 4)
    WHEN 2 THEN GREATEST(20, COALESCE(v_last_prompted_scan_count, 5) + 15)
  END;

  IF v_scan_count < v_next_scan_count THEN
    RETURN false;
  END IF;

  UPDATE user_privacy_choices
  SET
    receipt_training_prompt_count = receipt_training_prompt_count + 1,
    receipt_training_prompt_version = trim(p_prompt_version),
    receipt_training_last_prompted_at = now(),
    receipt_training_last_prompted_scan_count = v_scan_count,
    updated_at = now()
  WHERE user_id = v_user_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION claim_receipt_training_prompt(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_receipt_training_prompt(uuid, text) TO authenticated;
