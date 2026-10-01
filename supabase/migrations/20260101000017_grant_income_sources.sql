-- Grant missing from migration 016.
GRANT SELECT, INSERT, UPDATE, DELETE ON family_income_sources TO authenticated;

-- RLS policy for UPDATE
CREATE POLICY "family_income_sources_update" ON family_income_sources
  FOR UPDATE USING (
    family_id = (SELECT family_id FROM profiles WHERE id = auth.uid())
  );
