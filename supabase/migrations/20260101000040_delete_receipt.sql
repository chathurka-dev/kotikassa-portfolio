-- Delete a receipt and its ordinary expense rows as one authenticated database
-- transaction. Storage cleanup happens after this RPC commits so a storage
-- failure can never leave a surviving receipt without its financial rows.
CREATE OR REPLACE FUNCTION delete_receipt(p_receipt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_family uuid;
  v_image_path text;
  v_locked_count integer;
  v_deleted_item_count integer;
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

  SELECT image_url INTO v_image_path
  FROM receipts
  WHERE id = p_receipt_id
    AND family_id = v_family
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt not found';
  END IF;

  -- Lock every linked item before checking and deleting so the decision cannot
  -- race a concurrent People-transaction link or item update.
  PERFORM 1
  FROM expense_items
  WHERE receipt_id = p_receipt_id
    AND family_id = v_family
  FOR UPDATE;

  SELECT count(*)::integer INTO v_locked_count
  FROM expense_items
  WHERE receipt_id = p_receipt_id
    AND family_id = v_family
    AND people_transaction_id IS NOT NULL;

  IF v_locked_count > 0 THEN
    RETURN jsonb_build_object(
      'deleted', false,
      'reason', 'people_locked',
      'locked_count', v_locked_count
    );
  END IF;

  DELETE FROM expense_items
  WHERE receipt_id = p_receipt_id
    AND family_id = v_family;
  GET DIAGNOSTICS v_deleted_item_count = ROW_COUNT;

  DELETE FROM receipts
  WHERE id = p_receipt_id
    AND family_id = v_family;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt not found';
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'image_path', v_image_path,
    'deleted_item_count', v_deleted_item_count
  );
END;
$$;

REVOKE ALL ON FUNCTION delete_receipt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_receipt(uuid) TO authenticated;
