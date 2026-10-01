'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileBarChart,
  Loader2,
  Pencil,
  Play,
  Unlink,
  X,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'
import ContextHelp from '@/components/ContextHelp'
import { createCsv, safeReportFilename } from '@/lib/report-csv'
import { useFormatCurrency } from '@/lib/currency-context'
import { compareReportMetrics } from '@/lib/report-aggregation'
import type {
  GeneratedReport,
  ReportColumn,
  ReportComparisonMode,
  ReportFilterOptions,
  ReportInterval,
  ReportMetric,
  ReportRow,
  ReportSeriesKey,
  ReportType,
} from '@/lib/report-contract'
import {
  REPORT_COMPARISON_MODES,
  REPORT_INTERVALS,
  REPORT_PRESETS,
  REPORT_TYPES,
  availableReportIntervals,
  defaultReportInterval,
  reportComparisonRange,
  reportPresetRange,
  shiftReportDate,
  reportUsesFilter,
  serializeReportViewState,
  shiftReportRange,
  type ReportPreset,
  type ReportViewState,
} from '@/lib/report-view-state'

interface Props {
  initialState: ReportViewState
  initialOptions: ReportFilterOptions
  budgetStartDay: number
}

const SERIES_COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#0ea5e9',
  '#8b5cf6',
  '#f97316',
  '#64748b',
  '#14b8a6',
]
const CURRENT_SERIES_PREFIX = 'current::'
const COMPARISON_SERIES_PREFIX = 'comparison::'
const COMPARISON_FILL = '#cbd5e1'
const COMPARISON_STROKE = '#64748b'

interface ComparisonChartPoint {
  label: string
  currentDate: string
  comparisonDate: string
  [key: string]: number | string
}

function formatReportRange(from: string, to: string, locale: string): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return `${formatter.format(new Date(`${from}T00:00:00Z`))} – ${formatter.format(
    new Date(`${to}T00:00:00Z`)
  )}`
}

