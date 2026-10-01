-- Allow missing-image reconciliation to remove an existing expense only when
-- the user explicitly chooses Remove during discrepancy review. Deletions,
-- corrections, additions and image attachment remain one atomic transaction.
CREATE OR REPLACE FUNCTION reconcile_receipt_image(
  p_receipt_id uuid,
  p_image_url text,
  p_total_amount numeric,
  p_scan_metadata jsonb,
  p_item_updates jsonb DEFAULT '[]'::jsonb,
  p_new_items jsonb DEFAULT '[]'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_family uuid;
  v_receipt receipts%ROWTYPE;
  v_item jsonb;
  v_name text;
  v_amount numeric;
  v_quantity numeric;
  v_affected integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT family_id INTO v_family
  FROM profiles
  WHERE id = v_user;

  IF v_family IS NULL THEN
    RAISE EXCEPTION 'Family membership required';
  END IF;

  IF NULLIF(btrim(p_image_url), '') IS NULL
     OR p_image_url NOT LIKE v_family::text || '/' || p_receipt_id::text || '/%.jpg' THEN
    RAISE EXCEPTION 'Invalid receipt image path';
  END IF;

  IF p_total_amount IS NOT NULL AND p_total_amount < 0 THEN
    RAISE EXCEPTION 'Invalid receipt total';
  END IF;

  IF jsonb_typeof(COALESCE(p_item_updates, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_new_items, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Receipt item changes must be arrays';
  END IF;

  SELECT * INTO v_receipt
  FROM receipts
  WHERE id = p_receipt_id
    AND family_id = v_family
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt not found';
  END IF;

  IF v_receipt.image_url IS NOT NULL THEN
    RAISE EXCEPTION 'Receipt image already attached';
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_item_updates, '[]'::jsonb))
  LOOP
    IF COALESCE((v_item->>'delete')::boolean, false) THEN
      IF NULLIF(v_item->>'id', '') IS NULL THEN
        RAISE EXCEPTION 'Invalid receipt item deletion';
      END IF;

      DELETE FROM expense_items
      WHERE id = (v_item->>'id')::uuid
        AND receipt_id = p_receipt_id
        AND family_id = v_family;

      GET DIAGNOSTICS v_affected = ROW_COUNT;
      IF v_affected <> 1 THEN
        RAISE EXCEPTION 'Receipt item deletion target not found';
      END IF;

      CONTINUE;
    END IF;

    v_name := btrim(COALESCE(v_item->>'name', ''));
    v_amount := (v_item->>'amount')::numeric;
    v_quantity := NULLIF(v_item->>'quantity', '')::numeric;

    IF NULLIF(v_item->>'id', '') IS NULL
       OR v_name = '' OR length(v_name) > 120
       OR v_amount IS NULL OR v_amount < 0
       OR (v_quantity IS NOT NULL AND v_quantity <= 0)
       OR COALESCE(NULLIF(v_item->>'discountAmount', '')::numeric, 0) < 0
       OR COALESCE(NULLIF(v_item->>'originalPrice', '')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'Invalid receipt item correction';
    END IF;

    UPDATE expense_items
    SET name = v_name,
        amount = v_amount,
        quantity = v_quantity,
        unit = NULLIF(btrim(COALESCE(v_item->>'unit', '')), ''),
        original_price = NULLIF(v_item->>'originalPrice', '')::numeric,
        discount_amount = NULLIF(v_item->>'discountAmount', '')::numeric,
        is_on_receipt = true,
        receipt_line_index = NULLIF(v_item->>'receiptLineIndex', '')::integer
    WHERE id = (v_item->>'id')::uuid
      AND receipt_id = p_receipt_id
      AND family_id = v_family;

    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected <> 1 THEN
      RAISE EXCEPTION 'Receipt item correction target not found';
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_new_items, '[]'::jsonb))
  LOOP
    v_name := btrim(COALESCE(v_item->>'name', ''));
    v_amount := (v_item->>'amount')::numeric;
    v_quantity := NULLIF(v_item->>'quantity', '')::numeric;

    IF v_name = '' OR length(v_name) > 120
       OR v_amount IS NULL OR v_amount < 0
       OR (v_quantity IS NOT NULL AND v_quantity <= 0)
       OR COALESCE(NULLIF(v_item->>'discountAmount', '')::numeric, 0) < 0
       OR COALESCE(NULLIF(v_item->>'originalPrice', '')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'Invalid new receipt item';
    END IF;

    INSERT INTO expense_items (
      family_id,
      receipt_id,
      added_by,
      category_id,
      name,
      amount,
      quantity,
      unit,
      expense_date,
      is_manual,
      original_price,
      discount_amount,
      is_on_receipt,
      receipt_line_index
    ) VALUES (
      v_family,
      p_receipt_id,
      v_user,
      NULL,
      v_name,
      v_amount,
      v_quantity,
      NULLIF(btrim(COALESCE(v_item->>'unit', '')), ''),
      COALESCE(v_receipt.receipt_date, current_date),
      true,
      NULLIF(v_item->>'originalPrice', '')::numeric,
      NULLIF(v_item->>'discountAmount', '')::numeric,
      true,
      NULLIF(v_item->>'receiptLineIndex', '')::integer
    );
  END LOOP;

  UPDATE receipts
  SET image_url = p_image_url,
      total_amount = COALESCE(total_amount, p_total_amount),
      scan_provider = p_scan_metadata->>'provider',
      scan_model = p_scan_metadata->>'model',
      scan_prompt_version = p_scan_metadata->>'promptVersion',
      scan_schema_version = p_scan_metadata->>'schemaVersion',
      scan_raw_result = p_scan_metadata->'rawResult',
      scan_latency_ms = NULLIF(p_scan_metadata->>'latencyMs', '')::integer,
      scan_input_tokens = NULLIF(p_scan_metadata->>'inputTokens', '')::integer,
      scan_output_tokens = NULLIF(p_scan_metadata->>'outputTokens', '')::integer
  WHERE id = p_receipt_id
    AND family_id = v_family;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION reconcile_receipt_image(uuid, text, numeric, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reconcile_receipt_image(uuid, text, numeric, jsonb, jsonb, jsonb) TO authenticated;
