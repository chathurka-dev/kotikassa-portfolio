# ADR 004 — Deskew: OFF by Default

**Date:** 2026-06-21
**Status:** Superseded by ADR-015

## Context

Receipt photos taken at slight angles could theoretically benefit from deskewing before OCR. Deskew was implemented and evaluated against a set of real receipt photos.

## Decision

Set `ENABLE_DESKEW=false` (off by default).

## Consequences

- On roughly-square shots, resampling blur from deskewing loses as many OCR items as skew would have caused
- Tesseract 4 natively tolerates angles up to ~5 degrees without deskewing
- **Do not re-enable deskew** without first re-running `packages/ocr/test/deskew-eval.py` against the current test set and confirming a net improvement
