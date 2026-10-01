-- ============================================================
-- Kotikassa — Row Level Security Policies
-- Migration: 002_rls.sql
-- Run this AFTER 001_schema.sql
-- ============================================================
-- RLS ensures data isolation at the DATABASE level.
-- Even if there is an application bug, Supabase will never
-- return rows belonging to a different family.
-- ============================================================

-- ── Helper function ──────────────────────────────────────────
-- Returns the family_id for the currently authenticated user.
-- Used in all RLS policies below to avoid repeated subqueries.
CREATE OR REPLACE FUNCTION auth_family_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT family_id FROM profiles WHERE id = auth.uid()
$$;

-- ── Enable RLS on all tables ─────────────────────────────────
ALTER TABLE families              ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_invites        ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_category_memory  ENABLE ROW LEVEL SECURITY;

-- ── families ─────────────────────────────────────────────────
-- Users can only see their own family.
CREATE POLICY "families_select_own"
  ON families FOR SELECT
  USING (id = auth_family_id());

-- Only admins can update the family name.
CREATE POLICY "families_update_admin"
  ON families FOR UPDATE
  USING (
    id = auth_family_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Any authenticated user can create a family (during onboarding).
CREATE POLICY "families_insert_authenticated"
  ON families FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── profiles ─────────────────────────────────────────────────
-- Users can see all profiles in their family.
CREATE POLICY "profiles_select_own_family"
  ON profiles FOR SELECT
  USING (family_id = auth_family_id() OR id = auth.uid());

-- Users can update only their own profile.
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Insert is handled by the trigger — no direct inserts allowed from client.
CREATE POLICY "profiles_insert_trigger_only"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- ── family_invites ───────────────────────────────────────────
-- Members can see invites for their family.
CREATE POLICY "invites_select_own_family"
  ON family_invites FOR SELECT
  USING (family_id = auth_family_id());

-- Only admins can create invites.
CREATE POLICY "invites_insert_admin"
  ON family_invites FOR INSERT
  WITH CHECK (
    family_id = auth_family_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can delete (revoke) invites.
CREATE POLICY "invites_delete_admin"
  ON family_invites FOR DELETE
  USING (
    family_id = auth_family_id()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Anyone with the token can update (mark as used) during onboarding.
CREATE POLICY "invites_update_use"
  ON family_invites FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- ── categories ───────────────────────────────────────────────
CREATE POLICY "categories_all_own_family"
  ON categories FOR ALL
  USING (family_id = auth_family_id())
  WITH CHECK (family_id = auth_family_id());

-- ── receipts ─────────────────────────────────────────────────
CREATE POLICY "receipts_all_own_family"
  ON receipts FOR ALL
  USING (family_id = auth_family_id())
  WITH CHECK (family_id = auth_family_id());

-- ── expense_items ────────────────────────────────────────────
CREATE POLICY "expense_items_all_own_family"
  ON expense_items FOR ALL
  USING (family_id = auth_family_id())
  WITH CHECK (family_id = auth_family_id());

-- ── income_entries ───────────────────────────────────────────
CREATE POLICY "income_all_own_family"
  ON income_entries FOR ALL
  USING (family_id = auth_family_id())
  WITH CHECK (family_id = auth_family_id());

-- ── savings_goals ────────────────────────────────────────────
-- SELECT: family members see shared goals; only creator sees private goals.
CREATE POLICY "savings_goals_select"
  ON savings_goals FOR SELECT
  USING (
    family_id = auth_family_id()
    AND (NOT is_private OR created_by = auth.uid())
  );

-- INSERT/UPDATE/DELETE: any family member can manage goals.
CREATE POLICY "savings_goals_insert"
  ON savings_goals FOR INSERT
  WITH CHECK (family_id = auth_family_id());

CREATE POLICY "savings_goals_update"
  ON savings_goals FOR UPDATE
  USING (family_id = auth_family_id());

CREATE POLICY "savings_goals_delete"
  ON savings_goals FOR DELETE
  USING (family_id = auth_family_id());

-- ── budgets ──────────────────────────────────────────────────
CREATE POLICY "budgets_all_own_family"
  ON budgets FOR ALL
  USING (family_id = auth_family_id())
  WITH CHECK (family_id = auth_family_id());

-- ── item_category_memory ─────────────────────────────────────
CREATE POLICY "item_memory_all_own_family"
  ON item_category_memory FOR ALL
  USING (family_id = auth_family_id())
  WITH CHECK (family_id = auth_family_id());
