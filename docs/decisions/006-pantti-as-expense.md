# ADR 006 — PANTTI Bottle Deposits: Treat as Regular Expense

**Date:** 2026-06-16
**Status:** Accepted

## Context

Finnish grocery receipts include PANTTI (bottle deposit) charges. These could be treated specially — excluded from totals, tracked as a recoverable deposit — or as regular expenses.

## Decision

Treat PANTTI as a **regular expense item** with no special handling.

## Consequences

- Simpler UX — no "deposit" UI concept or recovery tracking needed
- Totals include bottle deposits, which is accurate to what the user actually paid
- User preference confirmed: they do not want to exclude or specially track PANTTI
