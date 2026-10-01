# Changelog

All notable changes to Kotikassa are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added

- **Phase 9.1 Milestone 5 — Safe Automatic Corrections**: migration 045 adds
  service-role-only, versioned fixed-holdout evaluations and keeps learned
  automation disabled until the latest scope/field result passes its sample-size,
  precision, and expiry gates. Receipt review can automatically apply only
  reversible item/store aliases that also pass strict evidence, recency,
  disagreement, rejection, and undo checks; every application remains visible,
  explained, and immediately reversible. Global aliases additionally require
  independent contributor/household/day support and the stricter global holdout.
  Financial values, ambiguous dates/quantities/units, missing rows, and deletions
  remain review-only. A service-role command records evaluated holdouts, a private
  monitoring view tracks automatic outcomes, and unit, component, pgTAP, and
  Playwright coverage protect the policy and workflow.
- **Phase 9.1 Milestone 4 — Scan Quality Detection**: deterministic risk scoring
  now checks missing fields, dates, receipt-total reconciliation, duplicate or
  non-product rows, quantity arithmetic, and robust household price history.
  Review shows warnings only beside affected fields, records explicit corrected,
  dismissed, and unresolved outcomes plus review duration, and never changes an
  uncertain financial value automatically. Migration 044 adds private household
  price aggregates, service-role monitoring by store/model/prompt, low-review and
  contributor-bias signals, and excludes low-quality reviews from global candidate
  confidence while retaining the existing per-contributor cap. Unit, component,
  API, analyzer, pgTAP, and Playwright coverage protect the workflow.

- **Phase 9.1 Milestone 3 — Explainable Correction Suggestions**: migration 043
  adds a family-authenticated, minimal suggestion projection that ranks private
  household memory before consent-governed global aggregates without exposing
  cross-household feedback or evidence counts. Receipt review now explains each
  item/store suggestion, applies only the named field on explicit choice, offers
  immediate undo/dismiss/restore actions, and records offered, accepted,
  rejected, and undone outcomes without double-counting ordinary edits.
  Independently supported global patterns can help new households immediately;
  one-household exploratory patterns require quality gates, a stable 20% cohort,
  and a maximum of three offers per household per day. Unit, component, pgTAP,
  and Playwright coverage protect ranking, provenance, privacy, and interaction.
- **Phase 9.1 Milestone 2 — Household Correction Memory**: migration 042
  adds family-isolated item/store correction memory, rebuildable evidence links,
  bounded confidence, rejection/undo/disagreement counters, detectable receipt
  feedback completion, and meaningful category-memory confidence. Receipt saves
  mark feedback as expected, retry the idempotent RPC, and atomically project
  newly recorded events into memory. A dry-run-first administrative command can
  backfill reliable legacy corrections or explicitly rebuild a service-role-only,
  consent-filtered global candidate table with capped contributor influence and
  independent receipt/user/household statistics.
- **Phase 9.1 Milestone 1 — Historical Correction Audit and Baseline**:
  a family-scoped, read-only scan analyser now compares original validated model
  results with confirmed receipt items and stored item/receipt corrections. It
  classifies complete, partial, conflicting, and unusable evidence; reports
  matching coverage, recall, false-item rate, field corrections and accuracy,
  latency, tokens, and optionally cost by model, prompt, and store. The root
  command requires an explicit household UUID, performs only `SELECT` queries,
  and can print JSON or safely create a non-overwriting report file. The baseline
  now also separates explicit corrections from unverified unchanged saves and
  distinguishes repeated evidence from one contributor from independent
  multi-contributor support. The existing six milestones now carry a
  consent-governed global intelligence path for first-scan suggestions without
  exposing household correction data or promoting one user's repetition as
  global truth. Migration 041 and ADR-018 add the durable foundation: validated,
  idempotent review events retain actor and model provenance, distinguish
  `save_only` from explicit confirmation, reject cross-household writes, and are
  removed with their source receipt.
