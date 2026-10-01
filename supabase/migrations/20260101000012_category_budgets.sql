-- Migration 012: Monthly budget limits per category.
-- One row per family+category. monthly_limit applies to every month (no per-month override for now).
-- Upsert on conflict to allow easy updates from the UI.

CREATE TABLE IF NOT EXISTS category_budgets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  category_id     uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  monthly_limit   numeric(12, 2) NOT NULL CHECK (monthly_limit > 0),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (family_id, category_id)
);

-- RLS
ALTER TABLE category_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family members can manage their budgets"
  ON category_budgets
  FOR ALL
  USING (
    family_id IN (
      SELECT family_id FROM profiles WHERE id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON category_budgets TO authenticated;