function formatChartDate(date: string, interval: ReportInterval, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: interval === 'month' ? undefined : 'numeric',
    month: interval === 'day' ? 'short' : 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

export default function ReportsClient({ initialState, initialOptions, budgetStartDay }: Props) {
  const t = useTranslations('reports')
  const locale = useLocale()
  const fmt = useFormatCurrency()
  const router = useRouter()
  const pathname = usePathname()
  const requestController = useRef<AbortController | null>(null)
  const [options, setOptions] = useState(initialOptions)
  const [reportType, setReportType] = useState<ReportType>(initialState.reportType)
  const [preset, setPreset] = useState<ReportPreset>(initialState.preset)
  const [from, setFrom] = useState(initialState.from)
  const [to, setTo] = useState(initialState.to)
  const [interval, setInterval] = useState<ReportInterval>(initialState.interval)
  const [comparisonMode, setComparisonMode] = useState<ReportComparisonMode>(
    initialState.comparison.mode
  )
  const [customComparisonFrom, setCustomComparisonFrom] = useState(initialState.comparison.from)
  const [customComparisonTo, setCustomComparisonTo] = useState(initialState.comparison.to)
  const [categoryId, setCategoryId] = useState(initialState.filters.categoryId)
  const [store, setStore] = useState(initialState.filters.store)
  const [itemId, setItemId] = useState(initialState.filters.itemId)
  const [itemSearch, setItemSearch] = useState(
    initialOptions.items.find((item) => item.id === initialState.filters.itemId)?.name ?? ''
  )
  const [personId, setPersonId] = useState(initialState.filters.personId)
  const [report, setReport] = useState<GeneratedReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [catalogSaving, setCatalogSaving] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)

  const selectedItem = options.items.find((item) => item.id === itemId) ?? null
  const allowedIntervals = useMemo(
    () => availableReportIntervals(preset, from, to),
    [from, preset, to]
  )
  const comparisonRange = useMemo(
    () =>
      reportComparisonRange(
        comparisonMode,
        from,
        to,
        customComparisonFrom,
        customComparisonTo,
        preset,
        budgetStartDay
      ),
    [
      budgetStartDay,
      comparisonMode,
      customComparisonFrom,
      customComparisonTo,
      from,
      preset,
      to,
    ]
  )
  const comparisonIntervalValid =
    !comparisonRange ||
    availableReportIntervals('custom', comparisonRange.from, comparisonRange.to).includes(interval)
  const viewState = useMemo<ReportViewState>(
    () => ({
      reportType,
      preset,
      from,
      to,
      interval,
      comparison: {
        mode: comparisonMode,
        ...(comparisonRange ?? {
          from: customComparisonFrom,
          to: customComparisonTo,
        }),
      },
      filters: { categoryId, store, itemId, personId },
    }),
    [
      categoryId,
      comparisonMode,
      comparisonRange,
      customComparisonFrom,
      customComparisonTo,
      from,
      interval,
      itemId,
      personId,
      preset,
      reportType,
      store,
      to,
    ]
  )
  const queryString = useMemo(() => serializeReportViewState(viewState), [viewState])
  const rangeLabel = useMemo(() => formatReportRange(from, to, locale), [from, locale, to])
  const comparisonRangeLabel = useMemo(
    () =>
      comparisonRange ? formatReportRange(comparisonRange.from, comparisonRange.to, locale) : '',
    [comparisonRange, locale]
  )

  useEffect(() => {
    if (window.location.search.slice(1) !== queryString) {
      router.replace(`${pathname}?${queryString}`, { scroll: false })
    }
  }, [pathname, queryString, router])

  useEffect(() => () => requestController.current?.abort(), [])

  const activeFilters = [
    categoryId
      ? {
          key: 'category',
          label: options.categories.find((category) => category.id === categoryId)?.name ?? '',
        }
      : null,
    store ? { key: 'store', label: store } : null,
    itemId ? { key: 'item', label: selectedItem?.name ?? '' } : null,
    personId
      ? {
          key: 'person',
          label: options.people.find((person) => person.id === personId)?.name ?? '',
        }
      : null,
  ].filter((filter): filter is { key: string; label: string } => Boolean(filter?.label))

  function invalidateReport() {
    requestController.current?.abort()
    requestController.current = null
    setLoading(false)
    setReport(null)
    setError(null)
  }

  function selectReportType(nextType: ReportType) {
    setReportType(nextType)
    setCategoryId('')
    setStore('')
    setItemId('')
    setItemSearch('')
    setPersonId('')
    invalidateReport()
  }

  function choosePreset(nextPreset: ReportPreset) {
    setPreset(nextPreset)
    if (nextPreset !== 'custom') {
      const range = reportPresetRange(nextPreset, budgetStartDay)
      setFrom(range.from)
      setTo(range.to)
      setInterval(defaultReportInterval(nextPreset, range.from, range.to))
    } else {
      setInterval(defaultReportInterval(nextPreset, from, to))
    }
    invalidateReport()
  }

  function navigateRange(direction: -1 | 1) {
    const range = shiftReportRange({ from, to, preset }, direction, budgetStartDay)
    setFrom(range.from)
    setTo(range.to)
    invalidateReport()
  }

  function updateCustomRange(nextFrom: string, nextTo: string) {
    if (!nextFrom || !nextTo || nextFrom > nextTo) return
    setFrom(nextFrom)
    setTo(nextTo)
    const nextAllowed = availableReportIntervals('custom', nextFrom, nextTo)
    if (!nextAllowed.includes(interval)) {
      setInterval(defaultReportInterval('custom', nextFrom, nextTo))
    }
    invalidateReport()
  }

  function selectComparison(nextMode: ReportComparisonMode) {
    setComparisonMode(nextMode)
    invalidateReport()
  }

  function updateComparisonRange(nextFrom: string, nextTo: string) {
    if (!nextFrom || !nextTo || nextFrom > nextTo) return
    setCustomComparisonFrom(nextFrom)
    setCustomComparisonTo(nextTo)
    invalidateReport()
  }

  function clearFilters() {
    setCategoryId('')
    setStore('')
    setItemId('')
    setItemSearch('')
    setPersonId('')
    invalidateReport()
  }

  async function generateReport() {
    if (reportUsesFilter(reportType, 'itemId') && !itemId) {
      setError(t('itemRequired'))
      return
    }
    if (!comparisonIntervalValid) {
      setError(t('comparisonIntervalError'))
      return
    }
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/reports/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify({
          reportType,
          preset,
          from,
          to,
          interval,
          ...(comparisonRange ? { comparison: comparisonRange } : {}),
          filters: {
            ...(categoryId ? { categoryId } : {}),
            ...(store ? { store } : {}),
            ...(itemId ? { itemId } : {}),
            ...(personId ? { personId } : {}),
          },
        }),
      })
      if (!response.ok) throw new Error('generation_failed')
      setReport((await response.json()) as GeneratedReport)
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') return
      setError(t('generationError'))
      setReport(null)
    } finally {
      if (requestController.current === controller) {
        requestController.current = null
        setLoading(false)
      }
    }
  }

  function formatValue(value: string | number | null, column: ReportColumn, row?: ReportRow) {
    if (value == null || value === '') return '—'
    if (column.format === 'currency') return fmt(Number(value))
    if (column.format === 'number') return new Intl.NumberFormat(locale).format(Number(value))
    if (column.format === 'percentage') return `${Number(value).toLocaleString(locale)}%`
    if (column.format === 'quantity') {
      const unit = column.unitKey && row ? row[column.unitKey] : null
      return `${Number(value).toLocaleString(locale, { maximumFractionDigits: 3 })}${unit ? ` ${unit}` : ''}`
    }
    if (column.format === 'date') {
      return new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${value}T00:00:00Z`))
    }
    const translationKey = `values.${String(value)}`
    return t.has(translationKey) ? t(translationKey) : String(value)
  }

  function formatMetric(metric: ReportMetric) {
    if (metric.format === 'currency') return fmt(metric.value)
    if (metric.format === 'percentage') return `${metric.value.toLocaleString(locale)}%`
    if (metric.format === 'quantity') {
      return `${metric.value.toLocaleString(locale, { maximumFractionDigits: 3 })}${metric.unit && metric.unit !== 'unknown' ? ` ${metric.unit}` : ''}`
    }
    return new Intl.NumberFormat(locale).format(metric.value)
  }

  function exportCsv() {
    if (!report) return
    const rows = [
      report.columns.map((column) => t(`fields.${column.label}`)),
      ...report.rows.map((row) => report.columns.map((column) => row[column.key] ?? '')),
    ]
    const csv = createCsv(rows)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${safeReportFilename(t(`types.${report.type}`))}-${report.from}-${report.to}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function updateCatalog(payload: object) {
    setCatalogSaving(true)
    setCatalogError(null)
    try {
      const response = await fetch('/api/reports/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = (await response.json()) as {
        error?: string
        itemId?: string | null
      }
      if (!response.ok) {
        const errorKey =
          result.error === 'name_conflict'
            ? 'nameConflict'
            : result.error === 'catalog_not_found'
              ? 'catalogChanged'
              : result.error === 'primary_alias'
                ? 'primaryAliasError'
                : 'catalogError'
        setCatalogError(t(errorKey))
        return null
      }
      return result
    } catch {
      setCatalogError(t('catalogError'))
      return null
    } finally {
      setCatalogSaving(false)
    }
  }

  async function renameItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedItem) return
    const name = String(new FormData(event.currentTarget).get('name') ?? '').trim()
    if (!name || name === selectedItem.name) return
    if (await updateCatalog({ action: 'rename', itemId: selectedItem.id, name })) {
      setOptions((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.id === selectedItem.id
            ? { ...item, name, aliases: [...item.aliases, { id: `new-${name}`, name }] }
            : item
        ),
      }))
      setItemSearch(name)
      setManageOpen(false)
      invalidateReport()
    }
  }

  async function mergeItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedItem) return
    const sourceItemId = String(new FormData(event.currentTarget).get('sourceItemId') ?? '')
    const source = options.items.find((item) => item.id === sourceItemId)
    if (!source) return
    if (
      await updateCatalog({
        action: 'merge',
        targetItemId: selectedItem.id,
        sourceItemId,
      })
    ) {
      setOptions((current) => ({
        ...current,
        items: current.items
          .filter((item) => item.id !== sourceItemId)
          .map((item) =>
            item.id === selectedItem.id
              ? { ...item, aliases: [...item.aliases, ...source.aliases] }
              : item
          ),
      }))
      setManageOpen(false)
      invalidateReport()
    }
  }

  async function separateAlias(alias: { id: string; name: string }) {
    if (!selectedItem || !window.confirm(t('separateConfirm', { name: alias.name }))) return

    const result = await updateCatalog({
      action: 'separate',
      itemId: selectedItem.id,
      aliasId: alias.id,
    })
    if (!result) return

    setOptions((current) => {
      const remainingItems = current.items.map((item) =>
        item.id === selectedItem.id
          ? { ...item, aliases: item.aliases.filter((currentAlias) => currentAlias.id !== alias.id) }
          : item
      )
      if (!result.itemId) return { ...current, items: remainingItems }

      return {
        ...current,
        items: [
          ...remainingItems,
          {
            id: result.itemId,
            name: alias.name,
            aliases: [alias],
          },
        ].sort((left, right) => left.name.localeCompare(right.name, locale)),
      }
    })
    invalidateReport()
  }

  function findComparisonMetric(metric: ReportMetric): ReportMetric | undefined {
    const comparisonMetric = report?.comparison?.metrics.find(
      (candidate) => candidate.key === metric.key && candidate.unit === metric.unit
    )
    return comparisonMetric ?? (report?.comparison ? { ...metric, value: 0 } : undefined)
  }

  function formatMetricChange(current: ReportMetric, previous: ReportMetric): string {
    const change = compareReportMetrics(current, previous)
    if (change.kind === 'new') return t('comparisonNew')

    const value = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
      signDisplay: change.value === 0 ? 'never' : 'always',
    }).format(change.value)
    return change.kind === 'percentage-points'
      ? t('comparisonPoints', { value })
      : t('comparisonPercent', { value })
  }

  function describeMetricChange(current: ReportMetric, previous: ReportMetric): string {
    const change = compareReportMetrics(current, previous)
    if (change.kind === 'new') return t('comparisonNew')
    if (change.value === 0) return t('comparisonNoChange')

    const value = Math.abs(change.value).toLocaleString(locale, {
      maximumFractionDigits: 1,
    })
    if (change.kind === 'percentage-points') {
      return t(change.value > 0 ? 'comparisonPointsHigher' : 'comparisonPointsLower', {
        value,
      })
    }
    return t(change.value > 0 ? 'comparisonHigher' : 'comparisonLower', { value })
  }

  function formatSeriesLabel(value: string): string {
    const comparison = value.startsWith(COMPARISON_SERIES_PREFIX)
    const key = value.slice(
      comparison ? COMPARISON_SERIES_PREFIX.length : CURRENT_SERIES_PREFIX.length
    )
    const label = t.has(`values.${key}`) ? t(`values.${key}`) : key
    if (!report?.comparison) return label
    const range = comparison
      ? formatReportRange(report.comparison.from, report.comparison.to, locale)
      : formatReportRange(report.from, report.to, locale)
    return t(comparison ? 'comparisonSeries' : 'currentSeries', { label, range })
  }

  function formatSeriesValue(value: number, series: ReportSeriesKey): string {
    return formatMetric({
      key: series.key,
      value,
      format: series.format,
      ...(series.format === 'quantity' ? { unit: series.key } : {}),
    })
  }

  function ComparisonTooltip({
    active,
    payload,
  }: TooltipProps<number, string>): React.ReactNode {
    if (!active || !payload?.length) return null
    const point = payload[0]?.payload as ComparisonChartPoint | undefined
    if (!point) return null

    return (
      <div className="max-w-xs rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
        <p className="text-xs font-semibold text-gray-700">{point.label}</p>
        <div className="mt-2 space-y-3">
          {displayedSeriesKeys.map((series, index) => {
            const currentValue = Number(point[`${CURRENT_SERIES_PREFIX}${series.key}`] ?? 0)
            const comparisonValue = Number(
              point[`${COMPARISON_SERIES_PREFIX}${series.key}`] ?? 0
            )
            const hasComparison =
              Boolean(report?.comparison) &&
              comparisonChartKeys.some((candidate) => candidate.key === series.key) &&
              Boolean(point.comparisonDate)
            const color = series.color ?? SERIES_COLORS[index % SERIES_COLORS.length]
            const difference = currentValue - comparisonValue
            const differenceLabel = formatSeriesValue(difference, series)
            const changeLabel = describeMetricChange(
              { key: series.key, value: currentValue, format: series.format },
              { key: series.key, value: comparisonValue, format: series.format }
            )

            return (
              <div key={series.key} className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-900">
                  {t.has(`values.${series.key}`) ? t(`values.${series.key}`) : series.label}
                </p>
                {point.currentDate && (
                  <div className="flex items-center justify-between gap-4 text-xs">
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: color }}
                      />
                      {t('selectedDate', {
                        date: formatChartDate(point.currentDate, interval, locale),
                      })}
                    </span>
                    <strong className="text-gray-900">
                      {formatSeriesValue(currentValue, series)}
                    </strong>
                  </div>
                )}
                {hasComparison && (
                  <>
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <span className="flex items-center gap-1.5 text-gray-600">
                        <span
                          className="h-2.5 w-2.5 rounded-sm border"
                          style={{
                            backgroundColor: COMPARISON_FILL,
                            borderColor: COMPARISON_STROKE,
                          }}
                        />
                        {t('comparisonDate', {
                          date: formatChartDate(point.comparisonDate, interval, locale),
                        })}
                      </span>
                      <strong className="text-gray-900">
                        {formatSeriesValue(comparisonValue, series)}
                      </strong>
                    </div>
                    <p className="text-right text-[11px] font-medium text-indigo-700">
                      {t('tooltipDifference', {
                        value: difference > 0 ? `+${differenceLabel}` : differenceLabel,
                        change: changeLabel,
                      })}
                    </p>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const displayedMetrics: ReportMetric[] = report
    ? [
        ...report.metrics,
        ...(report.comparison?.metrics ?? [])
          .filter(
            (comparisonMetric) =>
              !report.metrics.some(
                (metric) =>
                  metric.key === comparisonMetric.key && metric.unit === comparisonMetric.unit
              )
          )
          .map((metric) => ({ ...metric, value: 0 })),
      ]
    : []
  const comparisonSummaryMetric =
    displayedMetrics.find(
      (metric) => report?.type === 'item-purchases' && metric.format === 'quantity'
    ) ??
    displayedMetrics[0]
  const comparisonSummaryPrevious = comparisonSummaryMetric
    ? findComparisonMetric(comparisonSummaryMetric)
    : undefined
  const displayedSeriesKeys: ReportSeriesKey[] = report?.seriesKeys.length
    ? report.seriesKeys
    : (report?.comparison?.seriesKeys ?? [])
  const comparisonSeriesNames = new Set(
    (report?.comparison?.seriesKeys ?? []).map((series) => series.key)
  )
  const comparisonChartKeys = displayedSeriesKeys.filter(
    (series) =>
      (!report?.seriesKeys.length || comparisonSeriesNames.has(series.key)) &&
      (!report?.seriesKeys.length || series.key !== 'other')
  )
  const chartPointCount = Math.max(
    report?.series.length ?? 0,
    report?.comparison?.series.length ?? 0
  )
  const chartData: ComparisonChartPoint[] = Array.from({ length: chartPointCount }, (_, index) => {
    const currentPoint = report?.series[index]
    const comparisonPoint = report?.comparison?.series[index]
    const values: ComparisonChartPoint = {
      label: '',
      currentDate: currentPoint?.label ?? '',
      comparisonDate: comparisonPoint?.label ?? '',
    }
    for (const series of displayedSeriesKeys) {
      values[`${CURRENT_SERIES_PREFIX}${series.key}`] = currentPoint?.values[series.key] ?? 0
      values[`${COMPARISON_SERIES_PREFIX}${series.key}`] =
        comparisonPoint?.values[series.key] ?? 0
    }
    const labelDate = currentPoint?.label ?? comparisonPoint?.label
    values.label = report?.comparison
      ? t(`bucketPositions.${interval}`, { number: index + 1 })
      : labelDate
        ? new Intl.DateTimeFormat(locale, {
            day: interval === 'month' ? undefined : 'numeric',
            month: 'short',
            year: interval === 'month' ? '2-digit' : undefined,
            timeZone: 'UTC',
          }).format(new Date(`${labelDate}T00:00:00Z`))
        : ''
    return values
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
      </div>

      <section className="card space-y-5 p-4 sm:p-6">
        <div>
          <label
            htmlFor="report-type"
            className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            {t('reportType')}
          </label>
          <select
            id="report-type"
            value={reportType}
            onChange={(event) => selectReportType(event.target.value as ReportType)}
            className="input-base w-full text-base font-semibold"
          >
            {REPORT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`types.${type}`)}
              </option>
            ))}
          </select>
          <p className="mt-2 text-sm text-gray-500">{t(`descriptions.${reportType}`)}</p>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t('period')}
              </p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <CalendarDays className="h-4 w-4 text-indigo-600" />
                {rangeLabel}
              </p>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => navigateRange(-1)}
                aria-label={t('previousPeriod')}
                className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => navigateRange(1)}
                aria-label={t('nextPeriod')}
                className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {REPORT_PRESETS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => choosePreset(option)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  preset === option
                    ? 'bg-indigo-600 text-white'
                    : 'border border-gray-200 bg-white text-gray-600 hover:border-indigo-300'
                }`}
              >
                {t(`presets.${option}`)}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                type="date"
                value={from}
                min={shiftReportDate(to, -1095)}
                max={to}
                aria-label={t('from')}
                onChange={(event) => updateCustomRange(event.target.value, to)}
                className="input-base"
              />
              <input
                type="date"
                value={to}
                min={from}
                max={shiftReportDate(from, 1095)}
                aria-label={t('to')}
                onChange={(event) => updateCustomRange(from, event.target.value)}
                className="input-base"
              />
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 pt-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="report-comparison"
                  className="text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  {t('compareWith')}
                </label>
                <ContextHelp label={t('comparisonHelpLabel')}>
                  {t('comparisonHint')}
                </ContextHelp>
              </div>
              <select
                id="report-comparison"
                value={comparisonMode}
                onChange={(event) =>
                  selectComparison(event.target.value as ReportComparisonMode)
                }
                className="input-base mt-1.5 w-full bg-white text-sm font-normal normal-case"
              >
                {REPORT_COMPARISON_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`comparisonModes.${mode}`)}
                  </option>
                ))}
              </select>
            </div>
            {comparisonRange && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t('comparisonPeriod')}
                </p>
                <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <CalendarDays className="h-4 w-4 text-indigo-600" />
                  {comparisonRangeLabel}
                </p>
              </div>
            )}
          </div>
          {comparisonMode === 'custom' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                type="date"
                value={customComparisonFrom}
                min={shiftReportDate(customComparisonTo, -1095)}
                max={customComparisonTo}
                aria-label={t('comparisonFrom')}
                onChange={(event) =>
                  updateComparisonRange(event.target.value, customComparisonTo)
                }
                className="input-base"
              />
              <input
                type="date"
                value={customComparisonTo}
                min={customComparisonFrom}
                max={shiftReportDate(customComparisonFrom, 1095)}
                aria-label={t('comparisonTo')}
                onChange={(event) =>
                  updateComparisonRange(customComparisonFrom, event.target.value)
                }
                className="input-base"
              />
            </div>
          )}
          {!comparisonIntervalValid && (
            <p className="mt-2 text-xs text-red-600">{t('comparisonIntervalError')}</p>
          )}
        </div>

        <div className="grid gap-4 border-t border-gray-100 pt-5 sm:grid-cols-2 lg:grid-cols-3">
          {reportUsesFilter(reportType, 'categoryId') && (
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('category')}
              <select
                value={categoryId}
                onChange={(event) => {
                  setCategoryId(event.target.value)
                  invalidateReport()
                }}
                className="input-base mt-1.5 w-full bg-white text-sm font-normal normal-case"
              >
                <option value="">{t('allCategories')}</option>
                {options.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.icon} {category.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {reportUsesFilter(reportType, 'store') && (
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('store')}
              <select
                value={store}
                onChange={(event) => {
                  setStore(event.target.value)
                  invalidateReport()
                }}
                className="input-base mt-1.5 w-full bg-white text-sm font-normal normal-case"
              >
                <option value="">{t('allStores')}</option>
                {options.stores.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {reportUsesFilter(reportType, 'personId') && (
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('person')}
              <select
                value={personId}
                onChange={(event) => {
                  setPersonId(event.target.value)
                  invalidateReport()
                }}
                className="input-base mt-1.5 w-full bg-white text-sm font-normal normal-case"
              >
                <option value="">{t('allPeople')}</option>
                {options.people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {reportUsesFilter(reportType, 'itemId') && (
            <div>
              <label
                htmlFor="report-item"
                className="block text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                {t('item')}
              </label>
              <input
                id="report-item"
                list="report-item-options"
                value={itemSearch}
                onChange={(event) => {
                  const value = event.target.value
                  const normalized = value.trim().toLocaleLowerCase(locale)
                  const matchingItem = options.items.find(
                    (item) =>
                      item.name.toLocaleLowerCase(locale) === normalized ||
                      item.aliases.some(
                        (alias) => alias.name.toLocaleLowerCase(locale) === normalized
                      )
                  )
                  setItemSearch(value)
                  setItemId(matchingItem?.id ?? '')
                  invalidateReport()
                }}
                placeholder={t('searchItem')}
                className="input-base mt-1.5 w-full text-sm font-normal normal-case"
              />
              <datalist id="report-item-options">
                {options.items.flatMap((item) => [
                  <option key={item.id} value={item.name} />,
                  ...item.aliases
                    .filter((alias) => alias.name !== item.name)
                    .map((alias) => (
                      <option key={alias.id} value={alias.name}>
                        {item.name}
                      </option>
                    )),
                ])}
              </datalist>
              {selectedItem && (
                <button
                  type="button"
                  onClick={() => setManageOpen(true)}
                  className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  <Pencil className="mr-1 inline h-3.5 w-3.5" />
                  {t('manageNames')}
                </button>
              )}
            </div>
          )}
          <div>
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="report-chart-interval"
                className="block text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                {t('chartInterval')}
              </label>
              <ContextHelp label={t('chartIntervalHelpLabel')}>
                {t('chartIntervalHint')}
              </ContextHelp>
            </div>
            <select
              id="report-chart-interval"
              value={interval}
              onChange={(event) => {
                setInterval(event.target.value as ReportInterval)
                invalidateReport()
              }}
              className="input-base mt-1.5 w-full bg-white text-sm font-normal normal-case"
            >
              {REPORT_INTERVALS.map((option) => (
                <option key={option} value={option} disabled={!allowedIntervals.includes(option)}>
                  {t(`intervals.${option}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-5">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('activeFilters')}
            </span>
            {activeFilters.map((filter) => (
              <span
                key={filter.key}
                className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
              >
                {t(filter.key)}: {filter.label}
              </span>
            ))}
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              {t('clearFilters')}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500">{t('generateHint')}</p>
          <button
            type="button"
            onClick={generateReport}
            disabled={loading || !comparisonIntervalValid}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 inline h-4 w-4" />
            )}
            {loading ? t('generating') : t('generate')}
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!report && !loading && !error && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-14 text-center">
          <FileBarChart className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-600">{t('readyTitle')}</p>
          <p className="mt-1 text-xs text-gray-400">{t('readyHint')}</p>
        </div>
      )}

      {report && (
        <section className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t(`types.${report.type}`)}</h2>
              <p className="mt-1 text-sm text-gray-500">{rangeLabel}</p>
              {report.comparison && (
                <p className="mt-1 text-xs font-medium text-indigo-600">
                  {t('comparedWith', {
                    range: formatReportRange(
                      report.comparison.from,
                      report.comparison.to,
                      locale
                    ),
                  })}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!report.rows.length}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Download className="mr-1.5 inline h-4 w-4" />
              {t('exportCsv')}
            </button>
          </div>

          {report.notice === 'purchases-not-consumption' && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              {t('purchaseNotice')}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {displayedMetrics.map((metric, index) => {
              const comparisonMetric = findComparisonMetric(metric)
              return (
                <div key={`${metric.key}-${metric.unit ?? index}`} className="card p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {t(`metrics.${metric.key}`)}
                  </p>
                  <p className="mt-2 text-xl font-bold text-gray-900">{formatMetric(metric)}</p>
                  {comparisonMetric && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                      <span>
                        {t('comparisonValue', { value: formatMetric(comparisonMetric) })}
                      </span>
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">
                        {formatMetricChange(metric, comparisonMetric)}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="card p-4 sm:p-6">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-gray-900">{t('chartTitle')}</h3>
              {report.comparison && (
                <ContextHelp label={t('chartComparisonHelpLabel')}>
                  {t('chartComparisonHint')}
                </ContextHelp>
              )}
            </div>
            {comparisonSummaryMetric && comparisonSummaryPrevious && (
              <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
                {t('comparisonSummary', {
                  metric: t(`metrics.${comparisonSummaryMetric.key}`),
                  current: formatMetric(comparisonSummaryMetric),
                  previous: formatMetric(comparisonSummaryPrevious),
                  change: describeMetricChange(
                    comparisonSummaryMetric,
                    comparisonSummaryPrevious
                  ),
                })}
              </div>
            )}
            {displayedSeriesKeys.length === 0 ||
            (report.rowCount === 0 && (report.comparison?.rowCount ?? 0) === 0) ? (
              <div className="flex h-64 items-center justify-center text-center text-sm text-gray-400">
                {t('emptyReport', { report: t(`types.${report.type}`), range: rangeLabel })}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  <Tooltip content={<ComparisonTooltip />} />
                  <Legend
                    formatter={(value) => formatSeriesLabel(String(value))}
                    wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                  />
                  {displayedSeriesKeys.map((series, index) => {
                    const color = series.color ?? SERIES_COLORS[index % SERIES_COLORS.length]
                    return (
                      <Bar
                        key={`${CURRENT_SERIES_PREFIX}${series.key}`}
                        dataKey={`${CURRENT_SERIES_PREFIX}${series.key}`}
                        name={`${CURRENT_SERIES_PREFIX}${series.key}`}
                        fill={color}
                        radius={[3, 3, 0, 0]}
                        maxBarSize={48}
                      />
                    )
                  })}
                  {report.comparison &&
                    comparisonChartKeys.map((series) => {
                      return (
                        <Bar
                          key={`${COMPARISON_SERIES_PREFIX}${series.key}`}
                          dataKey={`${COMPARISON_SERIES_PREFIX}${series.key}`}
                          name={`${COMPARISON_SERIES_PREFIX}${series.key}`}
                          fill={COMPARISON_FILL}
                          stroke={COMPARISON_STROKE}
                          strokeWidth={1}
                          radius={[3, 3, 0, 0]}
                          maxBarSize={48}
                        />
                      )
                    })}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4 sm:px-5">
              <h3 className="font-semibold text-gray-900">
                {t(report.comparison ? 'detailsCurrentPeriod' : 'details')}
              </h3>
              <span className="text-xs text-gray-400">
                {t('rowCount', { count: report.rowCount })}
              </span>
            </div>
            {report.rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">
                {t('emptyReport', { report: t(`types.${report.type}`), range: rangeLabel })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      {report.columns.map((column) => (
                        <th key={column.key} className="whitespace-nowrap px-4 py-3">
                          {t(`fields.${column.label}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        {report.columns.map((column) => (
                          <td
                            key={column.key}
                            className="whitespace-nowrap px-4 py-3 text-gray-700"
                          >
                            {formatValue(row[column.key] ?? null, column, row)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {manageOpen && selectedItem && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setManageOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-reporting-names-title"
            className="relative max-h-[90dvh] w-full overflow-y-auto bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl"
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
              <h2 id="manage-reporting-names-title" className="flex-1 font-semibold text-gray-900">
                {t('manageTitle')}
              </h2>
              <button
                type="button"
                aria-label={t('closeManage')}
                onClick={() => setManageOpen(false)}
                className="p-1 text-gray-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-500">{t('manageHint')}</p>
            <form
              onSubmit={renameItem}
              className="mt-5 space-y-2 rounded-xl border border-gray-200 p-4"
            >
              <label
                htmlFor="reporting-name"
                className="text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                {t('reportingName')}
              </label>
              <div className="flex gap-2">
                <input
                  id="reporting-name"
                  name="name"
                  defaultValue={selectedItem.name}
                  required
                  maxLength={120}
                  className="input-base min-w-0 flex-1"
                />
                <button
                  disabled={catalogSaving}
                  className="rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {t('rename')}
                </button>
              </div>
            </form>
            <div className="mt-4 rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t('includedNames')}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedItem.aliases.map((alias) => (
                  <span
                    key={alias.id}
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 py-1 pl-2.5 pr-1 text-xs text-gray-700"
                  >
                    {alias.name}
                    {alias.name !== selectedItem.name && (
                      <button
                        type="button"
                        disabled={catalogSaving}
                        onClick={() => separateAlias(alias)}
                        title={t('separateName', { name: alias.name })}
                        aria-label={t('separateName', { name: alias.name })}
                        className="rounded-full p-1 text-gray-400 transition hover:bg-white hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
            <form
              onSubmit={mergeItem}
              className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4"
            >
              <label
                htmlFor="report-source-item"
                className="text-xs font-semibold uppercase tracking-wide text-amber-800"
              >
                {t('combineAnother')}
              </label>
              <select
                id="report-source-item"
                name="sourceItemId"
                required
                className="input-base w-full bg-white"
              >
                <option value="">{t('selectItem')}</option>
                {options.items
                  .filter((item) => item.id !== selectedItem.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-amber-700">{t('mergeWarning')}</p>
              <button
                disabled={catalogSaving}
                className="w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {catalogSaving ? t('saving') : t('merge')}
              </button>
            </form>
            {catalogError && <p className="mt-3 text-sm text-red-600">{catalogError}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