- **Automated Testing Milestone 5**: GitHub Actions now runs parallel quality,
  database/build, and browser jobs on pushes, pull requests, and manual runs.
  CI enforces measured global and business-critical coverage floors, replays all
  migrations before pgTAP, builds against local Supabase, runs the isolated
  Playwright suite, and uploads coverage plus browser reports and failure
  artifacts. Normal CI receives no production credentials or OpenAI API key;
  real receipt-quality evaluation remains a separate future manual Phase 9/10
  workflow after its evaluation harness exists.
- **Automated Testing Milestone 4**: a dedicated Playwright workspace now
  exercises isolated local expense, budget, reporting, reporting-name, savings,
  people, and receipt workflows. Desktop and mobile smoke tests include critical
  axe accessibility and viewport-overflow checks. The default E2E command safely
  starts local Supabase when needed, rejects remote hosts, resets all migrations,
  seeds an authenticated household, starts the web app, and retains failure
  traces, screenshots, videos, and an HTML report.
- **Automated Testing Milestone 3**: route-level contract tests now cover report
  generation, reporting-name updates, and receipt scanning across authentication,
  validation, household scoping, consent, rate limiting, storage/provider errors,
  and validated scan output. OpenAI is replaced by a local mock in normal tests,
  and report component tests cover filters, contextual help, loading, empty and
  error states, the reporting-name dialog, and important English/Finnish copy.
- **Automated Testing Milestone 2**: five transactional pgTAP suites now provide
  49 assertions for migration structure, grants, constraints, RLS and family
  isolation, private records, savings/people/budget integrity, catalog RPCs,
  consent handling, and receipt reconciliation. Root commands support normal
  database tests and clean migration-replay verification.
- **Automated Testing Milestone 1**: Vitest 3 now runs web and shared-package
  projects through Turborepo, with TypeScript reporting tests, shared unit
  coverage, React Testing Library/jsdom component support, MSW network
  isolation, V8 coverage reports, and consistent unit/watch/coverage/CI scripts.

### Fixed

- Automation evaluations now use monotonic insertion order when selecting the
  latest policy result, avoiding timestamp ties when failed and passing holdout
  evaluations are recorded in the same transaction. Database tests now inspect
  private fixtures with the correct privileged role while preserving runtime
  table and function restrictions.
- Receipt scans now ask the provider to transcribe Finnish `D.M.YYYY` dates
  verbatim and normalize them deterministically in application code, preventing
  single-digit dates such as `2.8.2026` from becoming `2026-02-08`. Receipt
  deletion now uses an authenticated atomic RPC so linked ordinary expenses
  cannot be partially removed; People-linked rows remain protected and private
  image cleanup runs only after the database transaction commits.
- Updated all GitHub Actions jobs to Node.js 24 so the Supabase client has the
  native WebSocket implementation required during Playwright global setup.
- Corrected local-versus-UTC date validation for manual expenses, connected
  report and People form labels to their controls, named the reporting-name
  dialog and close action, and restored missing English/Finnish action and
  People category translations found by the E2E suite.
- **Phase 11.3 — period comparison**: every report can now compare its
  selected range with the previous period, previous year, or a custom range
  using the same filters. Summary cards show comparison values and changes,
  while charts use clear day/week/month positions, exact range legends, neutral
  comparison bars, dual-date difference tooltips, and plain-language summaries.
  Comparison settings are validated and stored in the bookmarkable report URL.
- **Phase 11.2 — reporting foundation and usability**: report type, period, exact
  range, interval, and relevant filters are now validated and reflected in a
  bookmarkable URL. Active filters are summarized with a one-click reset, and
  focused tests cover date rules, empty buckets, budget allocation, quantity
  normalization, and CSV formula protection.
- **Phase 11.1 — common report generator**: `/reports` now builds
  financial summaries, expense details, income-vs-expense comparisons, category
  and store spending, item purchases, budget performance, and people-transaction
  reports. A shared period navigator, report-specific filters, daily/weekly/monthly
  charts, summary metrics, detail tables, empty states, and safe CSV export are
  available across the generator.
