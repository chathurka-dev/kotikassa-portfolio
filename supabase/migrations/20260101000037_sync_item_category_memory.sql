-- Keep family item-category memory aligned with every expense category edit,
-- regardless of which UI initiated the insert/update.

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
  -- A corrected item name should not leave an unused OCR/mistyped key behind.
  -- Preserve the old key while another expense still uses that exact name.
  IF TG_OP = 'UPDATE'
     AND (
       OLD.family_id IS DISTINCT FROM NEW.family_id
       OR old_item_name IS DISTINCT FROM new_item_name
     )
     AND old_item_name IS NOT NULL
     AND old_item_name <> ''
     AND NOT EXISTS (
       SELECT 1
       FROM public.expense_items
       WHERE family_id = OLD.family_id
         AND lower(btrim(name)) = old_item_name
     )
  THEN
    DELETE FROM public.item_category_memory
    WHERE family_id = OLD.family_id
      AND item_name = old_item_name;
  END IF;

  IF new_item_name = '' THEN
    RETURN NEW;
  END IF;

  -- Removing a category is also a correction: stop auto-selecting the old one.
  IF NEW.category_id IS NULL THEN
    DELETE FROM public.item_category_memory
    WHERE family_id = NEW.family_id
      AND item_name = new_item_name;
    RETURN NEW;
  END IF;

  -- Never create a cross-family memory mapping even if a malformed client
  -- somehow submits a category belonging to another family.
  IF NOT EXISTS (
    SELECT 1
    FROM public.categories
    WHERE id = NEW.category_id
      AND family_id = NEW.family_id
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.item_category_memory (
    family_id,
    item_name,
    category_id,
    confidence,
    updated_at
  )
  VALUES (
    NEW.family_id,
    new_item_name,
    NEW.category_id,
    1,
    now()
  )
  ON CONFLICT (family_id, item_name) DO UPDATE
  SET
    category_id = EXCLUDED.category_id,
    confidence = CASE
      WHEN item_category_memory.category_id = EXCLUDED.category_id
        THEN item_category_memory.confidence + 1
      ELSE 1
    END,
    updated_at = now();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_expense_item_category_memory() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_expense_item_category_memory() FROM anon;
REVOKE ALL ON FUNCTION public.sync_expense_item_category_memory() FROM authenticated;

DROP TRIGGER IF EXISTS sync_expense_item_category_memory_trigger
  ON public.expense_items;

CREATE TRIGGER sync_expense_item_category_memory_trigger
AFTER INSERT OR UPDATE OF name, category_id, family_id
ON public.expense_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_expense_item_category_memory();
