# ADR 010 — People Tracker: Deletion via ON DELETE CASCADE

**Date:** 2026-06-28
**Status:** Accepted

## Context

The People tracker auto-creates a linked `expense_item` or `income_entry` when certain transaction types are recorded (`sent`, `lent`, `repaid_them` → expense; `received`, `they_repaid` → income). If a user deletes a `people_transaction`, the linked expense/income record must also be removed — leaving orphaned records would corrupt totals.

Options considered:
- **Application-level deletion:** delete linked records in app code before deleting the transaction (requires correct ordering; any bug leaves orphans)
- **Database CASCADE:** `ON DELETE CASCADE` FK constraint handles it automatically and atomically

## Decision

Use `ON DELETE CASCADE` on the `people_transaction_id` foreign key in both `expense_items` and `income_entries` (migration 021).

Linked records are made **read-only in the UI** (lock icon replaces edit/delete buttons in expense and income lists). Users must delete the transaction from the People page, which cascades to the linked record automatically.

## Consequences

- Deletion is atomic — no orphaned expense/income records are possible even on partial failure
- Application code does not need to manage deletion order
- Users cannot edit or delete linked expenses/income directly — this is intentional; the people_transaction is the source of truth
- The lock icon (`🔒`) in expense/income lists signals to users why editing is blocked and where to go instead
