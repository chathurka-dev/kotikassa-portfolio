# ADR 002 — OCR Engine: Tesseract.js

**Date:** 2026-06-16
**Status:** Superseded by ADR-015

## Context

The app needs to extract text from Finnish grocery receipts. Options considered:
- Cloud OCR APIs (Google Vision, AWS Textract, Azure AI)
- Tesseract.js (open-source, runs in browser)

## Decision

Use **Tesseract.js** running in a browser WebWorker with Finnish (`fin`) and English (`eng`) language packs.

## Consequences

- **Running cost: EUR 0/month** — no per-scan API fees
- Works offline; no receipt images leave the user's browser during OCR
- Finnish language pack gives good accuracy on S-Market, K-Market, Lidl, Prisma receipts
- Slower than cloud APIs on first load (WASM initialisation); subsequent scans are fast
- Accuracy on severely crumpled or shadowed receipts is lower than cloud APIs — mitigated by the adaptive two-pass preprocessor (see ADR 003)
