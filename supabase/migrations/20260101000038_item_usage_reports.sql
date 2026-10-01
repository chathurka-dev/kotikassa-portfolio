-- Reporting Phase A/B: canonical household items, aliases, and expense linkage.
-- Exact normalized names are grouped automatically. Ambiguous names remain
-- separate until a family member explicitly merges them.

CREATE OR REPLACE FUNCTION normalize_catalog_item_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
  SELECT trim(regexp_replace(lower(normalize(p_name, NFKC)), '[^[:alnum:]]+', ' ', 'g'));
$$;

CREATE TABLE catalog_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  canonical_name  text NOT NULL CHECK (char_length(trim(canonical_name)) BETWEEN 1 AND 120),
  normalized_name text NOT NULL CHECK (char_length(normalized_name) BETWEEN 1 AND 120),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, normalized_name),
  UNIQUE (id, family_id)
);

CREATE TABLE catalog_item_aliases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id        uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  catalog_item_id  uuid NOT NULL,
  alias_name       text NOT NULL CHECK (char_length(trim(alias_name)) BETWEEN 1 AND 120),
  normalized_alias text NOT NULL CHECK (char_length(normalized_alias) BETWEEN 1 AND 120),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, normalized_alias),
  FOREIGN KEY (catalog_item_id, family_id)
    REFERENCES catalog_items(id, family_id) ON DELETE CASCADE
);

ALTER TABLE expense_items
  ADD COLUMN catalog_item_id uuid REFERENCES catalog_items(id) ON DELETE SET NULL;

CREATE INDEX idx_catalog_items_family_name
  ON catalog_items (family_id, canonical_name);
CREATE INDEX idx_catalog_item_aliases_item
  ON catalog_item_aliases (catalog_item_id);
CREATE INDEX idx_expense_items_catalog_date
  ON expense_items (family_id, catalog_item_id, expense_date DESC)
  WHERE catalog_item_id IS NOT NULL;

ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_item_aliases ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON catalog_items, catalog_item_aliases TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON catalog_items, catalog_item_aliases FROM authenticated;

CREATE POLICY "family members can view catalog items"
  ON catalog_items FOR SELECT
  USING (family_id = auth_family_id());

CREATE POLICY "family members can view catalog item aliases"
  ON catalog_item_aliases FOR SELECT
  USING (family_id = auth_family_id());

-- Use the most recently purchased spelling as the initial display name while
-- grouping only exact normalized matches. This deliberately avoids guessing
-- that similar products are equivalent.
WITH ranked_names AS (
  SELECT
    family_id,
    name,
    normalize_catalog_item_name(name) AS normalized_name,
    row_number() OVER (
      PARTITION BY family_id, normalize_catalog_item_name(name)
      ORDER BY expense_date DESC, created_at DESC, id DESC
    ) AS name_rank
  FROM expense_items
  WHERE char_length(normalize_catalog_item_name(name)) BETWEEN 1 AND 120
)
INSERT INTO catalog_items (family_id, canonical_name, normalized_name)
SELECT family_id, trim(name), normalized_name
FROM ranked_names
WHERE name_rank = 1
ON CONFLICT (family_id, normalized_name) DO NOTHING;

WITH ranked_aliases AS (
  SELECT
    expense.family_id,
    item.id AS catalog_item_id,
    expense.name,
    normalize_catalog_item_name(expense.name) AS normalized_alias,
    row_number() OVER (
      PARTITION BY expense.family_id, normalize_catalog_item_name(expense.name)
      ORDER BY expense.expense_date DESC, expense.created_at DESC, expense.id DESC
    ) AS alias_rank
  FROM expense_items expense
  JOIN catalog_items item
    ON item.family_id = expense.family_id
   AND item.normalized_name = normalize_catalog_item_name(expense.name)
)
INSERT INTO catalog_item_aliases (family_id, catalog_item_id, alias_name, normalized_alias)
SELECT family_id, catalog_item_id, trim(name), normalized_alias
FROM ranked_aliases
WHERE alias_rank = 1
ON CONFLICT (family_id, normalized_alias) DO NOTHING;

UPDATE expense_items expense
SET catalog_item_id = alias.catalog_item_id
FROM catalog_item_aliases alias
WHERE alias.family_id = expense.family_id
  AND alias.normalized_alias = normalize_catalog_item_name(expense.name);

-- New and renamed expense rows are linked automatically. An unfamiliar name
-- gets its own item; only an explicit merge can combine ambiguous products.
CREATE OR REPLACE FUNCTION assign_expense_catalog_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_normalized text;
  v_catalog_item_id uuid;
  v_catalog_family uuid;