- **Canonical item support for reports**: migration 038 adds indexed canonical
  family items and aliases, conservatively backfills exact names, links future
  expense rows automatically, and provides family-scoped atomic rename/merge
  RPCs. Item purchases remain one report type, and similar products are combined
  only after an explicit household choice.
- **Reversible reporting-name merges**: migration 039 lets household members
  separate a mistakenly combined saved name. Its exact-name historical purchases
  move atomically to a new reporting item; unused aliases are removed without
  deleting expense history.
- Standalone receipt history at `/receipts`, with store search, receipt-image
  filters, item counts, totals, and direct access to the existing receipt detail
  and missing-image recovery workflow. The page is available from the sidebar
  and includes English and Finnish copy.

### Changed

- Updated the architecture reference from the superseded browser-only
  Tesseract design to the current authenticated GPT receipt-scanning pipeline,
  including image handling, validation, consent, rate limiting, telemetry,
  legacy removal gate, schema fields, and usage-based scan costs.
- Reorganized the roadmap so reporting is one independent Phase 11 with
  sequential subphases 11.1–11.8. Category Budgets is now correctly marked
  complete; trend, per-person, seasonal-insight, and rich-export work is tracked
  under reporting; scanner/model work and deferred product polish have distinct
  ownership. Existing standard documentation now uses the same phase labels.
- Report periods now select a sensible chart interval automatically and disable
  combinations that would not produce a meaningful chart. The API enforces the
  same rule, obsolete requests are canceled, and chart-interval help uses the
  reusable click-to-reveal contextual-help pattern.
- Replaced the narrow Item usage report page and endpoints with the common report
  generator. The legacy `/reports/items` URL now redirects to
  `/reports?type=item-purchases`; no obsolete item-only API or client remains.
- Item-category memory is now synchronized by a database trigger for every
  expense insert or name/category edit, including the edit dialog, category
  move action, manual entry and receipt review. Category corrections overwrite
  wrong mappings, clearing a category removes its mapping, and unused stale
  name keys are removed after a rename (migration 037).
- Receipt review now shows a green exact-match chip when an item name already
  exists in family history and a clickable indigo suggestion chip when similar
  saved names are available. Match status recalculates while any review item is
  edited, including manually added rows. Choosing a suggestion now applies its
  current saved category as well as its name, while preserving the existing
  category if the historical category was deleted or unavailable.
- Replaced global category limits with period-specific budgets. Limits are now
  edited on the Budgets page, keyed by the actual configured period start date
  (for example `2026-07-15` when the start day is 15), and can be copied from
  the previous period without overwriting limits already set. Migration 034
  preserves existing limits for the active period and removes `category_budgets`.
- Replaced the required signup Privacy Notice checkbox with versioned notice
  presentation. Receipt scanning remains a separate optional consent.
- Replaced the one-time receipt-model prompt with three audited opportunities after
  eligible scans 1, 5 and 20. The concise prompt points to Settings, and explicit
  withdrawal prevents any later prompt.
- Split consented multi-user dataset collection and Kotikassa-owned model evaluation
  into a new Phase 10. Phase 9 remains scoped to OpenAI scanning, review, telemetry
  and accuracy evaluation; `is_on_receipt` is explicitly not training consent.
- **Phase 9 plan (GPT-4o mini Vision) revised after external review** — Structured Outputs
  (strict `json_schema` + Zod) instead of JSON mode; dual auth on `/api/scan` (cookie +
  Bearer for mobile) with `EXPO_PUBLIC_WEB_API_URL`; compression moved to scan time (one
  JPEG for both OpenAI and Storage, HEIC rejected); correction inserts kept and repurposed
  for GPT accuracy tracking; atomic Postgres rate limiting; proper HTTP error codes;
  privacy copy fix (`scan.description` claim becomes false); `r.image_url IS NOT NULL`
  dataset-quality filter; 20–30 receipt evaluation gate before deleting Tesseract.
  ROADMAP.md Phase 9 + ADR-015 amendments. No code changed.

### Fixed

