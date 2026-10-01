// ============================================================
// Server-side Supabase client
// Use in Server Components, Route Handlers, and Middleware.
// Must be called inside a request context (cookies available).
// ============================================================
import { createServerClient } from '@supabase/ssr'
import { type ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'

export function createClient(cookieStore: ReadonlyRequestCookies) {
  return createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        // Server components are read-only — cookie setting is a no-op here.
        // The middleware handles token refresh and cookie writing.
        setAll() {},
      },
    }
  )
}
