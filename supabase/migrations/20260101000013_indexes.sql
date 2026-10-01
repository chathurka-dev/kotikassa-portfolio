-- Migration 013: indexes on hot query paths
-- Every page filters expense_items by (family_id, expense_date); categories by family_id;
-- savings/investments/recurring by family_id. These composite indexes cover all page fetches.

-- expense_items: family + date range (dashboard, expenses, budgets)
create index if not exists idx_expense_items_family_date
  on expense_items (family_id, expense_date desc);

-- expense_items: family + category (budget alerts, category counts)
create index if not exists idx_expense_items_family_category
  on expense_items (family_id, category_id);

-- categories: family (all category lookups)
create index if not exists idx_categories_family
  on categories (family_id, sort_order);

-- category_budgets: family (budget page, dashboard alerts)
create index if not exists idx_category_budgets_family
  on category_budgets (family_id);

-- income_entries: family + date (dashboard, income page)
create index if not exists idx_income_entries_family_date
  on income_entries (family_id, income_date desc);

-- savings_goals: family (savings page, dashboard net worth)
create index if not exists idx_savings_goals_family
  on savings_goals (family_id);

-- savings_contributions: family + date (dashboard this-month total)
create index if not exists idx_savings_contributions_family_date
  on savings_contributions (family_id, contributed_at desc);

-- investments: family (investments page, dashboard net worth)
create index if not exists idx_investments_family
  on investments (family_id);

-- investment_contributions: family + date (dashboard this-month total)
create index if not exists idx_investment_contributions_family_date
  on investment_contributions (family_id, contributed_at desc);

-- recurring_expenses: family + active (materialization check on every current-month load)
create index if not exists idx_recurring_expenses_family_active
  on recurring_expenses (family_id, active);