- Aligned the Item and chart interval controls in the report generator and
  clarified that the interval changes chart time buckets without changing
  report totals or detail rows.
- Quantity-detail rows such as `2 KPL 1,39 EUR/KPL` are no longer emitted as
  duplicate products named `2 KPL`. Prompt v12 attaches them to the immediately
  preceding product, while a deterministic fallback merges the row only when
  its quantity/unit relationship is valid and removing it makes item totals
  equal the printed receipt total.
- Multi-quantity receipt lines now distinguish the charged line total from an
  explicitly printed per-piece price. Schema v3 extracts `unitPrice`, and an
  exact receipt-total reconciliation corrects cases such as
  `MANSIKKAJOGURTTI 1,30` + `2 KPL 0,65 EUR/KPL` when the model incorrectly
  returns `0,65` as the amount. Historical prices are never copied into scans.
- Lollipop products such as `TIKKARI MILKY` now resolve to Snacks & Treats
  through the built-in Finnish and English `tikkari` / `lollipop` keywords
  even when the exact product name is not yet in family history.
- Similar-name suggestions now tolerate up to three OCR edits in sufficiently
  long product names without relaxing the existing edit-distance guard. Scans
  such as `XTRA VEHNÄPAHDA 500G` can therefore suggest the saved
  `XTRA VEHNÄPAAHTO 500G` name for one-click correction.
- Receipt scans now run a conditional second-pass completeness audit when the
  extracted positive item totals are below the printed receipt total. The audit
  rechecks the entire image and is accepted only when it keeps at least as many
  product lines and reduces the discrepancy, recovering omitted rows such as
  `TÄYSMAITO 1,49` without hardcoding product names. Balanced receipts and
  receipts whose item totals exceed the charged total do not make an extra call.
- Loose weighted-item scans no longer confuse the printed EUR/kg value with the
  charged line total. A receipt-total-validated reconciliation corrects cases
  such as `0,289 kg × 4,29 €/kg` from `4,29 €` to `1,24 €`, while excluding
  packaged names such as `275G` and leaving ambiguous receipts unchanged.
- Payment-terminal-only receipts now extract the printed merchant as the store
  and no longer treat approval text such as `TAPAHT. OK` as a purchased item.
  When the slip contains no product description, the scanner keeps the charged
  amount under a truthful generic `OSTO` row for the user to rename in review;
  English strawberry names now resolve to Groceries after that correction.
- Receipt saves now verify that every selected expense row was returned by
  Supabase before showing success. Final save failures are reported to Sentry
  with the failing phase and safe database diagnostics, and are also logged in
  the browser console. The review page scrolls to the error automatically so a
  failure is visible even when Save was clicked at the bottom of a long receipt.
- K-Group bundle-offer headers such as `2*PLUSSA-TASAERÄ` are no longer kept
  as fake products. When the offer amount, discount, and following product total
  match exactly, the API merges the offer into the real product with the correct
  paid amount, item count, discount, and original price.
- Fuel receipt scans now distinguish purchased litres from the adjacent
  EUR/litre unit price. A fuel-only arithmetic guard corrects the quantity when
  the model returns the unit price instead (for example, `60,00 / 2,099`
  becomes `28,59 l` for a `95 E10` purchase).
- GPT receipt scans now reconcile discounted product lines against the printed
  receipt total. When item totals exceed `YHTEENSÄ` by exactly the linked
  discounts, the API stores the product row as `original_price` and subtracts
  the discount to produce the authoritative paid `amount` (for example,
  `2,76 - 0,76 = 2,00` on K-Market `PLUSSA-ETU` receipts).
- Missing-image receipt recovery now pairs small OCR spelling differences with
  the existing expense instead of presenting duplicate keep/add rows, displays
  quantity or unit differences that require review, and lets the user explicitly
  remove an existing row that is not present on the scanned receipt. Migration
  035 keeps selected removals atomic with corrections, additions and image attachment.

### Added

