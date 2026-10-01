import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import PeoplePageClient from './_components/PeoplePageClient'

export const dynamic = 'force-dynamic'

export default async function PeoplePage() {
  const session = await getServerSession()
  if (!session) redirect('/login')

  const { familyId, supabase, user } = session

  const [{ data: people }, { data: transactions }, { data: categories }] = await Promise.all([
    supabase.from('people').select('id, name, notes, created_at').eq('family_id', familyId).order('name'),
    supabase.from('people_transactions').select('id, person_id, type, amount, note, transaction_date').eq('family_id', familyId).order('transaction_date', { ascending: false }),
    supabase.from('categories').select('id, name, icon').eq('family_id', familyId).order('sort_order'),
  ])

  return (
    <PeoplePageClient
      initialPeople={people ?? []}
      initialTransactions={transactions ?? []}
      categories={categories ?? []}
      familyId={familyId}
      userId={user.id}
    />
  )
}
