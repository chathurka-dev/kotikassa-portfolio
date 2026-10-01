-- Link people_transactions to expense_items and income_entries.
-- ON DELETE CASCADE: deleting a people_transaction atomically removes
-- the linked expense or income record.
ALTER TABLE expense_items
  ADD COLUMN IF NOT EXISTS people_transaction_id UUID
  REFERENCES people_transactions(id) ON DELETE CASCADE;

ALTER TABLE income_entries
  ADD COLUMN IF NOT EXISTS people_transaction_id UUID
  REFERENCES people_transactions(id) ON DELETE CASCADE;

-- Index for fast lookup of linked records
CREATE INDEX IF NOT EXISTS idx_expense_items_people_txn ON expense_items(people_transaction_id) WHERE people_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_income_entries_people_txn ON income_entries(people_transaction_id) WHERE people_transaction_id IS NOT NULL;
