# ADR-016 - Consent-Gated Receipt Model Dataset

**Date:** 2026-07-12
**Status:** Accepted - consent foundation implemented (Phase 10)

## Context

Phase 9 stores receipt images, confirmed labels and model telemetry for the
budgeting service and scanner accuracy analysis. Those technical records do not
provide a lawful or user-understandable permission to develop a Kotikassa-owned
receipt model. Receipt scanning through OpenAI and reusing saved receipts for
Kotikassa model development are separate purposes.

A required Privacy Notice checkbox would mix notice delivery with optional
model-development consent. Asking at signup would also occur before the user has
seen the receipt review workflow they are being asked to improve.

## Decision

- Present and version the Privacy Notice without requiring an "I agree" checkbox.
- Keep OpenAI receipt-scanning consent separate and optional.
- Show an unselected **Allow / Not now** choice after eligible scans 1, 5 and 20,
  then stop. **Not now** permits the next scheduled prompt; explicit withdrawal
  prevents all future prompts. Declining does not affect any app feature.
- Atomically record each prompt view with its version, timestamp and eligible-scan
  count. This keeps silent dismissal separate from **Not now** and withdrawal.
- Keep the prompt to three short sentences and point users to
  **Settings → Privacy**, where the control becomes visible after the first view.
- "Allow" covers that explicitly identified saved receipt plus future eligible
  receipts. A later Settings opt-in covers future receipts only; older receipts
  are never included retroactively without a separate explicit choice.
- Record the current user choice, version, database timestamp and withdrawal
  timestamp in `user_privacy_choices`.
- Snapshot valid consent onto each eligible `receipts` row. Item-level
  `is_on_receipt` remains a label-quality field and is never consent by itself.
- A production multi-user export requires both a current unwithdrawn user choice
  and a matching receipt-level snapshot. Explicit receipt/uploader selectors are
  retained only for controller-owned development tests.
- Withdrawal marks all of the uploader's saved receipts ineligible for newly
  generated datasets. Existing generated datasets and trained models require the
  separate deletion/withdrawal operating procedure tracked in Phase 10.

## Consequences

- Consent failures cannot lose a receipt because the financial save completes
  before the choice is requested.
- "Not asked," "shown," "Not now," "allowed" and "withdrawn" remain
  distinguishable and auditable.
- Follow-up prompts are limited to three views and spaced across meaningful use,
  avoiding both permanent loss after a distracted dismissal and repeated pressure.
- Multi-user export is safer but intentionally yields fewer samples than assuming
  permission from receipt-scanning use.
- Privacy Notice and consent-version changes must be coordinated with exporter
  eligibility rules.
- Model training remains blocked until minimisation, generated-dataset deletion,
  model evaluation and final legal review steps in Phase 10 are complete.

## References

- GDPR Article 7: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
- EDPB consent guidance: https://www.edpb.europa.eu/system/files/2026-04/edpb-summary-consent_en.pdf
- EDPB Opinion 28/2024 on AI models: https://www.edpb.europa.eu/documents/opinion-of-the-board-art-64/opinion-282024-on-certain-data-protection-aspects-related-to_en
