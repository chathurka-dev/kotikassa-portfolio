import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { normalizeQuantity } from '@kotikassa/shared'
import { getServerSession } from '@/lib/auth'
import {
  addSeriesValue,
  createReportBuckets,
  finalizeReportBuckets,
  roundReportValue,
} from '@/lib/report-aggregation'
import { allocateBudgetSpending } from '@/lib/report-budget'
import type {
  GeneratedReport,
  ReportColumn,
  ReportInterval,
  ReportMetric,
  ReportRow,
} from '@/lib/report-contract'
import {
  REPORT_INTERVALS,
  REPORT_PRESETS,
  REPORT_TYPES,
  availableReportIntervals,
} from '@/lib/report-view-state'

export const dynamic = 'force-dynamic'

const MAX_RANGE_DAYS = 1096
const MAX_QUERY_ROWS = 5000
const MAX_DETAIL_ROWS = 500

const dateSchema = z
  .string()
  .date()
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  })

const requestSchema = z
  .object({
    reportType: z.enum(REPORT_TYPES),
    preset: z.enum(REPORT_PRESETS),
    from: dateSchema,
    to: dateSchema,
    interval: z.enum(REPORT_INTERVALS),
    comparison: z
      .object({
        from: dateSchema,
        to: dateSchema,
      })
      .strict()
      .refine(({ from, to }) => from <= to)
      .optional(),
    filters: z
      .object({
        categoryId: z.string().uuid().optional(),
        store: z.string().trim().max(120).optional(),
        itemId: z.string().uuid().optional(),
        personId: z.string().uuid().optional(),
      })
      .strict(),
  })
  .strict()
  .refine(({ from, to }) => from <= to)

type ExpenseRow = {
  id: string
  name: string
  amount: number
  quantity: number | null
  unit: string | null
  expense_date: string
  category_id: string | null
  catalog_item_id: string | null
  categories: { name: string; icon: string } | Array<{ name: string; icon: string }> | null
  receipts: { store_name: string | null } | Array<{ store_name: string | null }> | null
}

type IncomeRow = {
  id: string
  source: string
  description: string
  amount: number
  income_date: string
}

type ServerSession = NonNullable<Awaited<ReturnType<typeof getServerSession>>>

function relatedOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function daysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime()
  const end = new Date(`${to}T00:00:00Z`).getTime()
  return Math.floor((end - start) / 86_400_000) + 1
}

function currencyMetric(key: string, value: number): ReportMetric {
  return { key, value: roundReportValue(value), format: 'currency' }
}

function numberMetric(key: string, value: number): ReportMetric {
  return { key, value, format: 'number' }
}

function standardExpenseColumns(): ReportColumn[] {
  return [
    { key: 'date', label: 'date', format: 'date' },
    { key: 'name', label: 'item', format: 'text' },
    { key: 'category', label: 'category', format: 'text' },
    { key: 'store', label: 'store', format: 'text' },
    { key: 'amount', label: 'amount', format: 'currency' },
  ]
}

function expenseRows(rows: ExpenseRow[]): ReportRow[] {
  return rows.slice(0, MAX_DETAIL_ROWS).map((row) => ({
    id: row.id,
    date: row.expense_date,
    name: row.name,
    category: relatedOne(row.categories)?.name ?? '',
    store: relatedOne(row.receipts)?.store_name ?? '',
    quantity: row.quantity,
    unit: row.unit,
    amount: Number(row.amount),
  }))
}

async function loadExpenses(
  supabase: ServerSession['supabase'],
  familyId: string,
  from: string,
  to: string,
  filters: z.infer<typeof requestSchema>['filters']
): Promise<ExpenseRow[]> {
  let query = supabase
    .from('expense_items')
    .select(
      'id, name, amount, quantity, unit, expense_date, category_id, catalog_item_id, categories(name, icon), receipts(store_name)'
    )
    .eq('family_id', familyId)
    .gte('expense_date', from)
    .lte('expense_date', to)
    .order('expense_date', { ascending: false })
    .limit(MAX_QUERY_ROWS + 1)

  if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
  if (filters.itemId) query = query.eq('catalog_item_id', filters.itemId)

  const { data, error } = await query
  if (error) throw error
  if ((data?.length ?? 0) > MAX_QUERY_ROWS) throw new Error('report_too_large')

  const rows = (data ?? []) as unknown as ExpenseRow[]
  if (!filters.store) return rows
  return rows.filter((row) => relatedOne(row.receipts)?.store_name === filters.store)
}

