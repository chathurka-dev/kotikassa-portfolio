-- Custom income sources saved per family.
-- Appears in the income form dropdown alongside presets.
CREATE TABLE family_income_sources (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  UUID        NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL CHECK (char_length(trim(name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, name)
);

ALTER TABLE family_income_sources ENABLE ROW LEVEL SECURITY;

-- Family members can read, insert, and delete their own family's sources
CREATE POLICY "family_income_sources_select" ON family_income_sources
  FOR SELECT USING (
    family_id = (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "family_income_sources_insert" ON family_income_sources
  FOR INSERT WITH CHECK (
    family_id = (SELECT family_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "family_income_sources_delete" ON family_income_sources
  FOR DELETE USING (
    family_id = (SELECT family_id FROM profiles WHERE id = auth.uid())
  );
