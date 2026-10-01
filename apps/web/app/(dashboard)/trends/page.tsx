import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { getServerSession } from '@/lib/auth'
import { formatMonth, formatPeriod, currentPeriodStart, periodRange, shiftMonth, resolvePreferences } from '@kotikassa/shared'
import TrendsClient, { type TrendPoint } from './_components/TrendsClient'

export const dynamic = 'force-dynamic'

// ── helpers ──────────────────────────────────────────────────────────────────

function isoWeekKey(dateStr: string): string {
  const date = new Date(dateStr)
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function mondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

// ── page ─────────────────────────────────────────────────────────────────────

export default async function TrendsPage() {
  const [locale, session] = await Promise.all([
    getLocale() as Promise<'en' | 'fi'>,
    getServerSession(),
  ])
  if (!session) redirect('/login')

  const { profile, familyId, supabase } = session
  const budgetStartDay = resolvePreferences(profile?.preferences).budgetStartDay

  // ── date ranges ────────────────────────────────────────────────────────────
  const now = new Date()

  // Monthly: 6 consecutive budget periods (ADR-014), anchored on the current period so
  // totals here match the dashboard/expenses/income/budgets pages for the same "month".
  const currentAnchor = currentPeriodStart(budgetStartDay).slice(0, 7)
  const periods = Array.from({ length: 6 }, (_, i) => {
    const anchor = shiftMonth(`${currentAnchor}-01`, -(5 - i)).slice(0, 7)
    const { from, to } = periodRange(`${anchor}-01`, budgetStartDay)
    const label = budgetStartDay <= 1
      ? formatMonth(`${anchor}-01`, locale).replace(/\s\d{4}$/, '').trim() // strip year for brevity
      : formatPeriod(`${anchor}-01`, budgetStartDay, locale)
    return { key: anchor, from, to, label }
  })
  const monthlyFromStr = periods[0]!.from
  const monthlyToStr = periods[periods.length - 1]!.to

  // Weekly: Monday of 7 weeks ago → Sunday of current week
  const thisMonday = mondayOf(now)
  const weeklyFromDate = new Date(thisMonday)
  weeklyFromDate.setDate(weeklyFromDate.getDate() - 7 * 7)
  const weeklyFromStr = weeklyFromDate.toISOString().slice(0, 10)
  // Cover through end of current week
  // Widest range covers both
  const globalFrom = monthlyFromStr < weeklyFromStr ? monthlyFromStr : weeklyFromStr

  // ── single fetch covers both ranges ────────────────────────────────────────
  const [{ data: expenses }, { data: incomes }] = await Promise.all([
    supabase
      .from('expense_items')
      .select('amount, expense_date')
      .eq('family_id', familyId)
      .gte('expense_date', globalFrom)
      .lte('expense_date', monthlyToStr),
    supabase
      .from('income_entries')
      .select('amount, income_date')
      .eq('family_id', familyId)
      .gte('income_date', globalFrom)
      .lte('income_date', monthlyToStr),
  ])

  // ── build monthly buckets (6 budget periods) ───────────────────────────────
  const monthlyData: TrendPoint[] = periods.map(({ key, label }) => ({ key, label, income: 0, expenses: 0, net: 0 }))

  function periodKeyFor(dateStr: string): string | undefined {
    return periods.find(p => dateStr >= p.from && dateStr <= p.to)?.key
  }

  for (const e of expenses ?? []) {
    const key = periodKeyFor(e.expense_date as string)
    const pt = monthlyData.find(p => p.key === key)
    if (pt) pt.expenses += Number(e.amount)
  }
  for (const e of incomes ?? []) {
    const key = periodKeyFor(e.income_date as string)
    const pt = monthlyData.find(p => p.key === key)
    if (pt) pt.income += Number(e.amount)
  }
  monthlyData.forEach(p => { p.net = p.income - p.expenses })

  // ── build weekly buckets (8 weeks) ─────────────────────────────────────────
  const weeklyData: TrendPoint[] = []
  for (let i = 7; i >= 0; i--) {
    const monday = new Date(thisMonday)
    monday.setDate(monday.getDate() - i * 7)
    const sunday = new Date(monday)
    sunday.setDate(sunday.getDate() + 6)
    const key = isoWeekKey(monday.toISOString().slice(0, 10))
    const weekNum = key.split('-W')[1]
    weeklyData.push({
      key,
      label: `W${weekNum}`,
      income: 0,
      expenses: 0,
      net: 0,
      start: monday.toISOString().slice(0, 10),
      end: sunday.toISOString().slice(0, 10),
    })
  }

  for (const e of expenses ?? []) {
    const key = isoWeekKey(e.expense_date as string)
    const pt = weeklyData.find(p => p.key === key)
    if (pt) pt.expenses += Number(e.amount)
  }
  for (const e of incomes ?? []) {
    const key = isoWeekKey(e.income_date as string)
    const pt = weeklyData.find(p => p.key === key)
    if (pt) pt.income += Number(e.amount)
  }
  weeklyData.forEach(p => { p.net = p.income - p.expenses })

  return <TrendsClient monthlyData={monthlyData} weeklyData={weeklyData} />
}
