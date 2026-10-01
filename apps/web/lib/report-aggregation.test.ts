import { describe, expect, it } from 'vitest'
import {
  addSeriesValue,
  compareReportMetrics,
  createReportBuckets,
  finalizeReportBuckets,
} from './report-aggregation'

describe('report aggregation', () => {
  it('retains empty time-series buckets and rounds totals', () => {
    const buckets = createReportBuckets('2026-07-01', '2026-07-03', 'day')
    addSeriesValue(buckets, '2026-07-02', 'day', 'expenses', 10.12345)
    const series = finalizeReportBuckets(buckets)

    expect(series).toHaveLength(3)
    expect(series[0]?.values).toEqual({})
    expect(series[1]?.values.expenses).toBe(10.1235)
    expect(series[2]?.values).toEqual({})
  })

  it('uses relative changes and percentage-point differences', () => {
    expect(
      compareReportMetrics(
        { key: 'expenses', value: 120, format: 'currency' },
        { key: 'expenses', value: 100, format: 'currency' }
      )
    ).toEqual({ kind: 'percent', value: 20 })
    expect(
      compareReportMetrics(
        { key: 'used', value: 72.5, format: 'percentage' },
        { key: 'used', value: 68, format: 'percentage' }
      )
    ).toEqual({ kind: 'percentage-points', value: 4.5 })
    expect(
      compareReportMetrics(
        { key: 'income', value: 50, format: 'currency' },
        { key: 'income', value: 0, format: 'currency' }
      )
    ).toEqual({ kind: 'new' })
    expect(
      compareReportMetrics(
        { key: 'quantityPurchased', value: 2.77, format: 'quantity', unit: 'kg' },
        { key: 'quantityPurchased', value: 4.46, format: 'quantity', unit: 'kg' }
      )
    ).toEqual({ kind: 'percent', value: -37.9 })
  })
})
