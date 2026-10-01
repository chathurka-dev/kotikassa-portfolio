import { format, startOfMonth, parseISO, getISOWeek, getISOWeekYear, startOfISOWeek, endOfISOWeek, addDays } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { fi } from 'date-fns/locale'

// The first day of the current calendar month — used as budget key
export function currentMonthStart(): string {
  return format(startOfMonth(new Date()), 'yyyy-MM-dd')
}

// The anchor month ('YYYY-MM-01') of the current budget period.
// When startDay=1 (default): same as currentMonthStart().
// When startDay=15, today=Jul 3: returns Jun 1 (Jun 15–Jul 14 is the active period).
// When startDay=15, today=Jul 20: returns Jul 1 (Jul 15–Aug 14 is the active period).
export function currentPeriodStart(startDay: number = 1): string {
  // day < startDay is never true when startDay <= 1 (day is always >= 1), so this
  // already reduces to the first of the current calendar month in that case.
  const now = new Date()
  const day = now.getDate()
  const periodMonth = day < startDay
    ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
    : new Date(now.getFullYear(), now.getMonth(), 1)
  return format(periodMonth, 'yyyy-MM-dd')
}

// Resolve an optional ?month=YYYY-MM page param considering budget start day.
// Returns 'YYYY-MM-01' anchor, clamped to the current period.
export function resolvePeriodParam(rawMonth?: string, startDay: number = 1): string {
  const nowStart = currentPeriodStart(startDay)
  if (!rawMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth)) return nowStart
  const candidate = `${rawMonth}-01`
  return candidate > nowStart ? nowStart : candidate
}

// Keep for backward compat — equivalent to resolvePeriodParam(raw, 1)
export function resolveMonthParam(rawMonth?: string): string {
  return resolvePeriodParam(rawMonth, 1)
}

// Start and end of a budget period anchored to monthStart ('YYYY-MM-01').
// When startDay=1: equivalent to monthRange (1st–last of that calendar month).
// When startDay=15: from the 15th of that month to the 14th of the next.
export function periodRange(monthStart: string, startDay: number = 1): { from: string; to: string } {
  // For startDay <= 1 this already reduces to the 1st–last day of the calendar month:
  // new Date(year, month-1, 1) === startOfMonth, new Date(year, month, 0) === endOfMonth.
  const [year, month] = monthStart.split('-').map(Number) as [number, number]
  const fromDate = new Date(year, month - 1, startDay)
  const toDate = new Date(year, month, startDay - 1)    // startDay-1 of next month
  return {
    from: format(fromDate, 'yyyy-MM-dd'),
    to: format(toDate, 'yyyy-MM-dd'),
  }
}

// Keep for backward compat
export function monthRange(monthStart: string): { from: string; to: string } {
  return periodRange(monthStart, 1)
}

// First day of the month `delta` months away: shiftMonth('2026-07-01', -1) -> '2026-06-01'
export function shiftMonth(monthStart: string, delta: number): string {
  const [year, month] = monthStart.split('-').map(Number) as [number, number]
  return format(new Date(year, month - 1 + delta, 1), 'yyyy-MM-dd')
}

// Human-readable label for a calendar month: "June 2026"
export function formatMonth(monthStart: string, locale: 'fi' | 'en' = 'fi'): string {
  const date = parseISO(monthStart)
  return format(date, 'LLLL yyyy', { locale: locale === 'fi' ? fi : enUS })
}

// Human-readable label for a budget period.
// When startDay=1: same as formatMonth (e.g. "June 2026").
// When startDay=15: short range label (e.g. "Jun 15 – Jul 14").
export function formatPeriod(monthStart: string, startDay: number = 1, locale: 'fi' | 'en' = 'fi'): string {
  if (startDay <= 1) return formatMonth(monthStart, locale)
  const { from, to } = periodRange(monthStart, startDay)
  const loc = locale === 'fi' ? fi : enUS
  return `${format(parseISO(from), 'd MMM', { locale: loc })} – ${format(parseISO(to), 'd MMM', { locale: loc })}`
}

// Short date for expense lists: "14.6.2026"
export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), 'd.M.yyyy')
}

// ISO date string for today
export function today(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

// List of last N months (inclusive of current), newest first
export function lastNMonths(n: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(format(d, 'yyyy-MM-dd'))
  }
  return months
}

// ISO week descriptor — used by the expenses week-filter chip row
export interface ISOWeek {
  week: number      // ISO week number (1-53)
  isoYear: number   // ISO year the week belongs to (may differ from calendar year near Jan 1)
  start: string     // Monday of the week "YYYY-MM-DD"
  end: string       // Sunday of the week "YYYY-MM-DD"
}

// Returns all ISO weeks that overlap with the given date range (inclusive, 'YYYY-MM-DD').
// A week is included if any of its days fall within the range.
export function getISOWeeksInRange(from: string, to: string): ISOWeek[] {
  const firstDay = parseISO(from)
  const lastDay = parseISO(to)

  const seen = new Set<string>()
  const weeks: ISOWeek[] = []

  let d = firstDay
  while (d.getTime() <= lastDay.getTime()) {
    const w = getISOWeek(d)
    const wy = getISOWeekYear(d)
    const key = `${wy}-${w}`
    if (!seen.has(key)) {
      seen.add(key)
      const ws = startOfISOWeek(d)
      const we = endOfISOWeek(d)
      weeks.push({
        week: w,
        isoYear: wy,
        start: format(ws, 'yyyy-MM-dd'),
        end: format(we, 'yyyy-MM-dd'),
      })
    }
    d = addDays(d, 1)
  }

  return weeks
}

// Returns all ISO weeks that overlap with the given calendar month (YYYY-MM).
export function getMonthWeeks(yearMonth: string): ISOWeek[] {
  const [year, month] = yearMonth.split('-').map(Number) as [number, number]
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0) // day 0 of next month = last day of current month
  return getISOWeeksInRange(format(firstDay, 'yyyy-MM-dd'), format(lastDay, 'yyyy-MM-dd'))
}
