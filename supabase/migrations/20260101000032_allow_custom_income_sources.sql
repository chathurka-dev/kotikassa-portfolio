-- Migration 016 added family-defined income source names, but income_entries
-- still had migration 001's preset-only CHECK constraint. Keep source values
-- non-empty and bounded while allowing those family-defined names to be saved.
ALTER TABLE income_entries
  DROP CONSTRAINT IF EXISTS income_entries_source_check;

ALTER TABLE income_entries
  ADD CONSTRAINT income_entries_source_check
  CHECK (char_length(trim(source)) BETWEEN 1 AND 120);

ALTER TABLE family_income_sources
  DROP CONSTRAINT IF EXISTS family_income_sources_name_check;

ALTER TABLE family_income_sources
  ADD CONSTRAINT family_income_sources_name_check
  CHECK (char_length(trim(name)) BETWEEN 1 AND 120);
