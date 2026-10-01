import type { ReportComparisonMode, ReportInterval, ReportType } from './report-contract'

export const REPORT_TYPES = [
  'financial-summary',
  'expense-breakdown',
  'income-expenses',
  'category-spending',
  'store-spending',
  'item-purchases',
  'budget-performance',
  'people-breakdown',
] as const satisfies readonly ReportType[]

export const REPORT_PRESETS = ['week', 'month', '3months', '6months', '12months', 'custom'] as const

export const REPORT_INTERVALS = [
  'day',
  'week',
  'month',
] as const satisfies readonly ReportInterval[]

export const REPORT_COMPARISON_MODES = [
  'none',
  'previous-period',
  'previous-year',
  'custom',
] as const satisfies readonly ReportComparisonMode[]

export type ReportPreset = (typeof REPORT_PRESETS)[number]
export type ReportFilterKey = 'categoryId' | 'store' | 'itemId' | 'personId'

export interface ReportViewFilters {
  categoryId: string
  store: string
  itemId: string
  personId: string
}

export interface ReportViewState {
  reportType: ReportType
  preset: ReportPreset
  from: string
  to: string
  interval: ReportInterval
  comparison: {
    mode: ReportComparisonMode
    from: string
    to: string
  }
  filters: ReportViewFilters
}

export type ReportQueryInput = Record<string, string | string[] | undefined>

const DAY_MS = 86_400_000
const MAX_RANGE_DAYS = 1096
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const REPORT_FILTERS: Record<ReportType, readonly ReportFilterKey[]> = {
  'financial-summary': [],
  'expense-breakdown': ['categoryId', 'store'],
  'income-expenses': [],
  'category-spending': ['categoryId'],
  'store-spending': ['store'],
  'item-purchases': ['itemId'],
  'budget-performance': ['categoryId'],
  'people-breakdown': ['personId'],
}

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

function isoLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function shiftReportDate(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function shiftReportYear(dateString: string, years: number): string {
  const [year, month, day] = dateString.split('-').map(Number) as [number, number, number]
  const targetYear = year + years
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate()
  return new Date(Date.UTC(targetYear, month - 1, Math.min(day, lastDay)))
    .toISOString()
    .slice(0, 10)
}

function shiftMonthAnchor(monthStart: string, delta: number): string {
  const [year, month] = monthStart.split('-').map(Number) as [number, number]
  return isoLocalDate(new Date(year, month - 1 + delta, 1))
}

function budgetPeriodRange(monthStart: string, startDay: number): { from: string; to: string } {
  const [year, month] = monthStart.split('-').map(Number) as [number, number]
  return {
    from: isoLocalDate(new Date(year, month - 1, startDay)),
    to: isoLocalDate(new Date(year, month, startDay - 1)),
  }
}

function currentBudgetAnchor(today: Date, startDay: number): string {
  const monthOffset = today.getDate() < startDay ? -1 : 0
  return isoLocalDate(new Date(today.getFullYear(), today.getMonth() + monthOffset, 1))
}

function currentWeekRange(today: Date): { from: string; to: string } {
  const weekday = today.getDay() || 7
  const monday = new Date(today)
  monday.setDate(today.getDate() - weekday + 1)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { from: isoLocalDate(monday), to: isoLocalDate(sunday) }
}

export function reportUsesFilter(type: ReportType, filter: ReportFilterKey): boolean {
  return REPORT_FILTERS[type].includes(filter)
}

export function reportRangeDays(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime()
  const end = new Date(`${to}T00:00:00Z`).getTime()
  return Math.floor((end - start) / DAY_MS) + 1
}

export function reportComparisonRange(
  mode: ReportComparisonMode,
  from: string,
  to: string,
  customFrom = '',
  customTo = '',
  preset: ReportPreset = 'custom',
  budgetStartDay = 1
): { from: string; to: string } | null {
  if (mode === 'none') return null
  if (mode === 'custom') {
    const days =
      isIsoDate(customFrom) && isIsoDate(customTo) && customFrom <= customTo
        ? reportRangeDays(customFrom, customTo)
        : 0
    return days > 0 && days <= MAX_RANGE_DAYS ? { from: customFrom, to: customTo } : null
  }
  if (mode === 'previous-year') {
    return {
      from: shiftReportYear(from, -1),
      to: shiftReportYear(to, -1),
    }
  }

  return shiftReportRange({ preset, from, to }, -1, budgetStartDay)
}

export function reportPresetRange(
  preset: Exclude<ReportPreset, 'custom'>,
  budgetStartDay: number,
  today = new Date()
): { from: string; to: string } {
  if (preset === 'week') return currentWeekRange(today)

  const safeStartDay = Math.min(28, Math.max(1, budgetStartDay))
  const months = preset === 'month' ? 1 : Number.parseInt(preset, 10)
  const currentAnchor = currentBudgetAnchor(today, safeStartDay)
  return {
    from: budgetPeriodRange(shiftMonthAnchor(currentAnchor, -(months - 1)), safeStartDay).from,
    to: budgetPeriodRange(currentAnchor, safeStartDay).to,
  }
}

export function availableReportIntervals(
  preset: ReportPreset,
  from: string,
  to: string
): readonly ReportInterval[] {
  const days = reportRangeDays(from, to)
  if (days > 180) return ['month']
  if (preset === '6months' || preset === '12months') return ['month']
  if (days > 62 || preset === '3months') return ['week', 'month']
  if (preset === 'week') return ['day']
  if (preset === 'month') return ['day', 'week']
  return ['day', 'week']
}

export function defaultReportInterval(
  preset: ReportPreset,
  from: string,
  to: string
): ReportInterval {
  const days = reportRangeDays(from, to)
  let preferred: ReportInterval = 'month'
  if (days > 180) preferred = 'month'
  else if (preset === 'week') preferred = 'day'
  else if (preset === 'month') preferred = 'week'
  else if (preset !== 'custom') preferred = 'month'
  else preferred = days <= 31 ? 'day' : 'week'

  const allowed = availableReportIntervals(preset, from, to)
  return allowed.includes(preferred) ? preferred : (allowed[0] ?? 'month')
}

export function resolveReportViewState(
  query: ReportQueryInput,
  budgetStartDay: number,
  today = new Date()
): ReportViewState {
  const requestedType = firstValue(query.type)
  const reportType = REPORT_TYPES.includes(requestedType as ReportType)
    ? (requestedType as ReportType)
    : 'financial-summary'

  const requestedPreset = firstValue(query.preset)
  const preset = REPORT_PRESETS.includes(requestedPreset as ReportPreset)
    ? (requestedPreset as ReportPreset)
    : 'month'

  const fallbackRange = reportPresetRange(
    preset === 'custom' ? 'month' : preset,
    budgetStartDay,
    today
  )
  const requestedFrom = firstValue(query.from)
  const requestedTo = firstValue(query.to)
  const requestedDays =
    isIsoDate(requestedFrom) && isIsoDate(requestedTo) && requestedFrom <= requestedTo
      ? reportRangeDays(requestedFrom, requestedTo)
      : 0
  const range =
    requestedDays > 0 && requestedDays <= MAX_RANGE_DAYS
      ? { from: requestedFrom, to: requestedTo }
      : fallbackRange

  const requestedInterval = firstValue(query.interval) as ReportInterval
  const allowedIntervals = availableReportIntervals(preset, range.from, range.to)
  const interval = allowedIntervals.includes(requestedInterval)
    ? requestedInterval
    : defaultReportInterval(preset, range.from, range.to)

  const requestedComparisonMode = firstValue(query.compare) as ReportComparisonMode
  let comparisonMode = REPORT_COMPARISON_MODES.includes(requestedComparisonMode)
    ? requestedComparisonMode
    : 'none'
  const fallbackComparison = reportComparisonRange(
    'previous-period',
    range.from,
    range.to,
    '',
    '',
    preset,
    budgetStartDay
  )!
  const comparisonRange = reportComparisonRange(
    comparisonMode,
    range.from,
    range.to,
    firstValue(query.compareFrom),
    firstValue(query.compareTo),
    preset,
    budgetStartDay
  )
  if (comparisonMode === 'custom' && !comparisonRange) comparisonMode = 'none'

  const categoryId = firstValue(query.categoryId)
  const itemId = firstValue(query.itemId)
  const personId = firstValue(query.personId)
  const store = firstValue(query.store).trim()

  return {
    reportType,
    preset,
    ...range,
    interval,
    comparison: {
      mode: comparisonMode,
      ...(comparisonRange ?? fallbackComparison),
    },
    filters: {
      categoryId:
        reportUsesFilter(reportType, 'categoryId') && UUID_PATTERN.test(categoryId)
          ? categoryId
          : '',
      store: reportUsesFilter(reportType, 'store') && store.length <= 120 ? store : '',
      itemId: reportUsesFilter(reportType, 'itemId') && UUID_PATTERN.test(itemId) ? itemId : '',
      personId:
        reportUsesFilter(reportType, 'personId') && UUID_PATTERN.test(personId) ? personId : '',
    },
  }
}

export function serializeReportViewState(state: ReportViewState): string {
  const params = new URLSearchParams({
    type: state.reportType,
    preset: state.preset,
    from: state.from,
    to: state.to,
    interval: state.interval,
  })

  if (state.comparison.mode !== 'none') {
    params.set('compare', state.comparison.mode)
    if (state.comparison.mode === 'custom') {
      params.set('compareFrom', state.comparison.from)
      params.set('compareTo', state.comparison.to)
    }
  }

  for (const [key, value] of Object.entries(state.filters)) {
    if (value && reportUsesFilter(state.reportType, key as ReportFilterKey)) {
      params.set(key, value)
    }
  }
  return params.toString()
}

export function shiftReportRange(
  state: Pick<ReportViewState, 'preset' | 'from' | 'to'>,
  direction: -1 | 1,
  budgetStartDay: number
): { from: string; to: string } {
  if (state.preset === 'week' || state.preset === 'custom') {
    const days = reportRangeDays(state.from, state.to)
    return {
      from: shiftReportDate(state.from, days * direction),
      to: shiftReportDate(state.to, days * direction),
    }
  }

  const months = state.preset === 'month' ? 1 : Number.parseInt(state.preset, 10)
  const safeStartDay = Math.min(28, Math.max(1, budgetStartDay))
  const firstAnchor = shiftMonthAnchor(`${state.from.slice(0, 7)}-01`, months * direction)
  const lastAnchor = shiftMonthAnchor(firstAnchor, months - 1)
  return {
    from: budgetPeriodRange(firstAnchor, safeStartDay).from,
    to: budgetPeriodRange(lastAnchor, safeStartDay).to,
  }
}
