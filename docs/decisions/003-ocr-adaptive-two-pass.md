# ADR 003 — OCR Preprocessor: Adaptive Two-Pass

**Date:** 2026-06-21
**Status:** Superseded by ADR-015

## Context

Initial OCR preprocessing used a single global contrast boost, which worked well on clean, flat receipts but amplified shadows on crumpled real-world receipts — producing garbage output.

Two approaches were evaluated:
- **Pass 1 (global contrast):** Fast, works well on flat/clean receipts
- **Pass 2 (flattenIllumination):** Local background subtraction before contrast; eliminates illumination gradients from shadows and creases

## Decision

Implement an **adaptive two-pass preprocessor** in `packages/ocr/src/preprocessor.ts`:

1. Run Pass 1 (global contrast boost)
2. If confidence < 55 OR 0 items parsed, run Pass 2 (flattenIllumination)
3. Use Pass 2 result only if it produces strictly more items than Pass 1

**Critical order: flatten BEFORE contrast.** Reversing the order re-introduces the shadow amplification problem.

## Consequences

- Crumpled/shadow receipts fixed without regressing clean receipt accuracy
- Slightly higher CPU usage on poor-quality scans (two passes instead of one)
- **Do not revert to single-pass or change the flatten-before-contrast order** without re-running the evaluation suite in `packages/ocr/test/`
