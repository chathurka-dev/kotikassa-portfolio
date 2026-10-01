// ============================================================
// Browser Supabase client
// Use in Client Components ("use client") only.
// Creates one instance per browser tab (singleton pattern).
// ============================================================
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // These env vars are public (NEXT_PUBLIC_) and safe to expose in the browser.
  // They are read-only API keys — actual data access is controlled by RLS.
  return createBrowserClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!
  )
}
