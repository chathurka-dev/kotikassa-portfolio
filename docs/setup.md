# Setup Guide

How to run Kotikassa locally and apply all database migrations.

---

## Prerequisites

- Node.js >= 18
- A [Supabase](https://supabase.com) project (free tier works)
- A Vercel account (optional — only needed for deployment)

---

## 1. Install dependencies

```bash
git clone <repo-url>
cd kotikassa
npm install
```

---

## 2. Configure environment

Create `apps/web/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Sentry browser error reporting + production source maps
NEXT_PUBLIC_SENTRY_DSN=https://your-public-dsn@o0.ingest.sentry.io/0
SENTRY_AUTH_TOKEN=your-sentry-auth-token
SENTRY_ORG=your-sentry-organization-slug
SENTRY_PROJECT=your-sentry-project-slug

# Phase 9 — GPT Vision receipt scanning (/api/scan)
OPENAI_API_KEY=sk-your-key
OPENAI_RECEIPT_MODEL=gpt-4o-mini
```

Supabase values are in your project → **Settings → API**. `OPENAI_API_KEY`
comes from platform.openai.com; set both OpenAI vars in Vercel project
settings too. `OPENAI_RECEIPT_MODEL` swaps the vision model without a code
change. See `.env.example` for the full annotated list (incl. the mobile
`EXPO_PUBLIC_WEB_API_URL`).

`SUPABASE_SERVICE_ROLE_KEY` is server-side only. Never add a `NEXT_PUBLIC_`
prefix, expose it in browser code, print it, or commit a real value. The local
training exporter and existing administrative account-deletion flow require it.

---

## 3. Run database migrations

All migrations live in `supabase/migrations/`. Run them in the **Supabase SQL Editor** in the order listed below. All migrations through **042** must be applied before starting the app.

### Phase 1 — Foundation

Run in order:

| File                           | What it creates                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `001_families_profiles.sql`    | `families`, `profiles` tables + RLS                                                 |
| `002_categories.sql`           | `categories` table + RLS                                                            |
| `003_expenses_income.sql`      | `expense_items`, `income_entries`, `savings_goals`, `investments`, `receipts` + RLS |
| `004_storage.sql`              | Supabase Storage private bucket (`receipts`) + RLS policies                         |
| `005_item_category_memory.sql` | `item_category_memory` table + RLS                                                  |

**After these migrations:** sign up, create your family, then go to **Settings → Categories** to seed the default categories (Groceries, Snacks, Clothing, etc.).

### Phase 3b — Expense Enhancements

| File                       | What it adds                                                    |
| -------------------------- | --------------------------------------------------------------- |
| `006_discount_fields.sql`  | `discount_amount` + `original_price` columns on `expense_items` |
| `007_user_preferences.sql` | `preferences JSONB DEFAULT '{}'` on `profiles`                  |

### Phase 3a — Income, Savings & Investments

| File             | What it adds                                                                    |
| ---------------- | ------------------------------------------------------------------------------- |
| `005_phase3.sql` | Savings goals, savings contributions, investments, and investment contributions |

### Phase 3c — Savings Withdrawals & Recovery Plans

| File                                   | What it adds                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `036_savings_withdrawals_recovery.sql` | Deposit/withdrawal ledger, recovery plans, private-goal-aware access, and atomic savings transaction RPCs |

### Phase 4 — Recurring Expenses

| File                         | What it adds                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `008_recurring_expenses.sql` | `recurring_expenses` table + `recurring_expense_id` FK on `expense_items` (ON DELETE SET NULL) |

### Phase 5 — Category Budgets

| File                             | What it adds                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `011_is_fixed.sql`               | `is_fixed BOOLEAN DEFAULT false` on `categories`                                                                                         |
| `012_category_budgets.sql`       | Legacy global category-limit table (removed by migration 034)                                                                            |
| `034_monthly_period_budgets.sql` | Migrates active limits to period-specific `budgets` rows keyed by the actual configured period start date, then removes the legacy table |

**After 011:** update your existing categories in **Settings → Categories** to mark the following as fixed: Housing, Loans & Credit, Utilities & Bills, Subscriptions.

### Phase 1 — Family Invite and Query Support

| File                       | What it adds                                                   |
| -------------------------- | -------------------------------------------------------------- |
| `013_indexes.sql`          | DB indexes on hot query paths                                  |
| `014_invite_functions.sql` | `preview_invite()` + `use_invite()` SECURITY DEFINER functions |

### Phase 7 — People Tracker

Run **in order** — each depends on the previous:

| File                      | What it adds                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `019_people.sql`          | `people` + `people_transactions` tables + RLS + GRANTs                               |
| `020_repayment_types.sql` | Adds `repaid_them`, `they_repaid` to the type CHECK constraint                       |
| `021_people_fk.sql`       | `people_transaction_id` FK on `expense_items` + `income_entries` (ON DELETE CASCADE) |

### Phase 8 — Family Currency

| File                      | What it adds                                         |
| ------------------------- | ---------------------------------------------------- |
| `022_family_currency.sql` | `currency TEXT NOT NULL DEFAULT 'EUR'` on `families` |

**After 022:** go to **Settings → Family** (admin only) and set your preferred currency.

### Cross-phase schema and feature migrations

| File                                                | What it adds                                                                                                                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `023_family_currency_check.sql`                     | DB-level `CHECK` constraint on `families.currency` (allowed ISO codes)                                                                                                                             |
| `024_ocr_memory_normalize_names.sql`                | Strips weight suffixes from `item_category_memory` keys                                                                                                                                            |
| `025_ocr_corrections.sql`                           | `ocr_corrections` table — captures OCR/model output vs user-corrected item values for accuracy analysis                                                                                            |
| `026_ocr_receipt_corrections.sql`                   | `ocr_receipt_corrections` table — captures OCR vs user-corrected store name and date                                                                                                               |
| `027_gpt_scan_metadata.sql`                         | Phase 9: scan telemetry columns on `receipts`; `is_on_receipt` + `receipt_line_index` on `expense_items` (+ backfill); `scan_rate_limits` table + `consume_scan_quota()` SECURITY DEFINER function |
| `028_privacy_choices.sql`                           | Versioned Privacy Notice acknowledgment and optional receipt-scanning consent, including server-timestamped choice updates                                                                         |
| `029_training_export_grants.sql`                    | Read-only `service_role` grants on `receipts` and `expense_items` for the local administrative dataset exporter                                                                                    |
| `030_receipt_training_consent.sql`                  | Versioned receipt-model-development choice, receipt-level consent snapshots, withdrawal RPC and consent-aware export access                                                                        |
| `031_receipt_training_prompt_schedule.sql`          | Audited receipt-model prompt views and the limited eligible-scan 1/5/20 follow-up schedule                                                                                                         |
| `032_allow_custom_income_sources.sql`               | Allows user-defined income source labels while retaining the built-in source values                                                                                                                |
| `033_reconcile_receipt_image.sql`                   | Atomically attaches a recovered receipt image and applies selected item corrections and additions                                                                                                  |
| `034_monthly_period_budgets.sql`                    | Replaces global category limits with period-specific family budgets                                                                                                                                |
| `035_reconcile_receipt_deletions.sql`               | Adds explicit existing-item removal to atomic missing-image receipt reconciliation                                                                                                                 |
| `036_savings_withdrawals_recovery.sql`              | Adds savings withdrawals, recovery plans, and atomic ledger RPCs                                                                                                                                   |
| `037_sync_item_category_memory.sql`                 | Synchronizes category memory after expense inserts and name/category corrections                                                                                                                   |
| `038_item_usage_reports.sql`                        | Adds canonical household items and aliases, backfills exact names, links expense rows automatically, and provides family-scoped rename/merge RPCs for the Item purchases report                    |
| `039_separate_catalog_alias.sql`                    | Safely reverses a mistaken reporting-name merge by separating an alias and reassigning its exact-name historical purchases                                                                         |
| `040_delete_receipt.sql`                            | Atomically deletes a family receipt and its ordinary linked expenses while refusing People-linked rows; returns the private image path for post-commit cleanup                                     |
| `041_scan_feedback_foundation.sql`                  | Adds versioned, idempotent receipt-review feedback events plus a validated family-safe RPC for correction-intelligence provenance                                                                  |
| `042_household_correction_memory.sql`               | Adds household correction memory, feedback completion, category confidence, historical backfill, and private consent-filtered global candidate aggregation                                         |
| `043_explainable_correction_suggestions.sql`        | Adds the authenticated household-first suggestion projection and a daily privacy-safe exploration budget for one-household global candidates                                                       |
| `044_scan_quality_detection.sql`                    | Adds deterministic scan-risk outcomes, private household price context, service-role quality monitoring, and quality gates for global correction evidence                                          |
| `045_safe_automatic_corrections.sql`                | Adds fixed-holdout automation evaluations, strict household/global alias eligibility, a minimal authenticated recommendation projection, and private outcome monitoring                            |
| `046_deterministic_automation_evaluation_order.sql` | Adds monotonic evaluation ordering so the newest automation result wins even when evaluations share a transaction timestamp                                                                        |

After migration 038, open **Reports** and select **Item purchases**. Existing
expense names are grouped only when their normalized names match exactly. Use
**Manage names** to combine spelling or product-name variants that genuinely
represent the same item. Migration 039 adds the corresponding separation action
for mistakes. This report measures purchased quantity, not consumption.

After migration 028, existing users review the Privacy Notice once on their next authenticated app visit. The app records corrections automatically when users edit items on the receipt review screen.

### Analyse historical receipt corrections

Milestone 1 of Phase 9.1 provides a family-scoped, read-only baseline analyser.
Run it from the repository root with the household UUID from the `families`
table:

```powershell
npm run scan:analyze -- --family-id "YOUR_FAMILY_UUID"
```

The command loads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
from `apps/web/.env.local`, performs only `SELECT` queries, and prints aggregate
JSON to standard output. It never downloads receipt images, calls OpenAI, or
changes receipt, expense, correction, or consent data.

To create a report file, provide a new path. Existing files are never
overwritten:

```powershell
npm run scan:analyze -- --family-id "YOUR_FAMILY_UUID" --output "scan-baseline.json"
```

Use `--limit` for a smaller oldest-first diagnostic sample. A limited run also
limits correction evidence to the selected receipts. Monetary estimates are
included only when both current provider rates are supplied explicitly:

```powershell
npm run scan:analyze -- --family-id "YOUR_FAMILY_UUID" `
  --input-cost-per-million "INPUT_RATE" `
  --output-cost-per-million "OUTPUT_RATE" `
  --cost-currency "USD"
```

Accuracy metrics use only complete receipts whose final items can be matched
deterministically through receipt line indexes. Partial evidence remains visible
in coverage counts but cannot distort the baseline or drive future automation.
Conflicting corrections are counted separately. `reviewSignals` distinguishes
receipts with an explicit correction from receipts with no explicit correction;
the latter are unknown, not confirmed-correct scans. `evidence.independence`
distinguishes one-off patterns, patterns repeated by one contributor, and patterns
supported by multiple contributors. Repetition by one person can support private
memory or a low-confidence future experiment, but it is not independent global
agreement. The report also lists the legacy feedback fields the current schema
does not capture. Run the command with `--help` for the full option list.

### Build correction memory

Migration 042 is required. Preview one household's reliable historical
item/store correction candidates without writing anything:

```powershell
npm run scan:memory -- --family-id "YOUR_FAMILY_UUID"
```

Review the JSON counts, then apply the same deterministic backfill explicitly:

```powershell
npm run scan:memory -- --family-id "YOUR_FAMILY_UUID" --apply
```

Both commands are idempotent. The backfill excludes receipts already represented
by versioned feedback events, so legacy and live support are not double-counted.

To rebuild the private global candidate projection from currently consent-eligible
feedback only:

```powershell
npm run scan:memory -- --refresh-global
```

This command is administrative. It does not grant client access to global
candidates. It caps each contributor at three effective supporting receipts,
retains disagreement and diversity counts, and classifies evidence as observed,
exploratory, or independently supported. Migration 043 exposes only a minimal
authenticated suggestion projection: household memory ranks first, independent
global patterns may be suggested to new households, and one-household patterns
are limited to a stable 20% exploration cohort and three offers per household
per day. Runtime responses never include household identities, contributor
counts, raw feedback, or receipt evidence.

Migration 044 adds advisory scan-quality detection without another OpenAI
request. It checks the validated scan deterministically and may compare it with
an authenticated aggregate of the current household's own price history.
Warning outcomes and review duration are stored with the receipt. Service-role
monitoring views expose aggregate quality and candidate performance only to
administrative tooling. The baseline analyser's `qualitySignals` compares
assessed receipts with the pre-Milestone-4 correction baseline. Apply the
migration through the normal migration workflow; no database reset is required.

### Activate measured automatic corrections

Migration 045 leaves learned automation disabled by default. After evaluating an
immutable fixed holdout set, record its measured result from the repository root:

```powershell
npm run scan:automation:evaluate -- `
  --scope household `
  --kind item_name `
  --holdout-version "item-name-2026-09" `
  --dataset-sha256 "64_CHARACTER_LOWERCASE_SHA256" `
  --sample-size 50 `
  --correct-count 49
```

The database, rather than the command, decides whether the result passes.
Household aliases require at least 50 holdout cases and 98% precision; global
aliases require at least 100 cases and 99.5% precision. Record separate results
for `item_name` and `store_name`. Results expire after 180 days by default
(`--valid-days` accepts 1–365), and the latest result controls eligibility, so a
new failing evaluation immediately disables that scope/field combination.

Passing evaluation is necessary but not sufficient. Runtime automation also
requires strong recent evidence with no conflict, rejection, or undo. Global
aliases require independent support from at least three contributors and three
households. Only names are changed; prices, quantities, units, discounts, item
presence, deletion, and ambiguous dates remain manual. The review screen labels
every automatic correction and provides immediate undo. The service-role-only
`correction_automation_monitoring` view reports application and undo rates by
policy, model, and prompt version. Run the command with `--help` for all options.

### Test the owner-only training export

Run from the repository root after migration 029:

```powershell
npm run training:export -- "YOUR_USER_UUID"
```

The export command requires Node.js 20.6 or newer because it loads
`apps/web/.env.local` through Node's `--env-file` option.

The UUID is the uploader's ID from **Supabase → Authentication → Users**. The
command exports only that uploader's confirmed Phase 9 receipts and writes
private JPEGs plus canonical JSONL files under the Git-ignored `training-data/`
directory. This is an owner-controlled development/export test only. Multi-user
training export must use the consent-aware mode below.

After migration 030 and the Phase 10 UI deployment, export all currently
consented receipts with:

```powershell
npm run training:export -- consented-users
```

The command requires both a current unwithdrawn user choice and a matching
receipt-level consent snapshot. Explicit UUID export remains an owner-controlled
diagnostic path and must not be used to bypass another user's choice.

Migration 031 is required before deploying the matching scanner UI. It records a
maximum of three prompt views after eligible scans 1, 5 and 20. **Not now** allows
the next scheduled prompt; an explicit withdrawal prevents further prompts. The
Privacy control remains available after the first prompt is shown.

---

## 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 5. Run automated tests

Run from the repository root:

```powershell
npm test
npm run test:unit
npm run test:coverage
npm run test:db
npm run test:e2e
npm run test:ci
npm run build:ci
```

Use `npm run test:watch` while developing. Vitest runs separate web and shared
projects; route tests cover report and receipt-scan API contracts, while React
component tests use jsdom and Testing Library. MSW fails unexpected network
requests and the OpenAI SDK is mocked in scan-route tests, so normal tests
remain deterministic and never call the provider. English and Finnish report
behaviour uses the real locale messages. Coverage HTML is generated under the
ignored `coverage/` directory.

Database tests require Docker Desktop and the local Supabase stack:

```powershell
supabase start
npm run test:db
```

The pgTAP files under `supabase/tests/` use fixed test identifiers inside
transactions and roll back their fixtures. To verify a completely clean
migration replay before running all database assertions:

```powershell
npm run test:db:reset
```

This resets only the local Supabase database.

Playwright E2E tests require Docker Desktop and a Chromium browser installed by
Playwright. Install the browser once, then use the default clean-state command:

```powershell
npx playwright install chromium
npm run test:e2e
```

`npm run test:e2e` starts local Supabase when needed, refuses non-loopback
Supabase hosts, resets and migrates the local database, creates an isolated E2E
household, starts the web app on port 3100, and runs critical workflows plus
desktop/mobile accessibility smoke checks. For quicker repeat runs after a
successful reset, use `npm run test:e2e:no-reset`. Use `npm run test:e2e:ui` for
interactive debugging. Failure artifacts are ignored under
`apps/e2e/test-results/` and `apps/e2e/playwright-report/`.

`npm run test:ci` runs the shared, web, and E2E TypeScript checks, web lint, and
thresholded unit/component coverage. `npm run build:ci` requires Docker and uses
the same loopback-only Supabase environment reader as E2E; it starts local
Supabase when needed and builds the production web app without remote data.

GitHub Actions runs three jobs on pushes, pull requests, and manual dispatch:

- **Quality and coverage** runs type checks, lint, and thresholded coverage.
- **Database migrations, pgTAP, and build** replays migrations, runs database
  assertions, and builds the web app against local Supabase.
- **Critical browser workflows** installs Chromium and runs Playwright against
  another isolated local Supabase stack.

Coverage HTML/LCOV and Playwright HTML reports are retained for 14 days. Failed
browser runs also retain traces, screenshots, videos, and error context. Normal
CI sets `OPENAI_API_KEY` to an empty value and receives no production Supabase
credentials. Real receipt-quality evaluation is not implemented in normal CI;
when the Phase 9 evaluation harness exists, it must be a separate manually
dispatched workflow with reviewed consented evaluation data.

---

## 6. Deployment (Vercel)

1. Push the repo to GitHub (private repo is fine)
2. Import into [Vercel](https://vercel.com) → Framework: Next.js → Root directory: `apps/web`
3. Add the same env vars as `.env.local`
4. Vercel auto-deploys on every push to `main`

---

## Pre-commit hook

A pre-commit hook (Husky) rejects `.tsx`/`.ts` files not ending with a newline. This is set up automatically on `npm install`. It guards against a Windows NTFS truncation bug. See [ADR 011](decisions/011-precommit-newline-guard.md).

---

## Mobile app (apps/mobile)

React Native + Expo (SDK 57). Same Supabase project as the web app.

```bash
npm install                      # from repo root (workspaces)
cd apps/mobile
cp .env.example .env             # fill with the SAME values as apps/web .env.local
                                 # (NEXT_PUBLIC_SUPABASE_URL -> EXPO_PUBLIC_SUPABASE_URL, etc.)
npm run dev                      # starts Expo dev server
```

Then scan the QR code with the **Expo Go** app on your phone
(App Store / Play Store). The phone and computer must be on the same network.

Notes:

- No new database migrations — mobile uses the existing schema.
- Import shared code from `@kotikassa/shared/native` (NOT the package root —
  the root entry pulls in the Next.js-only Supabase server client, which Metro
  cannot bundle). See ADR-013.
- Receipt scanning, Google OAuth, push notifications: not yet on mobile.
