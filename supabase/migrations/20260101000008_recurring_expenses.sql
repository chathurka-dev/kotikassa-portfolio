-- Recurring expense templates.
-- Instances are materialized into expense_items on the expenses page load for the current month.

CREATE TABLE recurring_expenses (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id               uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  created_by              uuid NOT NULL REFERENCES profiles(id),
  name                    text NOT NULL,
  amount                  numeric(10,2) NOT NULL CHECK (amount >= 0),
  category_id             uuid REFERENCES categories(id) ON DELETE SET NULL,
  recurrence_type         text NOT NULL DEFAULT 'monthly'
                            CHECK (recurrence_type IN ('monthly', 'yearly')),
  day_of_month            int CHECK (day_of_month BETWEEN 1 AND 28),
  active                  boolean NOT NULL DEFAULT true,
  notes                   text,
  last_materialized_month text,  -- 'YYYY-MM'; NULL = never materialized
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family can read recurring_expenses"
  ON recurring_expenses FOR SELECT
  USING (family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "family can insert recurring_expenses"
  ON recurring_expenses FOR INSERT
  WITH CHECK (family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "family can update recurring_expenses"
  ON recurring_expenses FOR UPDATE
  USING (family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "family can delete recurring_expenses"
  ON recurring_expenses FOR DELETE
  USING (family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid()));

-- Grant access to authenticated users (must be explicit per table).
GRANT SELECT, INSERT, UPDATE, DELETE ON recurring_expenses TO authenticated;

-- Link expense_items back to the template that created them.
-- ON DELETE SET NULL: deleting a template keeps past expense history intact.
ALTER TABLE expense_items
  ADD COLUMN IF NOT EXISTS recurring_expense_id uuid
    REFERENCES recurring_expenses(id) ON DELETE SET NULL;
