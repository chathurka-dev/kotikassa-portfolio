# ADR-017 — Common Report Generator

**Date:** 2026-07-27
**Status:** Accepted — Phases 11.1–11.3 implemented

## Context

Kotikassa needs one reporting area for financial summaries, expense and income
analysis, category and store spending, item purchases, budget performance, and
people transactions. Separate report pages would duplicate period selection,
charts, tables, exports, loading states, and access-control logic.

Item purchasing has an additional identity problem: exact-name reports would
split OCR differences, package labels, and user corrections into separate
results. Automatically merging similar names would risk combining genuinely
different products.

Receipt data records purchases, not actual household consumption. Pantry and
inventory recording is explicitly outside this phase.

## Decision

Build `/reports` as a common generator backed by an authenticated
`POST /api/reports/run` dispatcher and a shared report response contract. Each
report handler returns summary metrics, chart series, detail columns/rows, and
row count. The client owns the common selection, period, grouping, empty-state,
table, and CSV experience while showing only filters relevant to the selected
report.

Phase 11.3 extends the same contract with an optional comparison result. The
server runs the same report and filters for the resolved previous period,
previous year, or custom range, returning comparison metrics and chart series
without duplicating comparison detail rows.

For the Item purchases handler, add family-scoped `catalog_items` and
`catalog_item_aliases`, linked from `expense_items.catalog_item_id`.

- Migration 038 backfills only exact normalized names.
- A trigger links future inserts and name edits to an exact alias, creating a
  separate canonical item for a previously unseen name.
- Similar names remain separate until a household member explicitly merges
  them through a family-validated, atomic RPC.
- Migration 039 provides the inverse operation for non-primary aliases. It
  creates a separate reporting item and moves purchases whose original name
  exactly matches that alias, or removes the alias when no purchases use it.
- Canonical display names can be renamed without rewriting historical expense
  names.
- The report API derives the family from the authenticated session, accepts a
  maximum three-year range, caps source queries at 5,000 rows, and limits detail
  responses to 500 rows.
- Quantities normalize within dimensions (`g → kg`, `ml` and `cl → l`).
  Incompatible or unknown units remain separate.
- The UI describes the metric as purchased quantity and does not infer
  consumption.

## Report experience

`/reports` provides week, current budget period, 3/6/12-period and custom ranges
with previous/next navigation; daily/weekly/monthly zero-filled chart buckets;
report-specific filters; summary metrics; detail tables; and CSV export.

Comparison settings are bookmarkable. Metric cards show the comparison value
and relative change, while percentage metrics use percentage-point change.
Matching chart series are aligned using explicit day/week/month positions rather
than displaying comparison values under primary-period dates. Exact range
legends, neutral comparison styling, dual-date difference tooltips, and a
plain-language summary make that alignment visible. Details and CSV remain
scoped to the primary period.

The Item purchases report also exposes reporting-name rename, explicit merge,
and confirmed separation controls. `/reports/items` remains only as a redirect
to that report type.

## Consequences

- Common presentation and response contracts avoid duplicating report UI while
  report-specific handlers keep business calculations isolated and testable.
- Comparison queries run only when requested and execute alongside the primary
  query. This approximately doubles database work for a compared report but
  adds no cost when comparison is disabled.
- Reports remain explainable: each historical expense keeps its original name,
  while the canonical link controls grouping.
- Exact automatic grouping is conservative and may initially show more items
  than a fuzzy auto-merge approach.
- Explicit merge management adds a small amount of user work but prevents
  silent data corruption, while separation makes accidental choices reversible
  without rewriting or deleting expense history.
- The API aggregates bounded source rows in the application layer. If household
  histories approach the cap, move aggregation into report-specific PostgreSQL
  RPCs while keeping the response contract.
- CSV is included now. Styled Excel and PDF exports remain planned.
- A future pantry system can reuse `catalog_item_id`, but it must add a separate
  inventory movement ledger rather than reinterpret purchases as consumption.
