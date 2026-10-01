import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { currentPeriodStart, periodRange, formatPeriod, resolvePeriodParam, resolvePreferences, shiftMonth } from '@kotikassa/shared'
import { getServerSession } from '@/lib/auth'
import BudgetsClient from './_components/BudgetsClient'

export const dynamic = 'force-dynamic'

export default async function BudgetsPage({
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

  const { profile, familyId, supabase } = session
  const budgetStartDay = resolvePreferences(profile?.preferences).budgetStartDay

  const monthStart = resolvePeriodParam(params?.month, budgetStartDay)
  const isCurrentMonth = monthStart === currentPeriodStart(budgetStartDay)
  const { from, to } = periodRange(monthStart, budgetStartDay)
  const previousPeriodStart = periodRange(shiftMonth(monthStart, -1), budgetStartDay).from

  const [
    { data: budgets },
    { data: previousBudgets },
    { data: categories },
    { data: items },
  ] = await Promise.all([
    supabase
      .from('budgets')
      .select('category_id, amount')
      .eq('family_id', familyId)
      .eq('month', from),
    supabase
      .from('budgets')
      .select('category_id, amount')
      .eq('family_id', familyId)
      .eq('month', previousPeriodStart),
    supabase
      .from('categories')
      .select('id, name, icon, color')
      .eq('family_id', familyId)
      .order('sort_order'),
    supabase
      .from('expense_items')
      .select('category_id, amount')
      .eq('family_id', familyId)
      .gte('expense_date', from)
      .lte('expense_date', to),
  ])

  const spendMap: Record<string, number> = {}
  for (const item of items ?? []) {
    if (item.category_id) {
      spendMap[item.category_id] = (spendMap[item.category_id] ?? 0) + Number(item.amount)
    }
  }

  const budgetMap: Record<string, number> = {}
  for (const b of budgets ?? []) {
    budgetMap[b.category_id] = Number(b.amount)
  }
  const previousBudgetMap: Record<string, number> = {}
  for (const b of previousBudgets ?? []) {
    previousBudgetMap[b.category_id] = Number(b.amount)
  }

  return (
    <BudgetsClient
      key={from}
      categories={categories ?? []}
      budgets={budgetMap}
      previousBudgets={previousBudgetMap}
      spending={spendMap}
      familyId={familyId}
      periodStart={from}
      monthLabel={formatPeriod(monthStart, budgetStartDay, locale)}
      currentMonth={monthStart.slice(0, 7)}
      isCurrentMonth={isCurrentMonth}
    />
  )
}
