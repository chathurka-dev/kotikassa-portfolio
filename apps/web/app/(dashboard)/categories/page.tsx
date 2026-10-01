import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import CategoriesClient from './_components/CategoriesClient'

export const dynamic = 'force-dynamic'

export default async function CategoriesPage() {
  const session = await getServerSession()
  if (!session) redirect('/login')

  const { familyId, supabase } = session

  const [{ data: cats }, { data: counts }] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('family_id', familyId)
      .order('sort_order'),
    supabase
      .from('expense_items')
      .select('category_id')
      .eq('family_id', familyId)
      .not('category_id', 'is', null),
  ])

  const countMap: Record<string, number> = {}
  for (const row of counts ?? []) {
    if (row.category_id) {
      countMap[row.category_id] = (countMap[row.category_id] ?? 0) + 1
    }
  }

  return (
    <CategoriesClient
      initialCategories={cats ?? []}
      itemCounts={countMap}
      familyId={familyId}
    />
  )
}
