export type ReportType =
  | 'financial-summary'
  | 'expense-breakdown'
  | 'income-expenses'
  | 'category-spending'
  | 'store-spending'
  | 'item-purchases'
  | 'budget-performance'
  | 'people-breakdown'

export type ReportInterval = 'day' | 'week' | 'month'
export type ReportComparisonMode = 'none' | 'previous-period' | 'previous-year' | 'custom'
export type ReportValueFormat = 'currency' | 'number' | 'quantity' | 'percentage'

export interface ReportMetric {
  key: string
  value: number
  format: ReportValueFormat
  unit?: string
}

export interface ReportSeriesKey {
  key: string
  label: string
  format: ReportValueFormat
  color?: string
}

export interface ReportSeriesPoint {
  key: string
  label: string
  values: Record<string, number>
}

export interface ReportColumn {
  key: string
  label: string
  format: 'text' | 'date' | ReportValueFormat
  unitKey?: string
}

export interface ReportRow {
  id: string
  [key: string]: string | number | null
}

export interface ReportComparison {
  from: string
  to: string
  metrics: ReportMetric[]
  seriesKeys: ReportSeriesKey[]
  series: ReportSeriesPoint[]
  rowCount: number
}

export interface GeneratedReport {
  type: ReportType
  from: string
  to: string
  interval: ReportInterval
  metrics: ReportMetric[]
  seriesKeys: ReportSeriesKey[]
  series: ReportSeriesPoint[]
  columns: ReportColumn[]
  rows: ReportRow[]
  rowCount: number
  notice?: 'purchases-not-consumption'
  comparison?: ReportComparison
}

export interface ReportFilterOptions {
  categories: Array<{ id: string; name: string; icon: string }>
  stores: string[]
  items: Array<{ id: string; name: string; aliases: Array<{ id: string; name: string }> }>
  people: Array<{ id: string; name: string }>
}
