-- Enforce allowed currency codes at DB level (TypeScript guard alone is insufficient)
ALTER TABLE families ADD CONSTRAINT families_currency_check
  CHECK (currency IN ('EUR', 'USD', 'LKR', 'DKK'));
