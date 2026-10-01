# ADR 009 — Family Currency: Stored in families.currency

**Date:** 2026-06-28
**Status:** Accepted

## Context

The app needs to support multiple currencies (EUR, USD, LKR, DKK) since families may be based in different countries. Currency must be consistent across all amount displays without prop-drilling through every component.

## Decision

- Store the currency in **`families.currency TEXT NOT NULL DEFAULT 'EUR'`** (migration 022)
- Expose it app-wide via **`CurrencyContext`** + **`CurrencyProvider`** in `apps/web/lib/currency-context.tsx`
- Wrap all dashboard children in `CurrencyProvider` (currency fetched server-side in the layout)
- All client components call `useFormatCurrency()` hook; server components call `formatCurrency(amount, currency)` directly from `@kotikassa/shared`

## Consequences

- No prop-drilling of currency through component trees
- Changing the family currency in Settings instantly reflects everywhere
- `SUPPORTED_CURRENCIES` constant in `@kotikassa/shared` is the single source of truth for valid values
- All new amount displays must use `useFormatCurrency()` (client) or `formatCurrency()` (server) — never hardcode "EUR" or a euro symbol