async function loadIncomes(
  supabase: ServerSession['supabase'],
  familyId: string,
  from: string,
  to: string
): Promise<IncomeRow[]> {
  const { data, error } = await supabase
    .from('income_entries')
    .select('id, source, description, amount, income_date')
    .eq('family_id', familyId)
    .gte('income_date', from)
    .lte('income_date', to)
    .order('income_date', { ascending: false })
    .limit(MAX_QUERY_ROWS + 1)

  if (error) throw error
  if ((data?.length ?? 0) > MAX_QUERY_ROWS) throw new Error('report_too_large')
  return (data ?? []) as IncomeRow[]
}

function financialReport(
  type: 'financial-summary' | 'income-expenses',
  expenses: ExpenseRow[],
  incomes: IncomeRow[],
  from: string,
  to: string,
  interval: ReportInterval
): GeneratedReport {
  const expenseTotal = expenses.reduce((sum, row) => sum + Number(row.amount), 0)
  const incomeTotal = incomes.reduce((sum, row) => sum + Number(row.amount), 0)
  const buckets = createReportBuckets(from, to, interval)
  expenses.forEach((row) =>
    addSeriesValue(buckets, row.expense_date, interval, 'expenses', Number(row.amount))
  )
  incomes.forEach((row) =>
    addSeriesValue(buckets, row.income_date, interval, 'income', Number(row.amount))
  )
  const series = finalizeReportBuckets(buckets)

  if (type === 'financial-summary') {
    const summarySeries = series.map((point) => {
      const income = point.values.income ?? 0
      const expenses = point.values.expenses ?? 0
      return {
        ...point,
        values: {
          income,
          expenses,
          net: roundReportValue(income - expenses),
        },
      }
    })
    return {
      type,
      from,
      to,
      interval,
      metrics: [
        currencyMetric('income', incomeTotal),
        currencyMetric('expenses', expenseTotal),
        currencyMetric('net', incomeTotal - expenseTotal),
        numberMetric('transactions', expenses.length + incomes.length),
      ],
      seriesKeys: [{ key: 'net', label: 'net', format: 'currency', color: '#6366f1' }],
      series: summarySeries,
      columns: [
        { key: 'period', label: 'period', format: 'date' },
        { key: 'income', label: 'income', format: 'currency' },
        { key: 'expenses', label: 'expenses', format: 'currency' },
        { key: 'net', label: 'net', format: 'currency' },
      ],
      rows:
        expenses.length || incomes.length
          ? summarySeries.map((point) => ({
              id: point.key,
              period: point.label,
              income: point.values.income ?? 0,
              expenses: point.values.expenses ?? 0,
              net: point.values.net ?? 0,
            }))
          : [],
      rowCount: expenses.length || incomes.length ? summarySeries.length : 0,
    }
  }

  const rows: ReportRow[] = [
    ...expenses.map((row) => ({
      id: `expense-${row.id}`,
      date: row.expense_date,
      kind: 'expense',
      description: row.name,
      source: relatedOne(row.receipts)?.store_name ?? relatedOne(row.categories)?.name ?? '',
      amount: -Number(row.amount),
    })),
    ...incomes.map((row) => ({
      id: `income-${row.id}`,
      date: row.income_date,
      kind: 'income',
      description: row.description,
      source: row.source,
      amount: Number(row.amount),
    })),
  ]
    .sort((left, right) => String(right.date).localeCompare(String(left.date)))
    .slice(0, MAX_DETAIL_ROWS)

  return {
    type,
    from,
    to,
    interval,
    metrics: [
      currencyMetric('income', incomeTotal),
      currencyMetric('expenses', expenseTotal),
      currencyMetric('net', incomeTotal - expenseTotal),
      numberMetric('transactions', expenses.length + incomes.length),
    ],
    seriesKeys: [
      { key: 'income', label: 'income', format: 'currency', color: '#10b981' },
      { key: 'expenses', label: 'expenses', format: 'currency', color: '#6366f1' },
    ],
    series,
    columns: [
      { key: 'date', label: 'date', format: 'date' },
      { key: 'kind', label: 'type', format: 'text' },
      { key: 'description', label: 'description', format: 'text' },
      { key: 'source', label: 'source', format: 'text' },
      { key: 'amount', label: 'amount', format: 'currency' },
    ],
    rows,
    rowCount: expenses.length + incomes.length,
  }
}

