-- Add discount tracking fields to expense_items
-- original_price: the full price before any discount (null when no discount)
-- discount_amount: how much was saved (null when no discount)

alter table expense_items
  add column if not exists original_price  numeric(10,2),
  add column if not exists discount_amount numeric(10,2);
