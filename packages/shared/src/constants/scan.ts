// ============================================================
// /api/scan error codes — single source of truth shared by the
// route (apps/web/app/api/scan/route.ts) and its clients
// (web ReceiptScanner, future mobile scan flow).
// ============================================================

export const SCAN_ERROR_CODES = {
  UNAUTHENTICATED: 'unauthenticated',       // 401
  CONSENT_REQUIRED: 'consent_required',     // 403
  IMAGE_TOO_LARGE: 'image_too_large',       // 413
  UNSUPPORTED_FORMAT: 'unsupported_format', // 415
  UNREADABLE: 'unreadable',                 // 422 — provider rejected the image
  REFUSAL: 'refusal',                       // 422 — model refused
  INCOMPLETE_OUTPUT: 'incomplete_output',   // 422 — hit token limit
  INVALID_OUTPUT: 'invalid_output',         // 422 — schema/Zod failure
  NO_ITEMS: 'no_items',                     // 422 — nothing extracted
  RATE_LIMITED: 'rate_limited',             // 429
  PROVIDER_UNAVAILABLE: 'provider_unavailable', // 503
  UNAVAILABLE: 'unavailable',               // 503 — route misconfigured/unknown
  TIMEOUT: 'timeout',                       // 504
} as const

export type ScanErrorCode = (typeof SCAN_ERROR_CODES)[keyof typeof SCAN_ERROR_CODES]