function expenseBreakdownReport(
  expenses: ExpenseRow[],
  from: string,
  to: string,
  interval: ReportInterval
): GeneratedReport {
  const total = expenses.reduce((sum, row) => sum + Number(row.amount), 0)
  const buckets = createReportBuckets(from, to, interval)
  expenses.forEach((row) =>
    addSeriesValue(buckets, row.expense_date, interval, 'expenses', Number(row.amount))
  )
  return {
    type: 'expense-breakdown',
    from,
    to,
    interval,
    metrics: [
      currencyMetric('expenses', total),
      numberMetric('purchases', expenses.length),
      currencyMetric('averagePurchase', expenses.length ? total / expenses.length : 0),
      numberMetric(
        'stores',
        new Set(expenses.map((row) => relatedOne(row.receipts)?.store_name).filter(Boolean)).size
      ),
    ],
    seriesKeys: [{ key: 'expenses', label: 'expenses', format: 'currency', color: '#6366f1' }],
    series: finalizeReportBuckets(buckets),
    columns: standardExpenseColumns(),
    rows: expenseRows(expenses),
    rowCount: expenses.length,
  }
}

function groupedExpenseReport(
  type: 'category-spending' | 'store-spending',
  expenses: ExpenseRow[],
  from: string,
  to: string,
  interval: ReportInterval
): GeneratedReport {
  const grouped = new Map<string, { amount: number; count: number }>()
  for (const row of expenses) {
    const key =
      type === 'category-spending'
        ? (relatedOne(row.categories)?.name ?? 'uncategorized')
        : (relatedOne(row.receipts)?.store_name ?? 'unknownStore')
    const current = grouped.get(key) ?? { amount: 0, count: 0 }
    current.amount += Number(row.amount)
    current.count += 1
    grouped.set(key, current)
  }

  const leaders = [...grouped.entries()]
    .sort((left, right) => right[1].amount - left[1].amount)
    .slice(0, 8)
  const leaderNames = new Set(leaders.map(([name]) => name))
  const buckets = createReportBuckets(from, to, interval)
  for (const row of expenses) {
    const rawKey =
      type === 'category-spending'
        ? (relatedOne(row.categories)?.name ?? 'uncategorized')
        : (relatedOne(row.receipts)?.store_name ?? 'unknownStore')
    const key = leaderNames.has(rawKey) ? rawKey : 'other'
    addSeriesValue(buckets, row.expense_date, interval, key, Number(row.amount))
  }

  const total = expenses.reduce((sum, row) => sum + Number(row.amount), 0)
  const seriesNames = [...leaderNames]
  if (
    expenses.some((row) => {
      const name =
        type === 'category-spending'
          ? (relatedOne(row.categories)?.name ?? 'uncategorized')
          : (relatedOne(row.receipts)?.store_name ?? 'unknownStore')
      return !leaderNames.has(name)
    })
  )
    seriesNames.push('other')

  return {
    type,
    from,
    to,
    interval,
    metrics: [
      currencyMetric('expenses', total),
      numberMetric('purchases', expenses.length),
      numberMetric(type === 'category-spending' ? 'categories' : 'stores', grouped.size),
      currencyMetric('averagePurchase', expenses.length ? total / expenses.length : 0),
    ],
    seriesKeys: seriesNames.map((name) => ({ key: name, label: name, format: 'currency' })),
    series: finalizeReportBuckets(buckets),
    columns: [
      { key: 'name', label: type === 'category-spending' ? 'category' : 'store', format: 'text' },
      { key: 'count', label: 'purchases', format: 'number' },
      { key: 'amount', label: 'amount', format: 'currency' },
      { key: 'share', label: 'share', format: 'percentage' },
    ],
    rows: [...grouped.entries()]
      .sort((left, right) => right[1].amount - left[1].amount)
      .map(([name, values], index) => ({
        id: `${type}-${index}`,
        name,
        count: values.count,
        amount: roundReportValue(values.amount),
        share: total ? roundReportValue((values.amount / total) * 100, 1) : 0,
      })),
    rowCount: grouped.size,
  }
}

