-- Replace the global per-category limit with one budget per category and
-- budget period. budgets.month stores the period's actual first date, so a
-- July period with budgetStartDay=15 is keyed by 2026-07-15.

WITH family_start_days AS (
  SELECT DISTINCT ON (family_id)
    family_id,
    CASE
      WHEN preferences->>'budgetStartDay' ~ '^([1-9]|1[0-9]|2[0-8])$'
        THEN (preferences->>'budgetStartDay')::integer
      ELSE 1
    END AS start_day
  FROM profiles
  WHERE family_id IS NOT NULL
  ORDER BY family_id, (role = 'admin') DESC, created_at
), current_periods AS (
  SELECT
    family_id,
    (
      date_trunc(
        'month',
        current_date - CASE
          WHEN extract(day FROM current_date) < start_day THEN interval '1 month'
          ELSE interval '0 months'
        END
      )::date + (start_day - 1)
    ) AS period_start
  FROM family_start_days
)
INSERT INTO budgets (family_id, category_id, month, amount)
SELECT
  legacy.family_id,
  legacy.category_id,
  periods.period_start,
  legacy.monthly_limit
FROM category_budgets AS legacy
JOIN current_periods AS periods USING (family_id)
ON CONFLICT (family_id, category_id, month) DO NOTHING;

COMMENT ON COLUMN budgets.month IS
  'Actual budget-period start date derived from budgetStartDay; not always the first of the calendar month.';

DROP TABLE category_budgets;
