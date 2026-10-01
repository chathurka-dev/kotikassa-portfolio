# ADR-013 — Mobile App: Expo Router + NativeWind, shared package via `/native` entry

**Date:** 2026-07-02
**Status:** Accepted — receipt-scanning approach amended by ADR-015

## Context

The roadmap calls for bringing Kotikassa to iOS/Android with React Native + Expo,
reusing `packages/shared`. Three constraints shaped the design:

1. `packages/shared`'s main entry re-exports the Supabase **server** client, which
   imports `@supabase/ssr` (and transitively Next.js APIs). Metro cannot bundle it.
2. The web app has no server components equivalent on mobile — all data fetching
   must be client-side with `@supabase/supabase-js` directly.
3. `packages/ocr` depends on the browser Canvas API + Tesseract WebWorker; neither
   exists in React Native.

## Decision

- **`apps/mobile`** — Expo SDK 57, Expo Router (file-based routing), TypeScript strict.
- **`@kotikassa/shared/native`** — a second package export (`src/native.ts`) exposing
  types, utils, and constants but **not** the Supabase clients. Mobile must import
  from `@kotikassa/shared/native`, never from the package root.
- **Mobile-owned Supabase client** (`apps/mobile/lib/supabase.ts`) — `supabase-js`
  with AsyncStorage session persistence and AppState-driven token refresh.
  Env vars: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- **NativeWind 4 + Tailwind 3.4** — same utility-class vocabulary as web.
- **i18n** — lightweight context (`lib/i18n.tsx`) reading the same namespace/JSON
  shape as web (`locales/en.json` + `fi.json`, both always).
- **Recurring materialization** — same on-load pattern as web (ADR-008), run from
  dashboard and expenses screens; idempotent via `last_materialized_month`.
- **Receipt scanning initially deferred** — mobile v1 shipped without `/scan`.
  Hidden-WebView Tesseract was rejected as fragile.
- **Receipt scanning amendment (2026-07-30)** — ADR-015 resolves the implementation
  approach. Mobile will capture or select an image, normalize it to JPEG, call the
  authenticated Phase 9 `/api/scan` endpoint with the Supabase bearer token, and
  retain the same JPEG through review, upload, and save.

## Consequences

- Web is unaffected: package root export unchanged; `exports` map adds `./native`.
- Mobile auth is email/password only for now — Google OAuth needs deep-link +
  Google console config (follow-up).
- Charts are plain colored progress bars (no Recharts equivalent pulled in yet).
- Mobile scanning reuses the web API contract and model telemetry instead of
  embedding a separate OCR engine.
- Push notifications, EAS builds, offline queue: future phases.
