-- Add user preferences JSONB column to profiles.
-- Stores per-user UI preferences; defaults to empty object (resolved to defaults in app code).
-- This column is intentionally JSONB so new preference keys can be added without migrations.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Index is not needed (single-row lookups by PK), but ensure RLS allows self-reads/writes.
-- Existing RLS policy on profiles covers SELECT/UPDATE for own row, so no new policies needed.
