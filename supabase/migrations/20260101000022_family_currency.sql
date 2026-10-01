-- Add currency preference to families table
-- Defaults to EUR; supported: EUR, USD, LKR, DKK
ALTER TABLE families ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR';
