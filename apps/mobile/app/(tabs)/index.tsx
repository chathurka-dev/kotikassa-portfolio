// Dashboard — mirrors apps/web/app/(dashboard)/page.tsx.
// Client-side fetch (no server components on mobile); recurring
// materialization runs before the expense fetch for the current month.
import { useCallback, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { currentMonthStart, currentPeriodStart, periodRange, resolvePreferences, formatDate } from '@kotikassa/shared/native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { useFormatCurrency } from '@/lib/currency-context'
import { materializeRecurring } from '@/lib/recurring'
import { useFocusRefresh } from '@/lib/use-focus-refresh'
import { useT } from '@/lib/i18n'
import { Card, EmptyState } from '@/components/ui'
import { MonthNav } from '@/components/MonthNav'

interface ExpenseCat { name: string; icon: string; color: string; is_fixed: boolean }
interface DashExpense {
  id: string
  name: string
  amount: number
  expense_date: string
  category_id: string | null
  categories: ExpenseCat | null
}
interface CategorySlice {
  name: string
  icon: string
  color: string
  total: number
}
interface BudgetAlert {
  categoryId: string
  name: string
  icon: string
  spent: number
  limit: number
  pct: number
}

interface DashData {
  totalSpent: number
  fixedTotal: number
  variableTotal: number
  totalIncome: number
  freeCashFlow: number
  totalSavedThisMonth: number
  totalInvestedThisMonth: number
  netWorth: number
  totalSavings: number
  totalInvestmentValue: number
  chartData: CategorySlice[]
  recent: DashExpense[]
  budgetAlerts: BudgetAlert[]
}

function normalizeCat(raw: unknown): ExpenseCat | null {
  if (Array.isArray(raw)) return (raw[0] as ExpenseCat | undefined) ?? null
  return (raw as ExpenseCat | null) ?? null
}

export default function DashboardScreen() {
  const t = useT('dashboard')
  const { session, familyId, profile } = useAuth()
  const userId = session?.user.id
  const fmt = useFormatCurrency()
  const budgetStartDay = useMemo(
    () => resolvePreferences(profile?.preferences).budgetStartDay,
    [profile?.preferences]
  )
  const [monthStart, setMonthStart] = useState(() => currentPeriodStart(budgetStartDay))
  const [data, setData] = useState<DashData | null>(null)

  const currentMonth = monthStart.slice(0, 7)
  const isCurrentPeriod = monthStart === currentPeriodStart(budgetStartDay)

  const load = useCallback(async (isStale: () => boolean) => {
    if (!familyId || !userId) return
    const { from, to } = periodRange(monthStart, budgetStartDay)

    if (isCurrentPeriod) {
      // ADR-014: materialization stays calendar-month-based even when the user's
      // budget period is offset — never pass the period-anchor month here.
      await materializeRecurring(familyId, userId, currentMonthStart().slice(0, 7))
    }

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
        .select('id, amount, category_id, name, expense_date, categories(name, icon, color, is_fixed)')
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
      supabase.from('savings_goals').select('current_amount').eq('family_id', familyId),
      supabase
        .from('investments')
        .select('current_value, investment_contributions(amount)')
        .eq('family_id', familyId),
      supabase
        .from('savings_contributions')
        .select('amount')
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

    const expenses: DashExpense[] = (expensesRaw ?? []).map((e) => ({
      id: e.id as string,
      name: e.name as string,
      amount: Number(e.amount),
      expense_date: e.expense_date as string,
      category_id: (e.category_id as string | null) ?? null,
      categories: normalizeCat(e.categories),
    }))

    const totalSpent = expenses.reduce((s, e) => s + e.amount, 0)
    const fixedTotal = expenses.reduce((s, e) => s + (e.categories?.is_fixed ? e.amount : 0), 0)
    const totalIncome = (incomeRaw ?? []).reduce((s, e) => s + Number(e.amount), 0)
    const totalSavings = (savingsRaw ?? []).reduce((s, g) => s + Number(g.current_amount ?? 0), 0)
    const totalInvestmentValue = (investmentsRaw ?? []).reduce((s, inv) => {
      if (inv.current_value != null) return s + Number(inv.current_value)
      const contribs = (inv.investment_contributions as { amount: number }[] | null) ?? []
      return s + contribs.reduce((cs, c) => cs + Number(c.amount), 0)
    }, 0)
    const totalSavedThisMonth = (savingContribsRaw ?? []).reduce((s, c) => s + Number(c.amount), 0)
    const totalInvestedThisMonth = (investContribsRaw ?? []).reduce((s, c) => s + Number(c.amount), 0)

    // Spending by category
    const catTotals: Record<string, CategorySlice> = {}
    const spendByCatId: Record<string, number> = {}
    const catInfoById: Record<string, { name: string; icon: string }> = {}
    for (const e of expenses) {
      const key = e.categories?.name ?? 'Uncategorized'
      if (!catTotals[key]) {
        catTotals[key] = {
          name: key,
          icon: e.categories?.icon ?? '\u{1F4E6}',
          color: e.categories?.color ?? '#6b7280',
          total: 0,
        }
      }
      catTotals[key].total += e.amount
      if (e.category_id) {
        spendByCatId[e.category_id] = (spendByCatId[e.category_id] ?? 0) + e.amount
        if (e.categories) catInfoById[e.category_id] = { name: e.categories.name, icon: e.categories.icon }
      }
    }

    const budgetAlerts: BudgetAlert[] = (budgetRows ?? [])
      .map((b) => {
        const spent = spendByCatId[b.category_id] ?? 0
        const limit = Number(b.amount)
        return {
          categoryId: b.category_id as string,
          name: catInfoById[b.category_id]?.name ?? '',
          icon: catInfoById[b.category_id]?.icon ?? '\u{1F4E6}',
          spent,
          limit,
          pct: (spent / limit) * 100,
        }
      })
      .filter((a) => a.pct >= 80)
      .sort((a, b) => b.pct - a.pct)

    if (isStale()) return
    setData({
      totalSpent,
      fixedTotal,
      variableTotal: totalSpent - fixedTotal,
      totalIncome,
      freeCashFlow: totalIncome - totalSpent - totalSavedThisMonth - totalInvestedThisMonth,
      totalSavedThisMonth,
      totalInvestedThisMonth,
      netWorth: totalSavings + totalInvestmentValue,
      totalSavings,
      totalInvestmentValue,
      chartData: Object.values(catTotals).sort((a, b) => b.total - a.total),
      recent: expenses.slice(0, 8),
      budgetAlerts,
    })
  }, [familyId, userId, monthStart, currentMonth, isCurrentPeriod, budgetStartDay])

  const { refreshing, onRefresh } = useFocusRefresh(load)

  const maxCat = data?.chartData[0]?.total ?? 0

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView
        contentContainerClassName="p-4 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-2xl font-bold text-gray-900">{t('title')}</Text>
          <MonthNav monthStart={monthStart} onChange={setMonthStart} startDay={budgetStartDay} />
        </View>

        {/* Summary cards */}
        <View className="flex-row flex-wrap -m-1 mb-3">
          <View className="w-1/2 p-1">
            <Card>
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                {t('spentThisMonth')}
              </Text>
              <Text className="text-xl font-bold text-gray-900">{fmt(data?.totalSpent ?? 0)}</Text>
              <Text className="text-xs text-gray-400 mt-1">
                {t('fixed')}: {fmt(data?.fixedTotal ?? 0)}
              </Text>
              <Text className="text-xs text-gray-400">
                {t('variable')}: {fmt(data?.variableTotal ?? 0)}
              </Text>
            </Card>
          </View>
          <View className="w-1/2 p-1">
            <Card>
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                {t('incomeThisMonth')}
              </Text>
              <Text className="text-xl font-bold text-green-600">{fmt(data?.totalIncome ?? 0)}</Text>
            </Card>
          </View>
          <View className="w-1/2 p-1">
            <Card>
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                {t('freeCashFlow')}
              </Text>
              <Text
                className={`text-xl font-bold ${(data?.freeCashFlow ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                {fmt(data?.freeCashFlow ?? 0)}
              </Text>
              {(data?.totalSavedThisMonth ?? 0) > 0 && (
                <Text className="text-xs text-gray-400 mt-1">
                  {t('afterSaving', { amount: fmt(data!.totalSavedThisMonth) })}
                </Text>
              )}
              {(data?.totalInvestedThisMonth ?? 0) > 0 && (
                <Text className="text-xs text-gray-400">
                  {t('afterInvesting', { amount: fmt(data!.totalInvestedThisMonth) })}
                </Text>
              )}
            </Card>
          </View>
          <View className="w-1/2 p-1">
            <Card>
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                {t('netWorth')}
              </Text>
              <Text className="text-xl font-bold text-indigo-600">{fmt(data?.netWorth ?? 0)}</Text>
              <Text className="text-[10px] text-gray-400 mt-1">
                {t('netWorthHint', {
                  savings: fmt(data?.totalSavings ?? 0),
                  investments: fmt(data?.totalInvestmentValue ?? 0),
                })}
              </Text>
            </Card>
          </View>
        </View>

        {/* Budget alerts */}
        {(data?.budgetAlerts.length ?? 0) > 0 && (
          <Card className="mb-3 border-amber-200 bg-amber-50">
            <Text className="text-sm font-semibold text-amber-800 mb-2">\u26A0\uFE0F {t('budgetAlerts')}</Text>
            {data!.budgetAlerts.map((a) => (
              <View key={a.categoryId} className="flex-row items-center justify-between py-1">
                <Text className="text-sm text-amber-900">
                  {a.icon} {a.name}
                </Text>
                <Text className={`text-sm font-semibold ${a.pct >= 100 ? 'text-red-600' : 'text-amber-700'}`}>
                  {fmt(a.spent)} / {fmt(a.limit)} · {Math.round(a.pct)}%
                </Text>
              </View>
            ))}
          </Card>
        )}

        {/* Spending by category */}
        <Card className="mb-3">
          <Text className="text-base font-semibold text-gray-900 mb-3">{t('spendingByCategory')}</Text>
          {data && data.chartData.length > 0 ? (
            data.chartData.map((c) => (
              <View key={c.name} className="mb-2.5">
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-sm text-gray-700">
                    {c.icon} {c.name}
                  </Text>
                  <Text className="text-sm font-semibold text-gray-900">{fmt(c.total)}</Text>
                </View>
                <View className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <View
                    className="h-2 rounded-full"
                    style={{
                      backgroundColor: c.color,
                      width: `${maxCat > 0 ? Math.max((c.total / maxCat) * 100, 3) : 0}%`,
                    }}
                  />
                </View>
              </View>
            ))
          ) : (
            <EmptyState title={t('noExpenses')} />
          )}
        </Card>

        {/* Recent expenses */}
        <Card>
          <Text className="text-base font-semibold text-gray-900 mb-2">{t('recentExpenses')}</Text>
          {data && data.recent.length > 0 ? (
            data.recent.map((e) => (
              <View
                key={e.id}
                className="flex-row items-center justify-between py-2 border-b border-gray-50"
              >
                <View className="flex-row items-center flex-1 min-w-0 mr-3">
                  <Text className="text-base mr-2">{e.categories?.icon ?? '\u{1F4E6}'}</Text>
                  <View className="flex-1 min-w-0">
                    <Text className="text-sm text-gray-900" numberOfLines={1}>
                      {e.name}
                    </Text>
                    <Text className="text-xs text-gray-400">{formatDate(e.expense_date)}</Text>
                  </View>
                </View>
                <Text className="text-sm font-semibold text-gray-900">{fmt(e.amount)}</Text>
              </View>
            ))
          ) : (
            <EmptyState title={t('noExpenses')} />
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}
