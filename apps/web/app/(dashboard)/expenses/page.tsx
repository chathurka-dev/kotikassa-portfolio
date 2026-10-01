import {
  currentMonthStart, currentPeriodStart, periodRange, formatPeriod, resolvePeriodParam, resolvePreferences,
  MATERIALIZE_TEMPLATE_COLUMNS, isRecurringTemplateDue, buildRecurringExpenseRow,
} from '@kotikassa/shared'
import { getLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import ExpensePageClient from './_components/ExpensePageClient'

export const dynamic = 'force-dynamic'

export default async function ExpensesPage({
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
  const preferences = resolvePreferences(profile?.preferences)
  const { budgetStartDay } = preferences

  const monthStart = resolvePeriodParam(params?.month, budgetStartDay)
  const currentMonth = monthStart.slice(0, 7)
  const isCurrentPeriod = monthStart === currentPeriodStart(budgetStartDay)
  const { from, to } = periodRange(monthStart, budgetStartDay)

  // Materialize recurring expenses for the true current calendar month, only while
  // browsing the current period (ADR-014: materialization stays calendar-month-based).
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
        console.error('[recurring] materialization insert failed:', insertErr.message, insertErr.details)
      } else {
        await supabase
          .from('recurring_expenses')
          .update({ last_materialized_month: nowCalendarMonth })
          .in('id', templates.map(t => t.id))
      }
    }
  }

  // Fetch expenses, categories, and history in parallel
  const [
    { data: expenses },
    { data: categories },
    { data: history },
  ] = await Promise.all([
    supabase
      .from('expense_items')
      .select('*, categories(id, name, icon, color), receipts(store_name)')
      .eq('family_id', familyId)
      .gte('expense_date', from)
      .lte('expense_date', to)
      .order('expense_date', { ascending: false }),
    supabase
      .from('categories')
      .select('id, name, icon, color')
      .eq('family_id', familyId)
      .order('sort_order'),
    supabase
      .from('expense_items')
      .select('name, amount, category_id, expense_date')
      .eq('family_id', familyId)
      .order('expense_date', { ascending: false })
      .limit(3000),
  ])

  const suggestionMap = new Map<
    string,
    { name: string; lastPrice: number; categoryId: string | null; count: number }
  >()
  for (const row of history ?? []) {
    const rawName = (row.name ?? '').trim()
    if (!rawName) continue
    const key = rawName.toLowerCase()
    const existing = suggestionMap.get(key)
    if (existing) {
      existing.count += 1
    } else {
      suggestionMap.set(key, {
        name: rawName,
        lastPrice: row.amount,
        categoryId: row.category_id ?? null,
        count: 1,
      })
    }
  }
  const suggestions = Array.from(suggestionMap.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  )

  return (
    <ExpensePageClient
      key={currentMonth}
      initialExpenses={expenses ?? []}
      categories={categories ?? []}
      familyId={familyId}
      userId={user.id}
      monthLabel={formatPeriod(monthStart, budgetStartDay, locale)}
      currentMonth={currentMonth}
      suggestions={suggestions}
      preferences={preferences}
    />
  )
}
