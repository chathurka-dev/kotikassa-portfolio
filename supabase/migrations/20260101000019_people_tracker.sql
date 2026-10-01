-- Named contacts per family (relatives, friends you send money to or exchange loans with)
CREATE TABLE people (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, name)
);

ALTER TABLE people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "people_select" ON people FOR SELECT
  USING (family_id = (SELECT family_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "people_insert" ON people FOR INSERT
  WITH CHECK (family_id = (SELECT family_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "people_update" ON people FOR UPDATE
  USING (family_id = (SELECT family_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "people_delete" ON people FOR DELETE
  USING (family_id = (SELECT family_id FROM profiles WHERE id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON people TO authenticated;

-- Individual money movements with a person
-- type:
--   sent     = you gave them money (support / gift — no expectation of return)
--   received = they gave you money (repayment or gift back)
--   lent     = you gave them a loan (they owe you)
--   borrowed = they gave you a loan (you owe them)
--
-- Running balance = received + lent - sent - borrowed
--   positive → they owe you (net)
--   negative → you've sent / owe more (net)
CREATE TABLE people_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id        UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  family_id        UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  added_by         UUID NOT NULL REFERENCES profiles(id),
  type             TEXT NOT NULL CHECK (type IN ('sent', 'received', 'lent', 'borrowed')),
  amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  note             TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE people_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pt_select" ON people_transactions FOR SELECT
  USING (family_id = (SELECT family_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "pt_insert" ON people_transactions FOR INSERT
  WITH CHECK (family_id = (SELECT family_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "pt_delete" ON people_transactions FOR DELETE
  USING (family_id = (SELECT family_id FROM profiles WHERE id = auth.uid()));

GRANT SELECT, INSERT, DELETE ON people_transactions TO authenticated;
