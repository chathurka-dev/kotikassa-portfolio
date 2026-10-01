-- Migration 011: Add is_fixed flag to categories.
-- Fixed categories are non-negotiable commitments (rent, loans, utilities, subscriptions).
-- Variable categories are discretionary and the ones users can actually control.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN NOT NULL DEFAULT FALSE;

-- Tag the fixed categories by name (covers all families)
UPDATE categories
SET is_fixed = TRUE
WHERE name IN ('Housing', 'Loans & Credit', 'Utilities & Bills', 'Subscriptions');
