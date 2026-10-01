# Kotikassa — Roadmap

Status legend: ✅ Complete · 🔄 In Progress · ⬜ Planned

---

## ✅ Phase 1 — Foundation (2026-06-19)

- [x] Auth: sign up, login, logout, Google OAuth
- [x] Family group creation + multi-member support
- [x] Family invite system (48h invite link, `/join` page)
- [x] User profiles (display name, avatar)
- [x] Category management — add, edit, delete-if-empty, reorder
- [x] Manual expense entry (name, amount, date, category, quantity + unit, discount)
- [x] Expense list — monthly server-fetch, category chips, search, sort, store filter, date picker
- [x] Edit / delete expense modal
- [x] Quick-add chips (top 24 most-purchased items)
- [x] Item name autocomplete with fuzzy category suggestion
- [x] Price history modal per item
- [x] Dashboard — monthly total, income, surplus, category pie chart, recent expenses, net worth

---

## ✅ Phase 2 — Original Web Receipt Scanner (2026-06-21)

This phase established the receipt workflow with Tesseract.js. Phase 9 replaces
the OCR engine while retaining the upload, review, reconciliation, and save
experience.

- [x] Upload → OCR → review → save flow (`/scan`)
- [x] Adaptive two-pass preprocessor (contrast first, flatten-illumination fallback)
- [x] Finnish receipt parser (S-Market, K-Market, Lidl, Prisma, Hornet)
- [x] Discount / ALE detection — `discount_amount` + `original_price` per line
- [x] Auto-categorization with Finnish keyword dictionary
- [x] Item-category memory (learned from every expense insert and name/category correction)
- [x] Receipt details from linked expenses — private image, all receipt items, receipt-level store correction, and atomic receipt/expense deletion
- [x] Missing-image recovery — typo-tolerant matching; visible quantity/unit differences; keep or correct matched expenses; keep, edit or remove missing existing rows; skip or add extra scan rows; then save the selected reconciliation and image atomically
- [x] Persist the printed receipt total for future GPT-scanned receipts
- [x] Standalone receipt history browser with store search, image-status filters, and receipt details

---

## ✅ Phase 3a — Income, Savings & Investments (2026-06-19)

- [x] Income entry (salary, freelance, benefits, other; recurring toggle)
- [x] Savings goals with progress bars and deadlines
- [x] Investment tracking (contributions + notes)
- [x] Dashboard surplus (income − expenses) + net worth snapshot

---

## ✅ Phase 3b — Expense Enhancements (2026-06-22)

- [x] Discount fields (`discount_amount`, `original_price`) on expense_items
- [x] ISO week filter — Month/Week toggle + week navigation within month
- [x] User preferences system (JSONB in `profiles.preferences`, typed defaults)
- [x] Settings display preferences card (`showWeekFilter`, `showStoreFilter`)
- [x] Store filter dropdown
- [x] Mobile-responsive filter bar
- [x] Budget period offset (`budgetStartDay` preference) — shift period to e.g. 15th–14th for mid-month income

---

## ✅ Phase 3c — Savings Withdrawals & Recovery Plans (2026-07-15)

- [x] Savings transaction ledger with explicit deposits and withdrawals
- [x] Atomic goal-balance updates with over-withdrawal protection
- [x] Optional recovery plan when withdrawing from a savings goal
- [x] Monthly recovery amount, optional deadline, and pause/resume controls
- [x] Recovery payments linked to their plan with automatic progress and completion
- [x] Dashboard free-cash-flow breakdown includes savings withdrawals as funding
- [x] Private-goal-aware transaction and recovery-plan access

---

## ✅ Phase 4 — Recurring Expenses (2026-06-22)

- [x] `recurring_expenses` table (monthly / yearly recurrence types)
- [x] On-load materialization — current month entries created on expenses page navigation
- [x] `/recurring` management page — list, add, edit, pause/resume, delete templates
- [x] Recurring badge on expense rows
- [x] Delete individual instance without affecting template

---

## ✅ Phase 5 — Category Budgets (2026-06-24)

- [x] `is_fixed` on categories — Housing, Loans, Utilities, Subscriptions marked fixed
- [x] Fixed / Variable / All donut chart toggle on dashboard
- [x] Period-specific `budgets` rows keyed by the configured budget-period start date
- [x] Budget editor on the selected period, with copy-missing-limits from the previous period
- [x] `/budgets` page — per-category progress bars + over-budget highlighting
- [x] Dashboard budget alert card (>= 80% of limit)

