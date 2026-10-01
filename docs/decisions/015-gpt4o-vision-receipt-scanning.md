# ADR-015 - Replace Tesseract.js with OpenAI Vision Receipt Scanning

**Date:** 2026-07-09
**Revised:** 2026-07-17
**Status:** Accepted - web implemented; evaluation and mobile rollout pending (Phase 9)

## Context

Tesseract.js runs entirely in the browser and has no provider cost, but it has proven unreliable on Finnish thermal receipts. Character errors, lighting and framing differences, and store-specific layouts have produced an open-ended stream of preprocessing and parser rules. Mobile also cannot reuse the browser Canvas/WebWorker pipeline directly.

The options considered were:

| Option | Accuracy | Complexity | Cost |
|---|---|---|---|
| Keep Tesseract + parser rules | Poor | High ongoing maintenance | No provider cost |
| PaddleOCR/Surya on a server | Potentially good | Medium infrastructure | Server cost |
| Train an image-to-JSON model | Potentially excellent | High; needs a diverse labelled dataset | Training + hosting |
| **OpenAI vision through an API route** | **Good candidate now; must pass eval** | **Low-to-medium** | **Usage based** |

## Decision

Replace the active Tesseract + parser extraction path with an authenticated Next.js `/api/scan` route. The initial configured model is GPT-4o mini, selected through `OPENAI_RECEIPT_MODEL` so it can be changed without a code deployment.

The route uses Chat Completions with `store: false`, image input, and strict Structured Outputs (`response_format: json_schema`). The parsed result is also checked with Zod for semantic constraints before it reaches a client.

The top-level result is `{ storeName, receiptDate, totalAmount, items }`. All schema properties are required; genuinely optional values use nullable types, and objects reject additional properties. Item quantity is positive and required, ordinary products default to `1 kpl`, and discount fields are both null when no discount exists. Schema v3 also records nullable `unitPrice` whenever a receipt explicitly prints EUR/kg, EUR/litre or EUR/piece; `amount` remains the final charged product-line total.

The review screen remains mandatory. Nothing extracted by the model is saved automatically.

## Conditional completeness audit

After semantic reconciliation, the API compares the sum of positive purchased
line totals with the printed receipt total in integer cents. A positive shortfall
of at least two cents indicates that the first vision pass may have omitted a
product row. In that case only, the same image receives one focused second pass
that must return the complete receipt again.

The audit is accepted only when it preserves at least the first pass's item count
and reduces the absolute difference against the original printed total. The
original total remains the comparison anchor. Audit failures fall back to the
valid first extraction and are reported to Sentry; they do not prevent manual
review. Overages never trigger the audit because excluded negative receipt
adjustments, such as bottle returns, can legitimately make positive item totals
greater than the final charged amount. This adds cost and latency only to receipts
with evidence of a missing positive line and avoids product-specific hardcoding.

Before the completeness audit, deterministic arithmetic reconcilers handle
specific receipt layouts. For multi-piece rows, a model result is corrected only
when it has an explicit per-piece `unitPrice`, its current amount equals that unit
price, and a unique subset of `quantity x unitPrice` corrections closes the
printed receipt-total shortfall exactly. This prevents historical-price copying
and avoids multiplying line totals that the model already extracted correctly.
Quantity-only rows accidentally emitted as separate products are merged into
their immediately preceding product only when the parsed quantity and unit
agree, the row duplicates or arithmetically explains the preceding line total,
and removing it makes the full item sum equal the printed receipt total.

## Authentication and API boundary

- Web calls use the existing Supabase cookie session.
- Expo calls use `Authorization: Bearer <access_token>` and an absolute `EXPO_PUBLIC_WEB_API_URL`.
- The route validates the JWT, creates a request-scoped Supabase client for that caller, and derives `user_id` and `family_id` from the authenticated profile. It never trusts a client-supplied family ID.
- The route accepts exactly one compressed JPEG, validates its signature, and enforces the application size limit before calling OpenAI.
- A durable Postgres counter/function enforces the family scan limit. The `SECURITY DEFINER` function has a fixed search path, minimal grants, and concurrency tests.

## Image flow

Web and mobile normalize the source image to an orientation-correct JPEG before scanning. The image is compressed once, sent to `/api/scan`, held through review, and uploaded unchanged to Supabase Storage when the user saves. This guarantees that the stored receipt image matches what the model saw. It is only a future model-training candidate when the separate Phase 10 consent rules also make it eligible.

