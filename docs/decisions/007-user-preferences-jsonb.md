# ADR 007 — User Preferences: JSONB in profiles.preferences

**Date:** 2026-06-22
**Status:** Accepted

## Context

The app needs per-user UI preferences (e.g. showWeekFilter, showStoreFilter). Options:
- Dedicated boolean/text columns per preference (requires a migration per new preference)
- JSONB bag column (schema-free; new preferences need no migrations)

## Decision

Store preferences as a **JSONB column** (`profiles.preferences`, migration 007).

Preferences are resolved in application code via `resolvePreferences()` in `@kotikassa/shared`, which merges stored values with typed defaults. The `UserPreferences` interface defines all valid keys.

## Consequences

- New preference keys need no database migrations — add to the interface and `resolvePreferences()` only
- Type safety maintained via the `UserPreferences` interface
- `usePreferences` hook seeds from server props (no flash on load) and re-fetches on mount
- Current preference keys: `showWeekFilter` (default false), `showStoreFilter` (default true)