---

## ⬜ Phase 6 — Deferred Product Improvements

These independent enhancements are not prerequisites for later numbered phases.

- [ ] Dark mode
- [ ] Web offline mode (PWA + service worker)
- [ ] Bulk item select / move / delete

---

## ✅ Phase 7 — People / Informal Loan Tracker (2026-06-28)

- [x] `people` + `people_transactions` tables with RLS
- [x] 6-type transaction model: `sent`, `lent`, `repaid_them`, `received`, `they_repaid`, `borrowed`
- [x] Auto-creates linked expense or income on transaction save
- [x] Balance per person — positive = they owe you, negative = you owe them
- [x] Lock icons on linked expense/income rows (must delete via People page)
- [x] ON DELETE CASCADE — deleting a transaction removes linked expense/income atomically
- [x] `/people` page with contact list + balance indicators
- [x] `PersonPanel` — transaction history, type picker, category picker, add form

---

## ✅ Phase 8 — Family Currency Setting (2026-06-28)

- [x] `families.currency` column (EUR / USD / LKR / DKK, default EUR)
- [x] `CurrencyContext` + `useFormatCurrency()` hook — no prop-drilling
- [x] All 19 client components migrated from hardcoded EUR
- [x] Admin-only currency picker in Settings

---

## 🔄 Phase 9 — GPT-4o mini Vision Receipt Scanning

The web scanning path is implemented. Evaluation, production rollout, mobile
scanning, and retirement of the unused Tesseract pipeline remain. ADR-015 is the
authoritative technical decision; `docs/ocr-gpt-decision.html` provides the
supporting comparison.

### Implemented

- [x] Authenticated `/api/scan` for web cookie sessions and mobile bearer tokens
- [x] GPT receipt extraction with strict Structured Outputs, Zod validation, and deterministic Finnish `D.M.YYYY` normalization
- [x] JPEG normalization and validation, durable rate limiting, stable API errors, and provider telemetry
- [x] Compress once before scanning and retain that exact JPEG through review and save
- [x] Review, correction, receipt-order, and on-receipt label capture
- [x] Versioned bilingual privacy notice and required scan-processing choice
- [x] Shared auto-categorizer moved from `packages/ocr` to `packages/shared`
- [x] Scan metadata and durable rate-limit schema added in migration 027

### Remaining

- [ ] Configure and verify production environment variables and function timeout
- [ ] Compare image `detail` settings and tune the prompt using a labelled 20–30 receipt evaluation set
- [ ] Complete a short production trial
- [ ] Build the mobile capture, review, retry, upload, and save flow
- [ ] Remove the unused Tesseract pipeline only after the evaluation and trial pass

### ✅ Phase 9.1 — Correction Intelligence and Adaptive Scan Quality (2026-09-26)

This subphase turns the corrections Kotikassa already records into measurable
scan improvements at two deliberately separate scopes: private household memory
and a consent-governed global intelligence foundation. Global evidence is
aggregated across independent contributors and never exposes another household's
raw corrections at runtime. Historical evidence is classified before use:
complete records can support evaluation and learning, partial records can support
suggestions only, and conflicting or unusable records cannot drive automation.
Repeated corrections from one contributor increase personal support but do not
count as independent global agreement; an unchanged save is not treated as a
confirmation unless the product records an explicit review signal.

#### ✅ Milestone 1 — Historical Correction Audit and Baseline (2026-08-04)

- [x] Build a read-only, repeatable analyser that compares `receipts.scan_raw_result`, item and receipt correction rows, and final confirmed receipt items
- [x] Classify historical evidence as complete, partial, conflicting, or unusable without changing production scan behaviour
- [x] Measure item recall, false-item rate, field corrections, price/quantity/unit accuracy, store/date accuracy, latency, and cost by model, prompt version, and store
- [x] Report matching coverage and establish the baseline used by later milestones
- [x] Separate explicit corrections from saves with no explicit correction, and measure whether repeated patterns come from one or multiple contributors without treating repetition as independent agreement
- [x] Document the legacy evidence gaps that prevent passive saves from becoming trusted labels: no explicit confirmation, field-touch, suggestion provenance, accept/reject/undo, or atomic feedback guarantee
- [x] Start collecting versioned, idempotent review outcome events with receipt, actor, source, raw/final values, and `save_only` semantics so future data is stronger without misclassifying passive saves

