-- ============================================================
-- Phase 3 — Savings Contributions & Investments
-- Run this in Supabase SQL Editor after 004_storage.sql
-- ============================================================

-- ── savings_goals — add description column ────────────────────
-- (is_private and created_by already exist in 001_schema.sql)
ALTER TABLE savings_goals
  ADD COLUMN IF NOT EXISTS description text;

-- ── savings_contributions ─────────────────────────────────────
-- Each row = one manual deposit toward a savings goal

CREATE TABLE IF NOT EXISTS savings_contributions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id        uuid        NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  family_id      uuid        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  added_by       uuid        REFERENCES profiles(id),
  amount         numeric     NOT NULL CHECK (amount > 0),
  note           text,
  contributed_at date        NOT NULL DEFAULT CURRENT_DATE,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── investments ───────────────────────────────────────────────
-- Each row = one investment position (fund, stock, property, etc.)

CREATE TABLE IF NOT EXISTS investments (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id          uuid        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name               text        NOT NULL,
  description        text,
  current_value      numeric,
  current_value_date date,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ── investment_contributions ──────────────────────────────────
-- Each row = one deposit into an investment position

CREATE TABLE IF NOT EXISTS investment_contributions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id   uuid        NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  family_id       uuid        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  added_by        uuid        REFERENCES profiles(id),
  amount          numeric     NOT NULL CHECK (amount > 0),
  note            text,
  contributed_at  date        NOT NULL DEFAULT CURRENT_DATE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_savings_contributions_goal   ON savings_contributions (goal_id);
CREATE INDEX IF NOT EXISTS idx_savings_contributions_family ON savings_contributions (family_id);
CREATE INDEX IF NOT EXISTS idx_investments_family           ON investments (family_id);
CREATE INDEX IF NOT EXISTS idx_investment_contributions_inv ON investment_contributions (investment_id);
CREATE INDEX IF NOT EXISTS idx_investment_contributions_fam ON investment_contributions (family_id);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE savings_contributions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family members can manage savings contributions"
  ON savings_contributions FOR ALL
  USING  (family_id = auth_family_id())
  WITH CHECK (family_id = auth_family_id());

CREATE POLICY "family members can manage investments"
  ON investments FOR ALL
  USING  (family_id = auth_family_id())
  WITH CHECK (family_id = auth_family_id());

CREATE POLICY "family members can manage investment contributions"
  ON investment_contributions FOR ALL
  USING  (family_id = auth_family_id())
  WITH CHECK (family_id = auth_family_id());

-- ── Grants ────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON savings_contributions    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON investments              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON investment_contributions TO authenticated;
