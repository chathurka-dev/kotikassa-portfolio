import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import { getFamily } from '@/lib/family'
import SettingsClient from './_components/SettingsClient'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await getServerSession()
  if (!session) redirect('/login')

  const { user, profile, familyId, supabase } = session

  const [family, { data: members }] = await Promise.all([
    getFamily(),
    supabase
      .from('profiles')
      .select('id, display_name, role')
      .eq('family_id', familyId)
      .order('role'),
  ])

  return (
    <SettingsClient
      userId={user.id}
      userEmail={user.email ?? ''}
      profile={profile}
      family={family!}
      members={members ?? []}
    />
  )
}