#### ✅ Milestone 2 — Household Correction Memory (2026-08-05)

- [x] Add family-isolated item-name and store-name correction memory with historical/live support, rejection, undo, disagreement, confidence, context, distinct-receipt/contributor, and last-used metadata
- [x] Backfill memory from reliable linked historical corrections through an idempotent dry-run/apply process that excludes receipts already represented by versioned feedback events
- [x] Continue using the existing item-category memory with explicit bounded confidence and one database trigger as its authoritative writer
- [x] Mark scan feedback as expected on receipt creation, retry idempotent recording, and atomically insert events, update memory, and mark completion so missing evidence remains detectable
- [x] Define and validate reviewed-as-correct, changed, rejected, accepted, and undone event semantics with actor, receipt, field, suggestion source/version, and event time; current saves remain `save_only`, while Milestone 3 emits suggestion interaction events
- [x] Prepare consent-eligible global candidates as service-role-only aggregates keyed by normalized context, with capped contributor influence, disagreement, recency, day, contributor, receipt, and household diversity metadata

#### ✅ Milestone 3 — Explainable Correction Suggestions (2026-08-05)

- [x] Rank private household memory first, then consent-governed global candidates so a new user can benefit on the first scan without reading another household's raw data
- [x] Suggest repeated corrections during review without changing price, quantity, discount, or category unintentionally
- [x] Explain whether a suggestion comes from household history, a globally observed pattern, or a deterministic rule, and provide an immediate undo action
- [x] Record suggestion acceptance and rejection so confidence can rise or fall
- [x] Keep single, partial, and conflicting historical corrections suggestion-only
- [x] Let repeated evidence from one contributor create a low-confidence exploratory global suggestion only after privacy, minimum-quality, and rate-limit gates; strengthen it primarily through independent user feedback

#### ✅ Milestone 4 — Scan Quality Detection (2026-08-07)

- [x] Score scan risk using receipt-total reconciliation, date validity, duplicate/header/payment rows, quantity arithmetic, missing fields, and household price history
- [x] Highlight only suspicious fields with a plain-language reason and never replace uncertain financial values automatically
- [x] Measure warning acceptance, dismissal, and the change in saved incorrect-scan rate against the Milestone 1 baseline
- [x] Detect low-review and feedback-bias risks, monitor candidate performance by store/model/prompt and contributor concentration, and prevent prolific or adversarial users from dominating global confidence

#### ✅ Milestone 5 — Safe Automatic Corrections (2026-09-26)

- [x] Automatically apply only reversible, low-risk corrections with repeated evidence, high agreement, no conflicting target, no recent rejection, and the required scope-specific confidence
- [x] Limit automatic behaviour to proven name/store aliases, bounded category memory, deterministic date formatting, and mathematically certain receipt structures
- [x] Keep prices, ambiguous quantities/units, missing items, row deletion, and ambiguous dates under explicit user review
- [x] Show every learned automatic correction with its reason and an undo action
- [x] Require a current, versioned fixed-holdout result with an immutable dataset fingerprint before enabling learned automatic behaviour
- [x] Never promote a learned global correction to automatic behaviour from one contributor alone; require independent household support and a stricter fixed-holdout evaluation, except for separately proven deterministic invariants

Phase 9.1 is complete when historical corrections are classified and backfilled,
every new confirmed scan produces durable feedback, suggestions are explainable
and reversible, suspicious scans are identified, and only measured low-risk
corrections can be applied automatically without another OpenAI request. New
users can receive privacy-safe global suggestions immediately, while household
history remains isolated and receives higher personalization priority.

---

## 🔄 Phase 10 — Consented Receipt Dataset & Kotikassa Model Evaluation

Phase 10 governs every use of receipt images and confirmed labels for developing,
testing, or evaluating a Kotikassa-owned model. Phase 9 storage and accuracy
metadata do not by themselves make a receipt eligible. ADR-016 is authoritative.

### Implemented consent and export foundation

- [x] Owner-controlled local exporter with private image download, JPEG validation, deterministic splits, and ignored `training-data/` output
- [x] Migration 029 read grants required by the server-side exporter
- [x] Versioned bilingual privacy notice and explicit, optional **Allow / Not now** model-development choice
- [x] Settings privacy controls and a limited three-view consent prompt schedule
- [x] Migrations 030 and 031 for consent state, receipt snapshots, audit fields, and atomic prompt claiming
- [x] Consent-filtered multi-user export with no unrestricted `--all` mode

