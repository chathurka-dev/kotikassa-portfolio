// ============================================================
// Auth middleware -- runs on every request before the page renders.
// Responsibilities:
//   1. Refresh the Supabase session (keeps the user logged in)
//   2. Redirect unauthenticated users to /login
//   3. Redirect authenticated users away from auth pages
// ============================================================
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from './i18n/locales'

const NEXT_INTL_LOCALE_HEADER = 'X-NEXT-INTL-LOCALE'

export async function middleware(request: NextRequest) {
  const localeCookie = request.cookies.get(LOCALE_COOKIE)?.value
  const locale = isLocale(localeCookie) ? localeCookie : DEFAULT_LOCALE
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(NEXT_INTL_LOCALE_HEADER, locale)

  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  const supabase = createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  // Refresh session -- important: do NOT add logic between this and the return
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Public paths that don't require authentication
  const isAuthPath = pathname.startsWith('/login') || pathname.startsWith('/signup')
  const isCallbackPath = pathname.startsWith('/auth/callback')
  const isOnboardPath = pathname.startsWith('/onboard')
  const isPublicPrivacyPath = pathname === '/privacy'
  // /join is public: unauthenticated visitors need to see the family preview
  const isJoinPath = pathname.startsWith('/join')

  if (isCallbackPath || isJoinPath) {
    // Always allow through -- join page handles its own auth state
    return supabaseResponse
  }

  if (!user && !isAuthPath && !isPublicPrivacyPath) {
    // Unauthenticated: redirect to login, preserving full path + query string
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirectTo', pathname + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  if (user && isAuthPath) {
    // Authenticated user visiting login/signup: redirect to dashboard
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/'
    return NextResponse.redirect(dashboardUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Run on all paths except static files, images, and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
