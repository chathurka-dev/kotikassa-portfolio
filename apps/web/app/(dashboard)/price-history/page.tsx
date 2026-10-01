import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import PriceHistoryClient from './_components/PriceHistoryClient'

export const dynamic = 'force-dynamic'

export interface PriceHistorySuggestion {
  name: string
  count: number
  lastPrice: number
  lastQuantity: number | null
  lastUnit: string | null
}

export default async function PriceHistoryPage() {
  const session = await getServerSession()
  if (!session) redirect('/login')

  const { familyId, supabase } = session

  const { data: history } = await supabase
    .from('expense_items')
    .select('name, amount, quantity, unit, expense_date')
    .eq('family_id', familyId)
    .order('expense_date', { ascending: false })
    .limit(5000)

  const countMap = new Map<string, PriceHistorySuggestion>()
  for (const row of history ?? []) {
    const key = (row.name ?? '').trim().toLowerCase()
    if (!key) continue
    const existing = countMap.get(key)
    if (existing) {
      existing.count += 1
    } else {
      countMap.set(key, {
        name: row.name.trim(),
        count: 1,
        lastPrice: row.amount,
        lastQuantity: (row.quantity as number | null) ?? null,
        lastUnit: (row.unit as string | null) ?? null,
      })
    }
  }
  const suggestions = Array.from(countMap.values()).sort((a, b) => b.count - a.count)

  return <PriceHistoryClient familyId={familyId} suggestions={suggestions} />
}