If a web HEIC image cannot be decoded and converted, the app returns a clear unsupported-format error instead of forwarding the original.

## Data and accuracy tracking

The existing `ocr_corrections` and `ocr_receipt_corrections` tables remain and continue to capture changed or deleted model fields. They are useful deltas, but they are not a complete accuracy denominator and cannot represent all missed lines by themselves. Their inserts are awaited so navigation cannot drop them, while a telemetry failure still does not roll back a successfully saved receipt.

Every saved scanned receipt therefore also stores:

- provider, model, prompt version and schema version
- the validated original model JSON
- latency and token usage

The final saved expense rows can then be compared with the original model result, including unchanged items and manually added lines that the model missed.

`expense_items.is_on_receipt` records whether a saved item is visible in the receipt image. It is separate from `is_manual`, which only records provenance. A manually added review item can be a real receipt line that the model missed and must remain eligible for accuracy analysis. `receipt_line_index` preserves deterministic receipt order. Neither field records consent for Kotikassa model development.

## Future dataset foundation and privacy boundary

Phase 9 stores the technical ingredients for a possible future image/label pair:

```
receipts.image_url + confirmed expense_items where is_on_receipt = true
= one receipt image and its user-confirmed ordered JSON label
```

Required export conditions include:

- `receipts.status = 'confirmed'`
- `receipts.image_url IS NOT NULL`
- `expense_items.is_on_receipt = TRUE`
- at least one included expense item
- item order by `receipt_line_index`, with the item ID as a deterministic tie-breaker

Approximately 500 receipts is an initial collection target, not a guarantee of model readiness. Dataset diversity, image quality, label quality and evaluation results determine whether Donut or another document model is viable. The future model choice is intentionally left open.

This technical eligibility is not permission to train on a user's receipt. Phase 10 and ADR-016 therefore own model-development consent, receipt-level consent snapshots, withdrawal/deletion behavior, multi-user export filtering, data minimisation and model evaluation.

The local exporter accepts one explicit receipt/uploader for controller-owned diagnostics or a consent-aware multi-user mode. Multi-user export requires both a current unwithdrawn choice and a matching receipt-level snapshot. It downloads complete JPEGs from the existing private bucket and emits canonical JSONL plus deterministic splits and a failure manifest. Migrations 029–030 provide the required read-only access and consent fields; the service-role key and generated exports remain private and outside Git.

## Mobile

This resolves the OCR question left open by ADR-013. Mobile installs Expo-compatible camera and image-manipulation packages, supports both camera and gallery input, compresses to JPEG, calls the shared route with the Supabase Bearer token, and implements its own React Native review/save experience. It loads categories and item-category memory, uploads the exact scanned image, and writes the same receipt, expense, correction and scan metadata as web.

## Fallback and rollout

There is no runtime Tesseract fallback. If OpenAI is unavailable, the user gets a stable error state and can enter items manually.

The old OCR files remain present but unused while the new web path passes:

1. A labelled 20-30 receipt evaluation covering camera/gallery, 1x/2x framing, rotation, shadows, long receipts, discounts, weighted goods, duplicates and multiple stores.
2. End-to-end scan, review, save and metadata verification.
3. A short real-usage trial with measured accuracy, latency and cost.

Only after those gates pass is `packages/ocr` deleted and its package/configuration references removed. Git history is the rollback path.

## Consequences

- Receipt images are sent to OpenAI and scanning requires internet access.
- OpenAI API data is not used for training by default; applicable abuse-monitoring retention must be disclosed in the app privacy copy.
- Accuracy is not assumed. Strict schemas, semantic validation, evaluation and mandatory review reduce risk.
- Cost is measured from actual token usage and real receipt images; estimates in planning material are not acceptance criteria.
- The browser bundle becomes smaller after Tesseract and its language assets are removed.
- Supabase migrations and additional scan metadata add implementation work, but they make evaluation reproducible and provide a governed foundation for any separately consented Phase 10 dataset.

## Supersession

ADR-002, ADR-003 and ADR-004 are superseded by this decision. ADR-013 records
that its mobile receipt-scanning question is resolved here.

This ADR is authoritative for the OpenAI-scanning design; `ROADMAP.md` Phase 9
tracks rollout status. ADR-016 is authoritative for consented dataset collection
and Kotikassa-owned model evaluation, while Roadmap Phase 10 tracks its delivery.

## References

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI image and vision inputs](https://developers.openai.com/api/docs/guides/images-vision)
- [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data)
