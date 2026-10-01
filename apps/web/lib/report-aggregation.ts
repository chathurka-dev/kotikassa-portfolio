import type { ReportInterval, ReportMetric, ReportSeriesPoint } from './report-contract'

export type ReportMetricChange =
  | { kind: 'percent'; value: number }
  | { kind: 'percentage-points'; value: number }
  | { kind: 'new' }

export function roundReportValue(value: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function bucketStart(dateString: string, interval: ReportInterval): string {
  if (interval === 'month') return `${dateString.slice(0, 7)}-01`
  if (interval === 'day') return dateString

  const date = new Date(`${dateString}T00:00:00Z`)
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() - weekday + 1)
  return date.toISOString().slice(0, 10)
}

function advance(date: Date, interval: ReportInterval) {
  if (interval === 'month') date.setUTCMonth(date.getUTCMonth() + 1)
  else date.setUTCDate(date.getUTCDate() + (interval === 'week' ? 7 : 1))
}

export function createReportBuckets(
  from: string,
  to: string,
  interval: ReportInterval
): Map<string, ReportSeriesPoint> {
  const buckets = new Map<string, ReportSeriesPoint>()
  const finalStart = bucketStart(to, interval)
  const cursor = new Date(`${bucketStart(from, interval)}T00:00:00Z`)

  while (cursor.toISOString().slice(0, 10) <= finalStart) {
    const key = cursor.toISOString().slice(0, 10)
    buckets.set(key, { key, label: key, values: {} })
    advance(cursor, interval)
  }
  return buckets
}

export function addSeriesValue(
  buckets: Map<string, ReportSeriesPoint>,
  date: string,
  interval: ReportInterval,
  key: string,
  value: number
) {
  const start = bucketStart(date, interval)
  const bucket = buckets.get(start)
  if (!bucket) return
  bucket.values[key] = (bucket.values[key] ?? 0) + Number(value)
}

export function finalizeReportBuckets(
  buckets: Map<string, ReportSeriesPoint>
): ReportSeriesPoint[] {
  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    values: Object.fromEntries(
      Object.entries(bucket.values).map(([key, value]) => [key, roundReportValue(value, 4)])
    ),
  }))
}

export function compareReportMetrics(
  current: ReportMetric,
  previous: ReportMetric
): ReportMetricChange {
  if (current.format === 'percentage') {
    return {
      kind: 'percentage-points',
      value: roundReportValue(current.value - previous.value, 1),
    }
  }
  if (previous.value === 0) {
    return current.value === 0 ? { kind: 'percent', value: 0 } : { kind: 'new' }
  }
  return {
    kind: 'percent',
    value: roundReportValue(((current.value - previous.value) / Math.abs(previous.value)) * 100, 1),
  }
}
