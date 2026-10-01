-- Allow a mistakenly merged reporting name to be separated without changing
-- the original names stored on historical expense rows.
CREATE OR REPLACE FUNCTION separate_catalog_item_alias(
  p_item_id uuid,
  p_alias_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_family uuid;
  v_item catalog_items%ROWTYPE;
  v_alias catalog_item_aliases%ROWTYPE;
  v_new_item_id uuid;
  v_purchase_count integer;
BEGIN
  SELECT family_id INTO v_family
  FROM profiles
  WHERE id = auth.uid();

  IF v_family IS NULL THEN
    RAISE EXCEPTION 'catalog_item_not_found';
  END IF;

  SELECT * INTO v_item
  FROM catalog_items
  WHERE id = p_item_id
    AND family_id = v_family
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'catalog_item_not_found';
  END IF;

  SELECT * INTO v_alias
  FROM catalog_item_aliases
  WHERE id = p_alias_id
    AND catalog_item_id = p_item_id
    AND family_id = v_family
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'catalog_alias_not_found';
  END IF;

  IF v_alias.normalized_alias = v_item.normalized_name THEN
    RAISE EXCEPTION 'primary_alias_cannot_be_separated';
  END IF;

  SELECT count(*) INTO v_purchase_count
  FROM expense_items
  WHERE family_id = v_family
    AND catalog_item_id = p_item_id
    AND normalize_catalog_item_name(name) = v_alias.normalized_alias;

  IF v_purchase_count = 0 THEN
    DELETE FROM catalog_item_aliases
    WHERE id = p_alias_id
      AND family_id = v_family;

    RETURN NULL;
  END IF;

  INSERT INTO catalog_items (
    family_id,
    canonical_name,
    normalized_name
  )
  VALUES (
    v_family,
    v_alias.alias_name,
    v_alias.normalized_alias
  )
  RETURNING id INTO v_new_item_id;

  UPDATE catalog_item_aliases
  SET catalog_item_id = v_new_item_id
  WHERE id = p_alias_id
    AND family_id = v_family;

  UPDATE expense_items
  SET catalog_item_id = v_new_item_id
  WHERE family_id = v_family
    AND catalog_item_id = p_item_id
    AND normalize_catalog_item_name(name) = v_alias.normalized_alias;

  RETURN v_new_item_id;
END;
$$;

REVOKE ALL ON FUNCTION separate_catalog_item_alias(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION separate_catalog_item_alias(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION separate_catalog_item_alias(uuid, uuid) IS
  'Separates a non-primary reporting alias and its exact-name historical purchases into a new family catalog item, or removes the alias when unused.';
