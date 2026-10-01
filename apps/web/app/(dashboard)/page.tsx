import { redirect } from 'next/navigation'
import {
  currentMonthStart, periodRange, formatPeriod, resolvePeriodParam, currentPeriodStart, resolvePreferences,
  formatCurrency,
  MATERIALIZE_TEMPLATE_COLUMNS, isRecurringTemplateDue, buildRecurringExpenseRow,
} from '@kotikassa/shared'
import { getLocale, getTranslations } from 'next-intl/server'
import { getServerSession } from '@/lib/auth'
import { getFamily } from '@/lib/family'
import MonthlyChart from './_components/MonthlyChart'
import RecentExpenses from './_components/RecentExpenses'
import DashboardMonthNav from './_components/DashboardMonthNav'
import BudgetSummary from './_components/BudgetSummary'

export const dynamic = 'force-dynamic'

interface ExpenseCat { name: string; icon: string; color: string; is_fixed: boolean }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const [params, t, locale, session] = await Promise.all([
    searchParams,
    getTranslations('dashboard'),
    getLocale() as Promise<'en' | 'fi'>,
    getServerSession(),
  ])

  if (!session) redirect('/login')

  const { user, profile, familyId, supabase } = session
  const budgetStartDay = resolvePreferences(profile?.preferences).budgetStartDay

  const monthStart = resolvePeriodParam(params?.month, budgetStartDay)
  const currentMonth = monthStart.slice(0, 7)
  // isCurrentPeriod — used for budget alerts query, forward-nav guard, and to decide whether
  // to run recurring materialization at all (skip it while browsing a past period).
  const isCurrentPeriod = monthStart === currentPeriodStart(budgetStartDay)

  const { from, to } = periodRange(monthStart, budgetStartDay)

  // Materialize recurring expenses for the true current calendar month before fetching
  // expenses. ADR-014: materialization stays calendar-month-based (ADR-008's
  // last_materialized_month guard is a calendar-month key) even when the user's budget
  // period is offset — so this must use currentMonthStart(), never the period anchor.
  if (isCurrentPeriod) {
    const nowCalendarMonth = currentMonthStart().slice(0, 7)
    const { data: allTemplates } = await supabase
      .from('recurring_expenses')
      .select(MATERIALIZE_TEMPLATE_COLUMNS)
      .eq('family_id', familyId)
      .eq('active', true)
      .or(`last_materialized_month.is.null,last_materialized_month.neq.${nowCalendarMonth}`)
    const templates = (allTemplates ?? []).filter(t => isRecurringTemplateDue(t, nowCalendarMonth))

    if (templates.length > 0) {
      const { error: insertErr } = await supabase.from('expense_items').insert(
        templates.map(t => buildRecurringExpenseRow(t, familyId, user.id, nowCalendarMonth))
      )
      if (insertErr) {
        console.error('[recurring] materialization insert failed:', insertErr.message)
      } else {
        await supabase
          .from('recurring_expenses')
          .update({ last_materialized_month: nowCalendarMonth })
          .in('id', templates.map(t => t.id))
      }
    }
  }

  // Fetch all data in parallel now that materialization is done.
  const [
    { data: expensesRaw },
    { data: incomeRaw },
    { data: savingsRaw },
    { data: investmentsRaw },
    { data: savingContribsRaw },
    { data: investContribsRaw },
    { data: budgetRows },
  ] = await Promise.all([
    supabase
      .from('expense_items')
      .select('id, amount, quantity, unit, category_id, name, expense_date, categories(name, icon, color, is_fixed)')
      .eq('family_id', familyId)
      .gte('expense_date', from)
      .lte('expense_date', to)
      .order('expense_date', { ascending: false }),
    supabase
      .from('income_entries')
      .select('amount')
      .eq('family_id', familyId)
      .gte('income_date', from)
      .lte('income_date', to),
    supabase
      .from('savings_goals')
      .select('current_amount')
      .eq('family_id', familyId),
    supabase
      .from('investments')
      .select('current_value, investment_contributions(amount)')
      .eq('family_id', familyId),
    supabase
      .from('savings_contributions')
      .select('amount, transaction_type')
      .eq('family_id', familyId)
      .gte('contributed_at', from)
      .lte('contributed_at', to),
    supabase
      .from('investment_contributions')
      .select('amount')
      .eq('family_id', familyId)
      .gte('contributed_at', from)
      .lte('contributed_at', to),
    supabase
      .from('budgets')
      .select('category_id, amount')
      .eq('family_id', familyId)
      .eq('month', from),
  ])

  // Normalize the Supabase join (returns array) to a single object
  const expenses = (expensesRaw ?? []).map((e) => {
    const catRaw = e.categories as unknown as ExpenseCat[] | ExpenseCat | null
    const cat: ExpenseCat | null = Array.isArray(catRaw) ? (catRaw[0] ?? null) : catRaw
    return {
      id: e.id, name: e.name, amount: e.amount,
      quantity: (e.quantity as number | null) ?? null,
      unit: (e.unit as string | null) ?? null,
      expense_date: e.expense_date,
      category_id: e.category_id,
      categories: cat,
    }
  })

  const totalSpent = expenses.reduce((sum: number, e) => sum + e.amount, 0)
  const fixedTotal = expenses.reduce((sum: number, e) => sum + (e.categories?.is_fixed ? e.amount : 0), 0)
  const variableTotal = totalSpent - fixedTotal
  const totalIncome = (incomeRaw ?? []).reduce((sum: number, e) => sum + e.amount, 0)

  const totalSavings = (savingsRaw ?? []).reduce((s: number, g) => s + Number(g.current_amount ?? 0), 0)
  const totalInvestmentValue = (investmentsRaw ?? []).reduce((s: number, inv) => {
    if (inv.current_value != null) return s + Number(inv.current_value)
    const contribs = (inv.investment_contributions as { amount: number }[]) ?? []
    return s + contribs.reduce((cs: number, c) => cs + Number(c.amount), 0)
  }, 0)
  const netWorth = totalSavings + totalInvestmentValue

  const totalSavedThisMonth = (savingContribsRaw ?? [])
    .filter((c) => c.transaction_type !== 'withdrawal')
    .reduce((s: number, c) => s + Number(c.amount), 0)
  const totalWithdrawnThisMonth = (savingContribsRaw ?? [])
    .filter((c) => c.transaction_type === 'withdrawal')
    .reduce((s: number, c) => s + Number(c.amount), 0)
  const totalInvestedThisMonth = (investContribsRaw ?? []).reduce((s: number, c) => s + Number(c.amount), 0)
  const freeCashFlow = totalIncome - totalSpent - totalSavedThisMonth - totalInvestedThisMonth + totalWithdrawnThisMonth

  // Spending by category for pie chart
  const categoryTotals: Record<string, { name: string; icon: string; color: string; is_fixed: boolean; total: number; categoryId: string | null }> = {}
  for (const expense of expenses) {
    const cat = expense.categories
    const key = cat?.name ?? 'Uncategorized'
    if (!categoryTotals[key]) {
      categoryTotals[key] = {
        name: key,
        icon: cat?.icon ?? '\u{1F4E6}',
        color: cat?.color ?? '#6b7280',
        is_fixed: cat?.is_fixed ?? false,
        total: 0,
        categoryId: expense.category_id,
      }
    }
    categoryTotals[key]!.total += expense.amount
  }
  const chartData = Object.values(categoryTotals).sort((a, b) => b.total - a.total)

  const recent = expenses.slice(0, 8)

  // Budget alerts
  const spendByCatId: Record<string, number> = {}
  const catInfoById: Record<string, { name: string; icon: string; color: string }> = {}
  for (const e of expenses) {
    if (!e.category_id) continue
    spendByCatId[e.category_id] = (spendByCatId[e.category_id] ?? 0) + e.amount
    if (e.categories) catInfoById[e.category_id] = { name: e.categories.name, icon: e.categories.icon, color: e.categories.color }
  }
  const budgetAlerts = (budgetRows ?? [])
    .map((b) => {
      const cat = catInfoById[b.category_id]
      const spent = spendByCatId[b.category_id] ?? 0
      const limit = Number(b.amount)
      const pct = (spent / limit) * 100
      return { categoryId: b.category_id, name: cat?.name ?? '', icon: cat?.icon ?? '\u{1F4E6}', color: cat?.color ?? '#6b7280', spent, limit, pct }
    })
    .filter((a) => a.pct >= 80)
    .sort((a, b) => b.pct - a.pct)

  const family = await getFamily()
  const currency = family?.currency ?? 'EUR'
  const fc = (amount: number) => formatCurrency(amount, currency)

  const monthLabel = formatPeriod(monthStart, budgetStartDay, locale)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <DashboardMonthNav
          monthLabel={monthLabel}
          currentMonth={currentMonth}
          isCurrentMonth={isCurrentPeriod}
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="card p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            {t('spentThisMonth')}
          </div>
          <div className="text-2xl font-bold text-gray-900">{fc(totalSpent)}</div>
          <div className="mt-2 flex flex-col gap-0.5">
            <span className="text-xs text-gray-400">
              <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />
              {t('fixed')}: {fc(fixedTotal)}
            </span>
            <span className="text-xs text-gray-400">
              <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 mr-1" />
              {t('variable')}: {fc(variableTotal)}
            </span>
          </div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            {t('incomeThisMonth')}
          </div>
          <div className="text-2xl font-bold text-green-600">{fc(totalIncome)}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            {t('freeCashFlow')}
          </div>
          <div className={`text-2xl font-bold ${freeCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {fc(freeCashFlow)}
          </div>
          {(totalSavedThisMonth > 0 || totalWithdrawnThisMonth > 0 || totalInvestedThisMonth > 0) && (
            <div className="mt-1 flex flex-col gap-0.5">
              {totalSavedThisMonth > 0 && (
                <span className="text-xs text-gray-400">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1" />
                  {t('afterSaving', { amount: fc(totalSavedThisMonth) })}
                </span>
              )}
              {totalInvestedThisMonth > 0 && (
                <span className="text-xs text-gray-400">
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 mr-1" />
                  {t('afterInvesting', { amount: fc(totalInvestedThisMonth) })}
                </span>
              )}
              {totalWithdrawnThisMonth > 0 && (
                <span className="text-xs text-gray-400">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />
                  {t('afterWithdrawal', { amount: fc(totalWithdrawnThisMonth) })}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="card p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            {t('netWorth')}
          </div>
          <div className="text-2xl font-bold text-indigo-600">{fc(netWorth)}</div>
          <div className="text-xs text-gray-400 mt-1">
            {t('netWorthHint', { savings: fc(totalSavings), investments: fc(totalInvestmentValue) })}
          </div>
        </div>
      </div>

      {/* Budget alerts */}
      {budgetAlerts.length > 0 && <BudgetSummary alerts={budgetAlerts} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending chart */}
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">{t('spendingByCategory')}</h2>
          {chartData.length > 0 ? (
            <MonthlyChart
              data={chartData}
              fixedTotal={fixedTotal}
              variableTotal={variableTotal}
              familyId={familyId}
              currentMonth={currentMonth}
              budgetStartDay={budgetStartDay}
            />
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400">
              {t('noExpenses')}
            </div>
          )}
        </div>

        {/* Recent expenses */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">{t('recentExpenses')}</h2>
            <a href={`/expenses?month=${currentMonth}`} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
              {t('viewAll')}
            </a>
          </div>
          <RecentExpenses expenses={recent} />
        </div>
      </div>
    </div>
  )
}