function itemPurchaseReport(
  expenses: ExpenseRow[],
  from: string,
  to: string,
  interval: ReportInterval
): GeneratedReport {
  const quantityTotals = new Map<string, { quantity: number; spent: number }>()
  const buckets = createReportBuckets(from, to, interval)
  let spent = 0

  for (const row of expenses) {
    spent += Number(row.amount)
    if (row.quantity == null) continue
    const normalized = normalizeQuantity(Number(row.quantity), row.unit)
    const unit = normalized.canonical ?? 'unknown'
    const total = quantityTotals.get(unit) ?? { quantity: 0, spent: 0 }
    total.quantity += normalized.quantity
    total.spent += Number(row.amount)
    quantityTotals.set(unit, total)
    addSeriesValue(buckets, row.expense_date, interval, unit, normalized.quantity)
  }

  const metrics: ReportMetric[] = [...quantityTotals.entries()].map(([unit, values]) => ({
    key: 'quantityPurchased',
    value: roundReportValue(values.quantity, 4),
    format: 'quantity',
    unit,
  }))
  metrics.push(currencyMetric('expenses', spent), numberMetric('purchases', expenses.length))

  return {
    type: 'item-purchases',
    from,
    to,
    interval,
    metrics,
    seriesKeys: [...quantityTotals.keys()].map((unit) => ({
      key: unit,
      label: unit,
      format: 'quantity',
    })),
    series: finalizeReportBuckets(buckets),
    columns: [
      { key: 'date', label: 'date', format: 'date' },
      { key: 'name', label: 'recordedName', format: 'text' },
      { key: 'store', label: 'store', format: 'text' },
      { key: 'quantity', label: 'quantity', format: 'quantity', unitKey: 'unit' },
      { key: 'amount', label: 'amount', format: 'currency' },
    ],
    rows: expenses.slice(0, MAX_DETAIL_ROWS).map((row) => ({
      id: row.id,
      date: row.expense_date,
      name: row.name,
      store: relatedOne(row.receipts)?.store_name ?? '',
      quantity: row.quantity,
      unit: row.unit,
      amount: Number(row.amount),
    })),
    rowCount: expenses.length,
    notice: 'purchases-not-consumption',
  }
}