- Receipt review item names now offer scanner-only fuzzy matches from saved
  history for small OCR spelling differences. Clicking a match changes only the
  name; scanned price, quantity, unit, discount, and category remain untouched.
  Pack-size variants can suggest their shared base name only when the scanned
  quantity/unit already preserve the package size.
- Added the 💄 emoji to the category icon picker for beauty and personal-care categories.
- **Phase 3c — Savings Withdrawals & Recovery Plans**: savings deposits and
  withdrawals now use an atomic transaction ledger; withdrawals can create a
  monthly recovery plan with an optional deadline, linked recovery payments,
  pause/resume controls, and automatic completion. The dashboard now shows
  savings withdrawals separately and includes them in free cash flow. Migration
  036 adds the recovery schema, private-goal-aware access rules, and transaction
  RPCs that prevent over-withdrawal and balance drift.
- Missing receipt images can now be selected from receipt details, scanned with
  the existing consent-controlled GPT flow, compared against every linked expense,
  and attached only after an automatic match or explicit discrepancy review. During
  review, users can keep an existing expense, replace its values with editable scan
  values, skip an incorrect extra scan row, or add a corrected missing item. Migration
  033 applies selected item changes and the receipt attachment atomically.
- Receipt details on the expenses page: every receipt-backed expense can open its
  complete receipt, view the stored image and all linked items, and correct the
  receipt-level store name. The correction updates every loaded item from that receipt
  without merging separate receipts that use the same store name.
- **Phase 10 consent foundation** (ADR-016): limited **Allow / Not now** choices
  for Kotikassa receipt-model development, versioned database timestamps,
  receipt-level consent snapshots, Settings withdrawal, bilingual Privacy Notice copy,
  and a consent-filtered multi-user exporter. Migration 030 adds the consent fields
  and `set_receipt_training_choice()` RPC. Migration 031 records up to three prompt
  views and their scan milestones; declining never affects app features.
- Owner-controlled server-side receipt dataset exporter: explicit receipt/uploader
  selection, verified JPEG downloads from private Storage, canonical JSONL,
  deterministic splits and failure reporting. Migration 029 adds the required
  read-only service-role grants; generated `training-data/` remains outside Git.
- **Versioned privacy workflow**: public bilingual Privacy Notice, versioned notice
  presentation during signup, optional OpenAI receipt-scanning consent, one-time
  migration screen for OAuth/existing users, Settings controls, and server-side consent
  enforcement in `/api/scan`. Migration 028 stores database-timestamped privacy choices
  and supports withdrawal. Family deletion now removes receipt images from Supabase
  Storage before deleting database and auth records.
- **Phase 9 (web) — GPT Vision receipt scanning implemented** (ADR-015): new `/api/scan`
  route — dual cookie/Bearer auth, strict Structured Outputs + Zod semantic validation,
  JPEG signature check, atomic per-family rate limit (`consume_scan_quota()`), stable
  HTTP error codes. Migration 027: scan telemetry on `receipts`, `is_on_receipt` +
  `receipt_line_index` on `expense_items` (+ conservative backfill), `scan_rate_limits`.
  `ReceiptScanner.tsx` compresses once at scan time and uploads the exact scanned JPEG;
  corrections are awaited and repurposed as GPT accuracy tracking; HEIC now rejected
  with a clear error. Categorizer moved to `@kotikassa/shared` (web + native exports).
  Scan privacy copy rewritten in en + fi (photo goes to OpenAI). Tesseract pipeline
  retained unused pending the 20–30 receipt evaluation gate; mobile scan flow and
  `packages/ocr` deletion follow the production trial.
- Receipt images are compressed client-side before upload (Canvas: max 2000px long edge,
  JPEG q0.8) — ~200-500 KB per receipt instead of 2-4 MB originals, ~5-10x more receipts
  in the 1 GB free-tier storage. Falls back to the original file if the browser can't
  decode the format (e.g. HEIC). `ReceiptScanner.tsx` (`compressForUpload()`)
