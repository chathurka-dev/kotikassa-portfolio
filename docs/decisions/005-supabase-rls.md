# ADR 005 — Multi-tenancy: Supabase + PostgreSQL RLS

**Date:** 2026-06-16
**Status:** Accepted

## Context

The app serves multiple families, each with their own private data. Multi-tenancy must be enforced at the data layer, not just application code.

## Decision

Use **Supabase (PostgreSQL)** with **Row Level Security (RLS)** policies. Every table includes a `family_id` column. RLS policies ensure each authenticated user can only access rows belonging to their family.

## Consequences

- Data isolation is enforced at the database level — even a bug in application code cannot leak one family's data to another
- Free tier sufficient for a single-family app (EUR 0/month)
- Real-time subscriptions, Auth, and Storage are all included in Supabase
- All new tables **must** have RLS enabled and a policy covering `family_id`
