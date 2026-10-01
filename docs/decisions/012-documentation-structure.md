# ADR 012 — Documentation Structure: Migrate from PROJECT.md to Industry-Standard Files

**Date:** 2026-06-28
**Status:** Accepted

## Context

The project used a single `PROJECT.md` file as a catch-all for everything: feature checklists, migration history, architecture decisions, setup instructions, and an open questions list. This works while one person is working solo, but creates problems:

- No standard location for setup instructions — a new developer has no obvious starting point
- CHANGELOG mixed with roadmap and schema reference — hard to answer "what changed in v0.7?"
- ADRs buried inline rather than discoverable as individual decision records
- The file becomes a living spec that only the current developer can navigate

## Decision

Split `PROJECT.md` into the standard set of documentation files:

- **`README.md`** — project overview, feature list, tech stack, links to other docs
- **`CHANGELOG.md`** — Keep a Changelog format; one entry per release + [Unreleased]
- **`ROADMAP.md`** — phases with ✅/🔄/⬜ status and per-feature checklists
- **`docs/setup.md`** — full migration runbook and dev setup guide
- **`docs/decisions/NNN-slug.md`** — one ADR per significant technical decision (ADR-010, ADR-011 added this session)

`PROJECT.md` is kept as a historical reference but is no longer the working document.

`CLAUDE.md` updated to point to the split files and to include an explicit end-of-session doc update rule that tells Claude which files to maintain after each session.

## Consequences

- Setup instructions have a canonical home (`docs/setup.md`) — a returning developer or new team member can follow it without reading CLAUDE.md
- CHANGELOG is now a reliable history of what shipped and when
- ADRs are individually linkable and numbered — decisions are findable without grepping a large file
- End-of-session doc maintenance is now a documented, enforceable rule rather than an informal practice
- `PROJECT.md` may diverge from the split files over time — treat the split files as authoritative going forward