async function budgetReport(
  supabase: ServerSession['supabase'],
  familyId: string,
  expenses: ExpenseRow[],
  from: string,
  to: string,
  interval: ReportInterval,
  categoryId?: string
): Promise<GeneratedReport> {
  const earliestPossiblePeriod = new Date(`${from}T00:00:00Z`)
  earliestPossiblePeriod.setUTCDate(earliestPossiblePeriod.getUTCDate() - 31)
  let query = supabase
    .from('budgets')
    .select('id, category_id, amount, month, categories(name)')
    .eq('family_id', familyId)
    .gte('month', earliestPossiblePeriod.toISOString().slice(0, 10))
    .lte('month', to)
    .limit(MAX_QUERY_ROWS)
  if (categoryId) query = query.eq('category_id', categoryId)
  const { data, error } = await query
  if (error) throw error

  const loadedBudgetRows = (data ?? []) as unknown as Array<{
    id: string
    category_id: string
    amount: number
    month: string
    categories: { name: string } | Array<{ name: string }> | null
  }>
  const budgetRows = allocateBudgetSpending(loadedBudgetRows, expenses, from, to)

  const totalBudget = budgetRows.reduce((sum, row) => sum + Number(row.amount), 0)
  const totalSpent = budgetRows.reduce((sum, row) => sum + row.spent, 0)
  const buckets = createReportBuckets(from, to, interval)
  expenses.forEach((row) => {
    const isBudgeted = budgetRows.some(
      (budget) =>
        budget.category_id === row.category_id &&
        row.expense_date >= budget.month &&
        row.expense_date <= budget.periodTo
    )
    if (isBudgeted) {
      addSeriesValue(buckets, row.expense_date, interval, 'spent', Number(row.amount))
    }
  })
  budgetRows.forEach((row) =>
    addSeriesValue(buckets, row.month, interval, 'budget', Number(row.amount))
  )

  return {
    type: 'budget-performance',
    from,
    to,
    interval,
    metrics: [
      currencyMetric('budget', totalBudget),
      currencyMetric('spent', totalSpent),
      currencyMetric('remaining', totalBudget - totalSpent),
      {
        key: 'used',
        value: totalBudget ? roundReportValue((totalSpent / totalBudget) * 100, 1) : 0,
        format: 'percentage',
      },
    ],
    seriesKeys: [
      { key: 'budget', label: 'budget', format: 'currency', color: '#94a3b8' },
      { key: 'spent', label: 'spent', format: 'currency', color: '#6366f1' },
    ],
    series: finalizeReportBuckets(buckets),
    columns: [
      { key: 'period', label: 'period', format: 'date' },
      { key: 'category', label: 'category', format: 'text' },
      { key: 'budget', label: 'budget', format: 'currency' },
      { key: 'spent', label: 'spent', format: 'currency' },
      { key: 'remaining', label: 'remaining', format: 'currency' },
    ],
    rows: budgetRows.map((row) => {
      return {
        id: row.id,
        period: row.month,
        category: relatedOne(row.categories)?.name ?? '',
        budget: Number(row.amount),
        spent: row.spent,
        remaining: Number(row.amount) - row.spent,
      }
    }),
    rowCount: budgetRows.length,
  }
}

async function peopleReport(
  supabase: ServerSession['supabase'],
  familyId: string,
  from: string,
  to: string,
  interval: ReportInterval,
  personId?: string
): Promise<GeneratedReport> {
  let query = supabase
    .from('people_transactions')
    .select('id, person_id, type, amount, note, transaction_date, people(name)')
    .eq('family_id', familyId)
    .gte('transaction_date', from)
    .lte('transaction_date', to)
    .order('transaction_date', { ascending: false })
    .limit(MAX_QUERY_ROWS + 1)
  if (personId) query = query.eq('person_id', personId)
  const { data, error } = await query
  if (error) throw error
  if ((data?.length ?? 0) > MAX_QUERY_ROWS) throw new Error('report_too_large')

  const rows = (data ?? []) as unknown as Array<{
    id: string
    person_id: string
    type: string
    amount: number
    note: string | null
    transaction_date: string
    people: { name: string } | Array<{ name: string }> | null
  }>
  const outgoingTypes = new Set(['sent', 'lent', 'repaid_them'])
  const incomingTypes = new Set(['received', 'they_repaid', 'borrowed'])
  const outgoing = rows
    .filter((row) => outgoingTypes.has(row.type))
    .reduce((sum, row) => sum + Number(row.amount), 0)
  const incoming = rows
    .filter((row) => incomingTypes.has(row.type))
    .reduce((sum, row) => sum + Number(row.amount), 0)
  const buckets = createReportBuckets(from, to, interval)
  rows.forEach((row) =>
    addSeriesValue(
      buckets,
      row.transaction_date,
      interval,
      outgoingTypes.has(row.type) ? 'outgoing' : 'incoming',
      Number(row.amount)
    )
  )

  return {
    type: 'people-breakdown',
    from,
    to,
    interval,
    metrics: [
      currencyMetric('outgoing', outgoing),
      currencyMetric('incoming', incoming),
      currencyMetric('net', incoming - outgoing),
      numberMetric('transactions', rows.length),
    ],
    seriesKeys: [
      { key: 'incoming', label: 'incoming', format: 'currency', color: '#10b981' },
      { key: 'outgoing', label: 'outgoing', format: 'currency', color: '#f97316' },
    ],
    series: finalizeReportBuckets(buckets),
    columns: [
      { key: 'date', label: 'date', format: 'date' },
      { key: 'person', label: 'person', format: 'text' },
      { key: 'type', label: 'type', format: 'text' },
      { key: 'note', label: 'note', format: 'text' },
      { key: 'amount', label: 'amount', format: 'currency' },
    ],
    rows: rows.slice(0, MAX_DETAIL_ROWS).map((row) => ({
      id: row.id,
      date: row.transaction_date,
      person: relatedOne(row.people)?.name ?? '',
      type: row.type,
      note: row.note ?? '',
      amount: Number(row.amount),
    })),
    rowCount: rows.length,
  }
}

