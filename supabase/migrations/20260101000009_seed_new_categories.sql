-- Migration 009: Seed new categories (Housing, Loans & Credit, Subscriptions, Family Transfers)
-- to all existing families that don't already have a category with that name.

INSERT INTO categories (family_id, name, icon, color, sort_order)
SELECT
  f.id,
  v.name,
  v.icon,
  v.color,
  v.sort_order
FROM families f
CROSS JOIN (VALUES
  ('Housing',          '🏠', '#f97316', 8),
  ('Loans & Credit',   '💳', '#6366f1', 9),
  ('Subscriptions',    '📱', '#06b6d4', 10),
  ('Family Transfers', '👨‍👩‍👧', '#ec4899', 11)
) AS v(name, icon, color, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM categories c
  WHERE c.family_id = f.id AND c.name = v.name
);