- **Budget period offset** (`budgetStartDay` preference) — users whose income arrives mid-month
  can set a start day (1–28); all expense/income queries, budget alerts, and month navigation
  labels shift to cover e.g. Jun 15 – Jul 14 instead of Jun 1 – Jun 30
  - `packages/shared/src/utils/dates.ts`: `periodRange()`, `currentPeriodStart()`,
    `formatPeriod()`, `resolvePeriodParam()` — all backward-compatible (day=1 = calendar month)
  - `packages/shared/src/types/preferences.ts`: added `budgetStartDay?: number` (default 1)
  - Web settings page: 1-28 dropdown in Display Preferences card
  - Web pages updated: dashboard, expenses, income, budgets — all use period-aware queries
  - Mobile: `MonthNav.tsx` accepts `startDay` prop; dashboard, expenses, income screens wired;
    mobile settings screen gets +/− day picker
  - i18n keys `budgetStartDay` + `budgetStartDayHint` added to all 4 locale files
    (web en/fi, mobile en/fi)
- OCR parser: skip `KANTA-ASIAKAS` and `PLUSSAA KERRYTTÄVÄT OSTOT` lines — K-Group loyalty
  card section headers were being parsed as expense items (`packages/ocr/src/parser.ts`)
- Month navigation on **Income** and **Budgets** pages (web) — same `?month=` pattern
  as the dashboard; `DashboardMonthNav` gained a `basePath` prop for reuse
- Budgets month label now localized via `formatMonth()` (was hardcoded English names)
- **Mobile app MVP (`apps/mobile`)** — React Native + Expo SDK 57, Expo Router, NativeWind
  - Auth: login, signup (email/password), onboarding (family creation + default category seed)
  - Tabs: Dashboard (summary cards, budget alerts, category breakdown, recent expenses),
    Expenses (month nav, category filter, add/edit/delete, recurring + People locks),
    Income (preset/custom sources, recurring toggle, add/edit/delete, People locks),
    Settings (account, family, language switcher, sign out)
  - i18n fi + en (`apps/mobile/locales/`), device-locale default
  - Recurring-expense materialization on dashboard/expenses load (same guard as web)
- `@kotikassa/shared/native` package export — RN-safe entry (types/utils/constants,
  no Supabase server client) so Metro can bundle the shared package
- `docs/decisions/013-mobile-expo-nativewind.md` — ADR for the mobile stack

### Fixed

- Custom family income sources can now be saved on `income_entries`; the original
  preset-only database constraint is replaced by a non-empty, length-bounded check.
  Custom-source create, rename and delete failures now keep client state unchanged
  and show localized errors instead of exposing raw database messages.
- Receipt scans no longer fail validation when the model reads a negative bottle-return
  or refund adjustment such as `PULLOPALAUTUS`. Adjustments are used to read the printed
  receipt total but are not emitted as expense items.
- Future scanned receipts now persist the printed receipt total returned by the
  versioned scan schema instead of leaving `receipts.total_amount` null.
- Receipt image upload retries now verify whether a failed response still produced
  the Storage object, preventing a successful first upload from being misreported as
  a duplicate failure on retry.
- Currency feature correctness (reconstructed from commit `b33767c`, 2026-07-01 — original
  entry was lost to NUL-byte corruption):
  - `router.refresh()` after currency/name save so `CurrencyProvider` updates without a hard reload
  - Supabase errors checked in both settings save handlers — `saveFailed` toast instead of silent swallow
  - CHECK constraint on `families.currency` at DB level (migration 023)
  - `useFormatCurrency` now uses `useCallback` — was creating a new function reference every render
  - `getFamily()` extracted with React `cache()` into `lib/family.ts` — layout, dashboard and
    settings share one DB round-trip per request instead of three
- Receipt scanner silently swallowed Supabase Storage upload errors — `image_url` was saved
  as NULL with no feedback when the image upload failed (`ReceiptScanner.tsx` ignored
  `uploadErr`). Now the receipt still saves, but the failure is reported to Sentry and an
  amber warning with the reason is shown on the done screen (i18n key `scan.uploadWarning`,
  en + fi)