### ⬜ Correction-Informed Model Evaluation

#### Milestone 6 — Consented Global Evaluation and Model Improvement

- [ ] Extend the consent-filtered exporter with original validated model results, final confirmed labels, field-level differences, added/removed lines, and prompt/model/schema versions
- [ ] Keep household learning isolated and admit data to cross-household evaluation only while its user and receipt consent remain current
- [ ] Build a reproducible global candidate pipeline that deduplicates correlated events, caps each contributor's influence, measures distinct receipt/user/household support, preserves disagreement, and emits only aggregate rule artifacts with minimum privacy thresholds
- [ ] Build a fixed, diverse, disjoint validation set and calculate the Phase 9 OpenAI baseline from confirmed evidence
- [ ] Mine repeated consented corrections for tested deterministic rules and prompt improvements before considering model training
- [ ] Release low-confidence global candidates through an exploration budget, collect explicit accept/reject/undo feedback, and use calibrated confidence rather than raw correction counts for promotion
- [ ] Gate every prompt, rule, or future model change on item recall, false-item rate, financial-field accuracy, store/date accuracy, latency, and cost without material regressions
- [ ] Choose or train a Kotikassa-owned model only if the consented dataset is sufficiently diverse and evaluation shows a clear benefit over the current provider

Milestone 6 is complete when consented original-versus-confirmed evidence can be
reproduced as a governed evaluation dataset and proposed scan changes must pass a
fixed measurable quality gate. Shipping a Kotikassa-owned model is not required
unless that evidence supports it.

### Remaining governance and model gate

- [ ] Define and implement withdrawal/deletion handling for source images, generated datasets, manifests, and derived models
- [ ] Minimise or redact identifiers not required for receipt extraction
- [ ] Build diverse, disjoint train/validation/test datasets; treat approximately 500 receipts as a feasibility target, not a guarantee
- [ ] Choose a model architecture only after inspecting dataset diversity and label quality
- [ ] Complete a GDPR-focused legal review before production model use

---

## 🔄 Phase 11 — Reporting

Phase 11 owns the shared report generator and its reporting-specific extensions.
Completed subphases provide the current experience; later subphases remain
independent enhancements.

### ✅ Phase 11.1 — Common Report Generator (2026-07-27)

- [x] `/reports` — one generator with a shared report, period, filter, grouping, chart, summary, detail, and export experience
- [x] Financial summary, expense details, income vs expenses, category spending, store spending, item purchases, budget performance, and people transactions
- [x] Week, current budget period, 3 / 6 / 12 period, and custom date ranges with previous/next navigation
- [x] Report-specific category, store, item, and person filters
- [x] Daily, weekly, or monthly charts with empty periods retained
- [x] CSV export with spreadsheet-formula injection protection
- [x] Unit-safe item-purchase totals (`g → kg`, `ml` / `cl → l`; incompatible units stay separate)
- [x] Canonical family items with exact-name backfill, automatic future linking, rename, merge, and reversible separation
- [x] Legacy `/reports/items` URL redirects to the Item purchases report

Pantry/inventory consumption tracking is intentionally outside the reporting
phase. Item reports measure recorded purchases, not household consumption.

### ✅ Phase 11.2 — Reporting Foundation and Usability (2026-07-30)

- [x] Bookmarkable URL state for report type, period, exact range, chart interval, and relevant filters
- [x] Smart chart interval defaults with invalid combinations disabled in both the UI and API
- [x] Active-filter summary with one-click filter reset
- [x] Reusable click-to-reveal contextual help with outside-click and Escape dismissal
- [x] Cancellation of obsolete report requests
- [x] Reversible reporting-name merges with exact-name historical purchase reassignment
- [x] Focused tests for ranges, URL validation, empty chart buckets, budget allocation, quantity normalization, and CSV safety

### ✅ Phase 11.3 — Period Comparison (2026-07-30)

- [x] Previous period, previous year, and custom comparison ranges
- [x] Same-filter comparison metrics with relative or percentage-point changes
- [x] Position-aligned comparison charts with exact range legends, neutral comparison styling, dual-date tooltips, and plain-language summaries
- [x] Bookmarkable comparison settings and server-side range/interval validation
- [x] Focused tests for comparison ranges, URL state, and metric changes

### ⬜ Phase 11.4 — Drill-down Navigation

- [ ] Open contributing expenses, receipts, items, and people transactions from report results

### ⬜ Phase 11.5 — Report Insights

