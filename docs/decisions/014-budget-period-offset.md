# ADR 014 — Budget Period Offset (budgetStartDay)

**Date:** 2026-07-03
**Status:** Accepted

## Context

Users whose income arrives mid-month (e.g. salary on the 15th) naturally budget from the 15th
to the 14th of the following month — not from the 1st to the 31st. The previous calendar-month
model grouped "last month's income" with "this month's expenses", making the surplus figure
meaningless for these users.

## Decision

Add a `budgetStartDay` preference (integer 1–28, default 1) to `profiles.preferences` JSONB.
No DB migration required — extends the existing ADR-007 JSONB pattern.

Shared utility functions handle the date math:
- `periodRange(monthStart, startDay)` — returns `{ from, to }` for the period
- `currentPeriodStart(startDay)` — returns the anchor month string for the current period
- `formatPeriod(monthStart, startDay, locale)` — "Jun 15 – Jul 14" label when startDay > 1
- `resolvePeriodParam(rawMonth?, startDay)` — URL param resolver, period-aware
- All four are backward-compatible: startDay=1 produces identical results to the old functions

Old functions `monthRange`, `resolveMonthParam`, `formatMonth` remain as wrappers calling the
new functions with startDay=1 — no callers broke.

Web pages (dashboard, expenses, income, budgets) read `budgetStartDay` from
`resolvePreferences(profile.preferences)` and pass it to the period functions.
Mobile screens (dashboard, expenses, income) do the same via `useAuth().profile`.
`ExpensePageClient` (week filter, post-add refetch, forward-nav arrow), `CategoryExpenseModal`
(+ its `MonthlyChart` caller), and the `/trends` page (6-period monthly buckets) also read it —
these were missed in the initial pass and defaulted to raw calendar-month math until fixed.
`getISOWeeksInRange(from, to)` generalizes `getMonthWeeks()` so the week filter can cover an
arbitrary period, not just a calendar month.

The calendar-month is still used for recurring-expense materialization (ADR-008 guard is on
`last_materialized_month` which is always a calendar month — changing this would require a
migration and is not worth the complexity). This guard must always be computed from
`currentMonthStart()`, never from the period anchor — an early implementation derived it from
the anchor month instead, which silently skipped materialization (web) or mis-dated it
(mobile) for the first `startDay - 1` days of every calendar month.

## Consequences

- Surplus and budget alert calculations now reflect the user's actual pay cycle.
- The `?month=` URL parameter continues to mean "anchor calendar month" — when startDay=15
  and `?month=2026-06`, the page shows Jun 15 – Jul 14. This is consistent and requires no
  URL format change.
- Budget alerts on the dashboard fire for the current *period*, not the current *calendar month*.
- Do not revert `periodRange` to `monthRange` (or `getISOWeeksInRange` to `getMonthWeeks`) in
  any of the surfaces above without providing an alternative for non-default startDay users.
- Recurring-expense materialization must key off `currentMonthStart()`, never off the
  currently-viewed period's anchor month — the two are only equal when `startDay <= 1` or the
  user happens to be past the period's start day within the current calendar month.
- `budgetStartDay` is clamped to 1–28 in the UI; day 29–31 is excluded to avoid month-end
  edge cases (e.g. Feb 29 does not exist in all years).