async function generateReportData(
  session: ServerSession,
  reportType: z.infer<typeof requestSchema>['reportType'],
  from: string,
  to: string,
  interval: ReportInterval,
  filters: z.infer<typeof requestSchema>['filters']
): Promise<GeneratedReport> {
  const { familyId, supabase } = session
  if (reportType === 'people-breakdown') {
    return peopleReport(supabase, familyId, from, to, interval, filters.personId)
  }

  const needsIncome = reportType === 'financial-summary' || reportType === 'income-expenses'
  const [expenses, incomes] = await Promise.all([
    loadExpenses(supabase, familyId, from, to, filters),
    needsIncome ? loadIncomes(supabase, familyId, from, to) : Promise.resolve([]),
  ])

  switch (reportType) {
    case 'financial-summary':
    case 'income-expenses':
      return financialReport(reportType, expenses, incomes, from, to, interval)
    case 'expense-breakdown':
      return expenseBreakdownReport(expenses, from, to, interval)
    case 'category-spending':
    case 'store-spending':
      return groupedExpenseReport(reportType, expenses, from, to, interval)
    case 'item-purchases':
      return itemPurchaseReport(expenses, from, to, interval)
    case 'budget-performance':
      return budgetReport(
        supabase,
        familyId,
        expenses,
        from,
        to,
        interval,
        filters.categoryId
      )
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const { reportType, preset, from, to, interval, comparison, filters } = parsed.data
  if (daysBetween(from, to) > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: 'range_too_large' }, { status: 400 })
  }
  if (!availableReportIntervals(preset, from, to).includes(interval)) {
    return NextResponse.json({ error: 'invalid_interval' }, { status: 400 })
  }
  if (reportType === 'item-purchases' && !filters.itemId) {
    return NextResponse.json({ error: 'item_required' }, { status: 400 })
  }
  if (
    comparison &&
    (daysBetween(comparison.from, comparison.to) > MAX_RANGE_DAYS ||
      !availableReportIntervals('custom', comparison.from, comparison.to).includes(interval))
  ) {
    return NextResponse.json({ error: 'invalid_comparison' }, { status: 400 })
  }

  try {
    const [report, comparisonReport] = await Promise.all([
      generateReportData(session, reportType, from, to, interval, filters),
      comparison
        ? generateReportData(
            session,
            reportType,
            comparison.from,
            comparison.to,
            interval,
            filters
          )
        : Promise.resolve(null),
    ])

    return NextResponse.json(
      {
        ...report,
        ...(comparisonReport
          ? {
              comparison: {
                from: comparisonReport.from,
                to: comparisonReport.to,
                metrics: comparisonReport.metrics,
                seriesKeys: comparisonReport.seriesKeys,
                series: comparisonReport.series,
                rowCount: comparisonReport.rowCount,
              },
            }
          : {}),
      },
      {
        headers: { 'Cache-Control': 'private, no-store' },
      }
    )
  } catch (error) {
    console.error('[reports] generation failed:', error)
    const tooLarge = error instanceof Error && error.message === 'report_too_large'
    return NextResponse.json(
      { error: tooLarge ? 'report_too_large' : 'report_unavailable' },
      { status: tooLarge ? 413 : 500 }
    )
  }
}
