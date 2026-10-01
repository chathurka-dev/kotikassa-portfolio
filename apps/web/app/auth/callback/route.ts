// Handles the redirect after email confirmation and OAuth login.
// Supabase sends the user here after they click the confirmation link.
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { PRIVACY_NOTICE_VERSION } from '@kotikassa/shared'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const requestedNext = searchParams.get('next') ?? '/'
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//')
    ? requestedNext
    : '/'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env['NEXT_PUBLIC_SUPABASE_URL']!,
      process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: choice } = await supabase
          .from('user_privacy_choices')
          .select('privacy_notice_version')
          .eq('user_id', user.id)
          .maybeSingle()

        if (choice?.privacy_notice_version !== PRIVACY_NOTICE_VERSION) {
          const consentUrl = new URL('/privacy/consent', origin)
          consentUrl.searchParams.set('next', next.startsWith('/privacy/consent') ? '/' : next)
          return NextResponse.redirect(consentUrl)
        }
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Something went wrong — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