- Recurring-expense materialization was gating on / keying off the budget-period anchor
  month instead of the true calendar month once `budgetStartDay > 1` — silently skipped
  materialization on web (`apps/web/app/(dashboard)/page.tsx`,
  `apps/web/app/(dashboard)/expenses/page.tsx`) and mis-dated it on mobile
  (`apps/mobile/app/(tabs)/index.tsx`, `expenses.tsx`), risking duplicate recurring
  entries. Now always uses `currentMonthStart()` for the materialization key while still
  gating on `isCurrentPeriod` (ADR-014)
- `ExpensePageClient.tsx`, `CategoryExpenseModal.tsx` (+ its `MonthlyChart.tsx` caller), and
  the `/trends` page were never migrated to the period-aware date functions in the initial
  pass — week-filter chips, the post-add refetch range, the forward-nav arrow, the
  category-breakdown modal, and the monthly trend buckets all still used raw calendar-month
  math for users with `budgetStartDay > 1`. All four now read `budgetStartDay` and use
  `periodRange` / `currentPeriodStart` / `formatPeriod` consistently
- `apps/mobile/locales/fi.json` had invalid JSON (unescaped quotes in `income.noIncomeHint`)
  that would have crashed the mobile app on startup; repaired
- `apps/mobile/app/(tabs)/expenses.tsx` and `income.tsx` had several KB of trailing NUL
  bytes (Windows NTFS truncation artifact) instead of a closing newline; stripped
- Shared `Profile` type (`packages/shared/src/types/database.ts`) was missing the
  `preferences` JSONB field — silently masked on web by an untyped Supabase row, but broke
  the mobile app's strict typecheck once mobile screens started reading `profile.preferences`
- Mobile settings: saving `budgetStartDay` now surfaces a Supabase error instead of
  silently reverting on failure; the budget-period card no longer reuses the unrelated
  "Display preferences" title (new `budgetPeriodSection` i18n key)

### Changed

- `packages/shared/src/utils/dates.ts`: removed redundant `startDay <= 1` special cases in
  `currentPeriodStart()`/`periodRange()` (the general formula already produces identical
  output); added `getISOWeeksInRange(from, to)`, with `getMonthWeeks()` now a thin wrapper
  over it — needed so the expenses week filter can cover an arbitrary budget period, not
  just a calendar month
- Mobile dashboard/expenses/income screens: memoized `budgetStartDay`/`currentPeriodStart()`
  lookups and made the initial `monthStart` `useState` lazy, instead of recomputing on
  every render
- Migrated from single `PROJECT.md` to industry-standard documentation structure:
  `README.md`, `CHANGELOG.md`, `ROADMAP.md`, `docs/setup.md`, `docs/decisions/`
- `CLAUDE.md` restructured: end-of-session doc update rule added, doc pointers
  updated from `PROJECT.md` to split files, deskew eval script path added to
  Architectural Decisions table
- Global memory cleaned up: 6 project-specific memory files removed (content
  already covered by `CLAUDE.md`); 2 new cross-project rules added
  (`feedback_industry_standard_docs`, `feedback_claude_md_doc_rule`)

### Added

- `README.md` — project overview, features, tech stack, documentation links
- `ROADMAP.md` — all phases with done/in-progress/planned status and checklists
- `docs/setup.md` — full migration runbook and local dev setup guide
- `docs/decisions/010-people-tracker-cascade-delete.md` — ADR for ON DELETE CASCADE design
- `docs/decisions/011-precommit-newline-guard.md` — ADR for pre-commit truncation guard
- `docs/decisions/012-documentation-structure.md` — ADR for industry-standard docs split
- `end-of-session` skill — step-by-step doc update checklist invokable via `/end-of-session`

---

## [0.8.0] — 2026-06-28

### Added

- **Phase 7 — People / Informal Loan Tracker**: `people` + `people_transactions` tables (migrations 019–021), 6-type transaction model (`sent`, `lent`, `repaid_them`, `received`, `they_repaid`, `borrowed`), auto expense/income mirroring, balance tracking, lock icons on linked records, `/people` page, `PersonPanel` component
- **Phase 8 — Family Currency Setting**: `families.currency` column (migration 022), `CurrencyContext` + `useFormatCurrency()` hook, 19 client components migrated from hardcoded EUR, admin currency picker in Settings
- Pre-commit hook rejecting `.tsx`/`.ts` files not ending with newline (guards against NTFS truncation on Windows)