- [ ] Add trend views for 3 / 6 / 12 periods
- [ ] Add per-person expense breakdowns
- [ ] Add savings rate, recurring split, basket averages, unit prices, ranked budget variance, and seasonal spending insights

### ⬜ Phase 11.6 — Saved Configurations

- [ ] Save named personal or household report definitions using stable URL-compatible settings

### ⬜ Phase 11.7 — Rich Exports

- [ ] Add print layouts, PDF export, and formatted Excel workbooks

### ⬜ Phase 11.8 — Measured Performance Work

- [ ] Add query telemetry, evidence-backed indexes, database aggregation, and detail pagination

---

## 🔄 Mobile App — React Native + Expo (started 2026-07-02)

Bring the full Kotikassa experience to iOS and Android. The web app is the
primary platform; mobile reuses `packages/shared` and the authenticated Phase 9
`/api/scan` route.

- [x] Scaffold `apps/mobile/` with Expo Router + TypeScript (SDK 57, NativeWind 4)
- [x] Auth: login / signup / onboard (email/password; AsyncStorage sessions via `@kotikassa/shared/native` types + mobile-owned client)
- [ ] Mobile receipt scanning with Expo Camera/image compression, bearer authentication, and the Phase 9 scan API (ADR-013 and ADR-015)
- [x] Core pages (MVP): dashboard, expenses, income, settings
- [x] Budget period offset wired on mobile (MonthNav + screens + settings picker)
- [ ] Remaining pages: savings, investments, recurring, budgets, people
- [ ] Google OAuth on mobile (deep link + Google console)
- [ ] Push notifications for budget alerts
- [ ] Offline mode (local queue + sync on reconnect)
- [ ] EAS Build for App Store / Google Play distribution

---

## ✅ Engineering Quality — Automated Testing

This is a cross-cutting engineering track, not a numbered product phase.
The milestones below establish automated protection across application and
database behaviour and make testing part of every future feature.

### ✅ Milestone 1 — Test Foundation (2026-07-31)

- [x] Configure Vitest projects for web and shared-package tests
- [x] Add React Testing Library, `user-event`, jsdom, and MSW test support
- [x] Convert the existing reporting tests to TypeScript and Vitest
- [x] Add consistent root scripts for unit, watch, coverage, and current web/shared CI checks

Milestone 4 provides separate explicit E2E commands, keeping the normal unit-test
command fast and preventing an unexpected local database reset.

### ✅ Milestone 2 — Database Security and Integrity (2026-07-31)

- [x] Configure local Supabase testing with pgTAP and root database-test commands
- [x] Test family isolation, private records, grants, constraints, and RLS policies
- [x] Test critical savings, people, budget, catalog, consent, and receipt behaviour
- [x] Verify all migrations and deterministic transactional fixtures on a clean local reset

### ✅ Milestone 3 — API and Component Tests (2026-07-31)

- [x] Test report and receipt-scan authentication, validation, authorization, and error contracts
- [x] Mock OpenAI and external requests so normal automated tests have no provider cost
- [x] Test critical forms, dialogs, filters, contextual help, loading, empty, and error states
- [x] Cover important English and Finnish user-facing behaviour

### ✅ Milestone 4 — End-to-End Workflows (2026-07-31)

- [x] Add a dedicated Playwright E2E workspace
- [x] Cover critical expense, budget, reporting, reporting-name, savings, people, and receipt workflows
- [x] Add desktop and mobile-viewport smoke coverage
- [x] Add automated accessibility checks to critical workflows

### ✅ Milestone 5 — Continuous Integration (2026-08-01)

- [x] Run lint, typecheck, unit/component tests, database tests, build, and critical E2E tests in CI
- [x] Upload useful coverage, trace, screenshot, and failure artifacts
- [x] Establish practical coverage thresholds for business-critical code
- [x] Keep real OpenAI receipt-quality evaluation outside normal CI and require an explicit future manual trigger

### Ongoing Testing Rules

These rules are adopted in `AGENTS.md` and remain continuous requirements:

- [x] New business rules include focused unit tests
- [x] New migrations and RPCs include database tests
- [x] Important user workflows include or update E2E coverage
- [x] Fixed bugs receive regression tests where practical
- [x] Normal CI never uses production data or calls OpenAI

---

## Open Questions

- Should investments track current value (via manual updates) or contributions only?
- Push notifications for budget alerts on mobile — opt-in per user or family-wide?
