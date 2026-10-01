# ADR-018 — Consent-Governed Global Correction Intelligence

**Date:** 2026-08-04
**Status:** Accepted — implemented through measured, reversible automatic aliases

## Context

Kotikassa already stores original receipt-model output, final expense rows, and
changed item/store/date values. That history is useful but incomplete: unchanged
saves do not prove review, correction rows lack explicit actor and suggestion
provenance, and raw event counts allow one prolific contributor to dominate.

New households should benefit from patterns learned elsewhere without gaining
access to another household's raw data. Cross-household use must also remain
separate from private household personalization and follow ADR-016 consent.

## Decision

- Maintain two intelligence scopes: private household memory and
  consent-governed global aggregate candidates.
- Record versioned review events with receipt, actor, source, raw/final values,
  context, and an idempotent event key. A plain save is recorded as `save_only`,
  never as explicit field confirmation.
- Treat repetitions from one contributor as correlated personal evidence. They
  may seed a low-confidence candidate but do not count as independent agreement.
- Measure support by distinct receipts, days, contributors, and households;
  retain disagreement and cap contributor influence.
- Never expose raw cross-household corrections at runtime. The administrative
  refresh emits aggregate candidates only from currently consent-eligible
  receipts; the authenticated runtime function returns a minimal projection
  after separate privacy, quality, independence, and exploration gates.
- Rank household memory before global candidates. Global candidates begin as
  explainable, reversible suggestions with an exploration budget.
- Require independent household support and holdout precision before learned
  global behavior becomes automatic. Prices, ambiguous quantities/units,
  deletions, missing items, and ambiguous dates remain review-only.
- Keep deterministic invariants separate from learned corrections; they may be
  promoted through tests and evaluation rather than contributor voting.

## Options Considered

### Raw correction counts

Simple and fast, but statistically invalid because repeated events from one user
are correlated and unchanged lazy saves look like positive labels.

### Household-only learning

Strong privacy and personalization, but every new household starts cold and the
same corrections are rediscovered repeatedly.

### Hierarchical household plus governed global intelligence

Adds aggregation and evaluation complexity, but provides immediate cold-start
value while preserving household isolation and independent-evidence semantics.

## Consequences

- Migrations 041–045 add append-only feedback events, rebuildable household
  memory, explicit completion state, validated idempotent RPCs, and a safe
  household-first suggestion projection. Deleting a receipt deletes its feedback
  and derived evidence lineage.
- Historical backfill is dry-run-first and separates legacy support from live
  event support. Global aggregation remains private to the service role, filters
  current receipt consent, and caps each contributor's effective influence.
- Legacy correction tables remain during backfill and compatibility work.
- Review now records suggestion offered, accepted, rejected, and undone outcomes;
  passive saves still do not become explicit field confirmation.
- Independent global candidates are suggestion-only. One-household candidates
  are low-confidence, quality-gated, restricted to a stable 20% cohort, and
  capped at three offers per household per day.
- Confidence must use effective independent support, disagreement, recency,
  context, and holdout results—not a single raw score or correction count.
- Deterministic scan-quality warnings record corrected, dismissed, and unresolved
  outcomes without replacing financial values. Low-review or unresolved-warning
  receipts cannot strengthen global candidates, while service-role monitoring
  tracks store/model/prompt performance and contributor concentration.
- Learned automation is fail-closed. The latest unexpired, versioned holdout
  evaluation must pass the database's scope-specific sample and precision gate;
  the immutable dataset fingerprint makes that decision auditable. Household
  aliases then require strong conflict-free family evidence. Global aliases also
  require independent support from at least three contributors and households.
  The runtime exposes only the correction, reason, and policy version, while a
  service-role view monitors application and undo rates.
- Only item/store aliases are eligible for learned automatic application. The
  review UI makes each application visible and reversible, and records its
  accept/undo provenance. Financial values, ambiguous dates, item presence, and
  destructive changes remain explicit decisions.

## References

- ADR-015 — GPT-4o mini Vision receipt scanning
- ADR-016 — consent-gated receipt model dataset
- ROADMAP Phase 9.1 milestones 1–5 and Phase 10 milestone 6
