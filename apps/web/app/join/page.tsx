// /join?token=<token>
// Public landing page for invite links.
// Server component: previews the invite (family name) via SECURITY DEFINER RPC.
// Passes auth state to JoinClient which handles the accept button.
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@kotikassa/shared'
import JoinClient from './_components/JoinClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ token?: string }>
}

export default async function JoinPage({ searchParams }: PageProps) {
  const { token } = await searchParams

  if (!token) redirect('/login')

  const cookieStore = await cookies()
  const supabase = createSupabaseServerClient(cookieStore)

  // Check if user is authenticated (may not have family_id yet)
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch profile separately so we can detect "logged in but no family"
  let familyId: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('family_id')
      .eq('id', user.id)
      .single()
    familyId = profile?.family_id ?? null
  }

  // Preview the invite -- SECURITY DEFINER bypasses RLS so anyone can call this
  const { data: preview } = await supabase
    .rpc('preview_invite', { p_token: token })

  return (
    <JoinClient
      token={token}
      preview={preview as Record<string, string> | null}
      isLoggedIn={!!user}
      hasFamily={!!familyId}
    />
  )
}
