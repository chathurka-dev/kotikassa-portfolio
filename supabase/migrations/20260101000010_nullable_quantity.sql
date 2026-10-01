-- Migration 010: Make quantity nullable on expense_items.
-- Quantity is only meaningful for receipt items (e.g. "2 kg of apples").
-- Manual expense entries (loans, transfers, bills) don't have a quantity.
ALTER TABLE expense_items
  ALTER COLUMN quantity DROP NOT NULL,
  ALTER COLUMN quantity DROP DEFAULT;
