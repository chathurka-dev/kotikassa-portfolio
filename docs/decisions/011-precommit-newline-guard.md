# ADR 011 — Pre-commit Hook: Newline Guard for .tsx/.ts Files

**Date:** 2026-06-28
**Status:** Accepted

## Context

The Edit tool (used by AI assistants on Windows NTFS) silently truncates `.tsx`/`.ts` files when the replacement content is longer than the original — the file is cut mid-character with no error. The truncated file always ends without a newline.

This was discovered when multiple source files were silently corrupted during editing sessions, producing phantom TypeScript errors (`TS1002`, `TS1005`) that disappeared when the file was read with the Read tool (which showed the intact Windows file, not the stale bash-mount copy).

## Decision

Add a **pre-commit hook** (via Husky) that rejects any staged `.tsx`/`.ts` file not ending with a newline character.

All AI-assisted editing of source files must use Python via bash (`open(path, 'w', encoding='utf-8')`) instead of the Edit tool. Python's write never truncates.

The rule is documented in `CLAUDE.md` as a non-negotiable constraint.

## Consequences

- Truncated files are caught at commit time rather than silently pushed and discovered later
- All `.tsx`/`.ts` files must end with a newline — this aligns with standard POSIX file conventions and most linters anyway
- The bash mount may show stale/truncated copies of files not edited in the current session; always use the Read tool (Windows `D:\` path) as the source of truth for file contents
