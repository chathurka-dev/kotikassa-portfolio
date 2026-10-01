import { cache } from 'react'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@kotikassa/shared'

/**
 * Returns the current session -- user, profile, familyId, and a supabase client.
 *
 * Wrapped in React cache() so both the dashboard layout and the page component
 * can call this freely; the underlying getUser() + profile query only hits the
 * DB once per server render, not once per caller.
 *
 * Returns null when: (a) not authenticated, or (b) authenticated but no family yet.
 * The dashboard layout distinguishes these via redirect('/onboard') so that
 * new Google OAuth users don't get caught in a login redirect loop.
 */
export const getServerSession = cache(async () => {
  const cookieStore = await cookies()
  const supabase = createSupabaseServerClient(cookieStore)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('family_id, display_name, role, preferences')
    .eq('id', user.id)
    .single()

  if (!profile?.family_id) return null

  return {
    user,
    profile,
    familyId: profile.family_id as string,
    supabase,
  }
})
