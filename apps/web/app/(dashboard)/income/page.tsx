import { currentPeriodStart, periodRange, formatPeriod, resolvePeriodParam, resolvePreferences } from '@kotikassa/shared'
import { getLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import IncomePageClient from './_components/IncomePageClient'

export const dynamic = 'force-dynamic'

export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const [params, locale, session] = await Promise.all([
    searchParams,
    getLocale() as Promise<'en' | 'fi'>,
    getServerSession(),
  ])
  if (!session) redirect('/login')

  const { user, profile, familyId, supabase } = session
  const budgetStartDay = resolvePreferences(profile?.preferences).budgetStartDay

  const monthStart = resolvePeriodParam(params?.month, budgetStartDay)
  const currentMonth = monthStart.slice(0, 7)
  const isCurrentMonth = monthStart === currentPeriodStart(budgetStartDay)
  const { from, to } = periodRange(monthStart, budgetStartDay)

  const [{ data: income }, { data: customSources }] = await Promise.all([
    supabase
      .from('income_entries')
      .select('*')
      .eq('family_id', familyId)
      .gte('income_date', from)
      .lte('income_date', to)
      .order('income_date', { ascending: false }),
    supabase
      .from('family_income_sources')
      .select('id, name')
      .eq('family_id', familyId)
      .order('name'),
  ])

  return (
    <IncomePageClient
      key={currentMonth}
      initialEntries={income ?? []}
      initialCustomSources={customSources ?? []}
      familyId={familyId}
      userId={user.id}
      monthLabel={formatPeriod(monthStart, budgetStartDay, locale)}
      currentMonth={currentMonth}
      isCurrentMonth={isCurrentMonth}
    />
  )
}