---

## [0.7.0] — 2026-06-26

### Added

- Family invite system: migration 014 (`preview_invite()` + `use_invite()` SECURITY DEFINER functions), `/join` public invite landing page, invite link generation in Settings, middleware updated for public `/join` route

---

## [0.5.0] — 2026-06-24

### Added

- **Phase 5 — Category Budgets**: `is_fixed` boolean on categories (migration 011) — Housing, Loans & Credit, Utilities & Bills, Subscriptions marked fixed
- Fixed/Variable/All donut chart toggle on dashboard (default: Variable — shows controllable spending only)
- `category_budgets` table (migration 012): one monthly limit per category, no per-month override
- Inline budget editor on Categories page
- `/budgets` page: per-category progress bars (green < 80%, amber 80–100%, red >= 100%), untracked spending section
- Dashboard budget alert card: categories >= 80% of limit with mini progress bars

---

## [0.4.0] — 2026-06-22

### Added

- **Phase 4 — Recurring Expenses**: `recurring_expenses` table (migration 008), `/recurring` management page, on-load materialization (current month only, guarded by `last_materialized_month`), Recurring badge on expense rows, recurring-aware delete confirmation
- **Phase 3b — Expense Enhancements**: ISO week filter (Month/Week toggle, week navigation within month), user preferences JSONB (migration 007), Settings display preferences card (`showWeekFilter`, `showStoreFilter`), store filter dropdown, mobile-responsive filter bar

### Changed

- Roadmap reordered: recurring expenses moved up to Phase 4; budgets become Phase 5

---

## [0.3.0] — 2026-06-21

### Changed

- OCR preprocessor rewritten: adaptive two-pass (Pass 1 global contrast → Pass 2 `flattenIllumination` when confidence < 55 or 0 items parsed; Pass 2 wins only if it returns strictly more items). Fixes crumpled/shadow receipts without regressing clean ones.
- Deskew set OFF by default (`ENABLE_DESKEW=false`) — evidence-based evaluation against real S-Market photos; see `packages/ocr/test/deskew-eval.py`

---

## [0.2.0] — 2026-06-20

### Added

- Quantity + unit fields on `expense_items`; shown in expense list (desktop) and receipt review screen
- Discount fields (`discount_amount`, `original_price`) on `expense_items` (migration 006); ALE/ALENNUS detection in parser; savings badge in expense list
- Price history modal per item
- Expense filter bar: search, category chips with monthly totals, sort toggles (date/amount/name), store dropdown, date picker; server-side month fetch via `?month=` param

---

## [0.1.0] — 2026-06-19

### Added

- **Phase 1 — Foundation**: Turborepo monorepo (`apps/web`, `packages/shared`), Supabase migrations 001–003 (families, profiles, categories, receipts, expense_items, income_entries, savings_goals, investments), auth (sign up / login / logout / Google OAuth), family group onboarding, dashboard (monthly total, income, surplus, category pie chart, recent expenses, net worth), expense list with category chips + search + sort + date picker, category management (add/edit/delete/reorder), manual expense entry form, income entry form, Settings page, quick-add chips, item name autocomplete, price history modal, edit/delete expense modal
- **Phase 2 — Receipt Scanner (web)**: `packages/ocr` (preprocessor, Tesseract WebWorker, Finnish parser, auto-categorizer), Supabase Storage bucket + RLS (migration 004), item-category memory (migration 005), `/scan` page with upload → OCR → review → save state machine
- **Phase 3a — Income, Savings & Investments**: savings goals page with progress bars, investments tracking page, dashboard surplus + net worth cards

### Fixed

- `createClient` name collision in `packages/shared`: browser client stays `createClient`, server client exported as `createSupabaseServerClient`
