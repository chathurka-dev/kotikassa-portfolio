import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import RecurringClient from './_components/RecurringClient'

export const dynamic = 'force-dynamic'

export default async function RecurringPage() {
  const session = await getServerSession()
  if (!session) redirect('/login')

  const { user, familyId, supabase } = session

  const [{ data: recurring }, { data: categories }] = await Promise.all([
    supabase
      .from('recurring_expenses')
      .select('*')
      .eq('family_id', familyId)
      .order('active', { ascending: false })
      .order('name'),
    supabase
      .from('categories')
      .select('id, name, icon, color')
      .eq('family_id', familyId)
      .order('sort_order'),
  ])

  return (
    <RecurringClient
      initialRecurring={recurring ?? []}
      categories={categories ?? []}
      familyId={familyId}
      userId={user.id}
    />
  )
}
