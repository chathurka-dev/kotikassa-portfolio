import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import InvestmentsClient from './_components/InvestmentsClient'

export const dynamic = 'force-dynamic'

interface ContribRow { id: string; amount: number; note: string | null; contributed_at: string }
interface InvRow {
  id: string
  name: string
  description: string | null
  current_value: number | null
  current_value_date: string | null
  investment_contributions: ContribRow[]
}

export default async function InvestmentsPage() {
  const session = await getServerSession()
  if (!session) redirect('/login')

  const { user, familyId, supabase } = session

  const { data: investments } = await supabase
    .from('investments')
    .select(`
      id, name, description, current_value, current_value_date,
      investment_contributions (
        id, amount, note, contributed_at
      )
    `)
    .eq('family_id', familyId)
    .order('created_at', { ascending: false })

  const shaped = (investments as unknown as InvRow[] ?? []).map((inv) => {
    const contribs = inv.investment_contributions ?? []
    const totalInvested = contribs.reduce((s, c) => s + Number(c.amount), 0)
    return {
      id: inv.id,
      name: inv.name,
      description: inv.description,
      current_value: inv.current_value != null ? Number(inv.current_value) : null,
      current_value_date: inv.current_value_date,
      total_invested: totalInvested,
      contributions: contribs
        .slice()
        .sort((a, b) => b.contributed_at.localeCompare(a.contributed_at)),
    }
  })

  return (
    <InvestmentsClient
      initialInvestments={shaped}
      familyId={familyId}
      userId={user.id}
    />
  )
}
