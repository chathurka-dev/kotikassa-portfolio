-- Returns the list of member auth IDs, then deletes the entire family (cascades all data).
-- Called from a server action (service role) so the caller can delete auth users afterward.
CREATE OR REPLACE FUNCTION delete_family_and_data(p_family_id UUID)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_ids UUID[];
BEGIN
  -- Collect member auth IDs before cascade removes them
  SELECT ARRAY_AGG(id) INTO v_member_ids
  FROM profiles
  WHERE family_id = p_family_id;

  -- Delete family row — FK cascades remove all related rows:
  -- profiles, expense_items, income_entries, savings_goals, investments,
  -- recurring_expenses, categories (→ category_budgets), family_income_sources,
  -- family_invites
  DELETE FROM families WHERE id = p_family_id;

  RETURN COALESCE(v_member_ids, '{}');
END;
$$;

-- Removes a single member from a family without touching the family itself.
CREATE OR REPLACE FUNCTION leave_family(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET family_id = NULL WHERE id = p_user_id;
END;
$$;