BEGIN
  v_normalized := normalize_catalog_item_name(NEW.name);

  IF char_length(v_normalized) NOT BETWEEN 1 AND 120 THEN
    NEW.catalog_item_id := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.name IS NOT DISTINCT FROM OLD.name
     AND NEW.family_id IS NOT DISTINCT FROM OLD.family_id THEN
    IF NEW.catalog_item_id IS NOT NULL THEN
      SELECT family_id INTO v_catalog_family
      FROM catalog_items
      WHERE id = NEW.catalog_item_id;

      IF v_catalog_family IS DISTINCT FROM NEW.family_id THEN
        RAISE EXCEPTION 'Catalog item does not belong to expense family';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  SELECT catalog_item_id INTO v_catalog_item_id
  FROM catalog_item_aliases
  WHERE family_id = NEW.family_id
    AND normalized_alias = v_normalized;

  IF v_catalog_item_id IS NULL THEN
    INSERT INTO catalog_items (family_id, canonical_name, normalized_name)
    VALUES (NEW.family_id, trim(NEW.name), v_normalized)
    ON CONFLICT (family_id, normalized_name)
    DO UPDATE SET updated_at = catalog_items.updated_at
    RETURNING id INTO v_catalog_item_id;

    INSERT INTO catalog_item_aliases (
      family_id, catalog_item_id, alias_name, normalized_alias
    )
    VALUES (NEW.family_id, v_catalog_item_id, trim(NEW.name), v_normalized)
    ON CONFLICT (family_id, normalized_alias) DO NOTHING;
  END IF;

  NEW.catalog_item_id := v_catalog_item_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_expense_catalog_item_trigger
BEFORE INSERT OR UPDATE OF name, family_id, catalog_item_id
ON expense_items
FOR EACH ROW EXECUTE FUNCTION assign_expense_catalog_item();

CREATE OR REPLACE FUNCTION merge_catalog_items(
  p_target_item_id uuid,
  p_source_item_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_family uuid;
BEGIN
  SELECT family_id INTO v_family FROM profiles WHERE id = auth.uid();
  IF v_family IS NULL OR p_target_item_id = p_source_item_id THEN
    RAISE EXCEPTION 'Invalid catalog item merge';
  END IF;

  PERFORM 1
  FROM catalog_items
  WHERE family_id = v_family
    AND id IN (p_target_item_id, p_source_item_id)
  FOR UPDATE;

  IF (SELECT count(*) FROM catalog_items
      WHERE family_id = v_family
        AND id IN (p_target_item_id, p_source_item_id)) <> 2 THEN
    RAISE EXCEPTION 'Catalog items not found';
  END IF;

  UPDATE expense_items
  SET catalog_item_id = p_target_item_id
  WHERE family_id = v_family
    AND catalog_item_id = p_source_item_id;

  UPDATE catalog_item_aliases
  SET catalog_item_id = p_target_item_id
  WHERE family_id = v_family
    AND catalog_item_id = p_source_item_id;

  DELETE FROM catalog_items
  WHERE id = p_source_item_id
    AND family_id = v_family;
END;
$$;

CREATE OR REPLACE FUNCTION rename_catalog_item(
  p_item_id uuid,
  p_canonical_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_family uuid;
  v_name text := trim(p_canonical_name);
  v_normalized text;
BEGIN
  SELECT family_id INTO v_family FROM profiles WHERE id = auth.uid();
  v_normalized := normalize_catalog_item_name(v_name);

  IF v_family IS NULL OR char_length(v_name) NOT BETWEEN 1 AND 120
     OR char_length(v_normalized) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Invalid catalog item name';
  END IF;

  UPDATE catalog_items
  SET canonical_name = v_name,
      normalized_name = v_normalized,
      updated_at = now()
  WHERE id = p_item_id
    AND family_id = v_family;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catalog item not found';
  END IF;

  INSERT INTO catalog_item_aliases (
    family_id, catalog_item_id, alias_name, normalized_alias
  )
  VALUES (v_family, p_item_id, v_name, v_normalized)
  ON CONFLICT (family_id, normalized_alias) DO UPDATE
  SET alias_name = EXCLUDED.alias_name
  WHERE catalog_item_aliases.catalog_item_id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That name already belongs to another item';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION merge_catalog_items(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION rename_catalog_item(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION merge_catalog_items(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION rename_catalog_item(uuid, text) TO authenticated;

COMMENT ON COLUMN expense_items.catalog_item_id IS
  'Canonical family item used for unit-safe usage reports; assigned from exact aliases or explicit merges.';
