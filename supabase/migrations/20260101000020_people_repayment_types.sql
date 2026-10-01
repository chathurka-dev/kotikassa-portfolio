-- Add repayment transaction types to people_transactions.
-- repaid_them  = you paid back money you borrowed (your debt decreases, balance +)
-- they_repaid  = they paid back money you lent (their debt decreases, balance -)
ALTER TABLE people_transactions
  DROP CONSTRAINT IF EXISTS people_transactions_type_check;

ALTER TABLE people_transactions
  ADD CONSTRAINT people_transactions_type_check
  CHECK (type IN ('sent', 'received', 'lent', 'borrowed', 'repaid_them', 'they_repaid'));
