# ADR 008 — Recurring Expenses: On-Load Materialization

**Date:** 2026-06-22
**Status:** Accepted

## Context

Recurring expenses (rent, loans, subscriptions) need to appear as expense items each month automatically. Options:
- **Cron job / Edge Function:** Runs on a schedule, creates items in the background
- **On-load materialization:** The expenses page checks `last_materialized_month` on navigation and creates missing entries for the current month

## Decision

Use **on-load materialization** in `expenses/page.tsx`.

On each page load, the server checks if `recurring_expenses.last_materialized_month` equals the current month. If not, it creates expense items for all active templates and updates the column.

## Consequences

- Simpler than an Edge Function cron — no additional infrastructure
- Items appear instantly when the user navigates to the expenses page for a new month
- `last_materialized_month` (format: `YYYY-MM`) prevents double-inserts
- If the user never visits the expenses page in a given month, items for that month are not created — acceptable for a personal finance app used regularly
