import { describe, expect, it } from 'vitest'
import {
  availableReportIntervals,
  defaultReportInterval,
  reportComparisonRange,
  reportPresetRange,
  resolveReportViewState,
  serializeReportViewState,
  shiftReportRange,
} from './report-view-state'

const TODAY = new Date(2026, 6, 29, 12)
const CATEGORY_ID = '123e4567-e89b-42d3-a456-426614174000'

describe('report view state', () => {
  it('respects ISO weeks and the household budget start day', () => {
    expect(reportPresetRange('week', 15, TODAY)).toEqual({
      from: '2026-07-27',
      to: '2026-08-02',
    })
    expect(reportPresetRange('month', 15, TODAY)).toEqual({
      from: '2026-07-15',
      to: '2026-08-14',
    })
    expect(reportPresetRange('3months', 15, TODAY)).toEqual({
      from: '2026-05-15',
      to: '2026-08-14',
    })
  })

  it('keeps chart intervals meaningful for each period', () => {
    expect(availableReportIntervals('week', '2026-07-27', '2026-08-02')).toEqual(['day'])
    expect(availableReportIntervals('month', '2026-07-15', '2026-08-14')).toEqual(['day', 'week'])
    expect(availableReportIntervals('3months', '2026-05-15', '2026-08-14')).toEqual([
      'week',
      'month',
    ])
    expect(defaultReportInterval('week', '2026-07-27', '2026-08-02')).toBe('day')
    expect(defaultReportInterval('month', '2026-07-15', '2026-08-14')).toBe('week')
    expect(defaultReportInterval('custom', '2026-01-01', '2026-12-31')).toBe('month')
  })

  it('accepts valid URL state and rejects invalid or irrelevant filters', () => {
    const state = resolveReportViewState(
      {
        type: 'category-spending',
        preset: '3months',
        from: '2026-05-15',
        to: '2026-08-14',
        interval: 'month',
        categoryId: CATEGORY_ID,
        store: 'Should be ignored',
      },
      15,
      TODAY
    )

    expect(state.reportType).toBe('category-spending')
    expect(state.filters.categoryId).toBe(CATEGORY_ID)
    expect(state.filters.store).toBe('')
    expect(serializeReportViewState(state)).toMatch(/categoryId=123e4567/)

    const fallback = resolveReportViewState(
      {
        type: 'not-a-report',
        preset: 'week',
        from: 'not-a-date',
        to: '2026-08-02',
        interval: 'month',
      },
      15,
      TODAY
    )
    expect(fallback.reportType).toBe('financial-summary')
    expect(fallback.interval).toBe('day')
    expect({ from: fallback.from, to: fallback.to }).toEqual({
      from: '2026-07-27',
      to: '2026-08-02',
    })

    const manipulatedRange = resolveReportViewState(
      {
        preset: 'week',
        from: '2026-01-01',
        to: '2026-04-10',
        interval: 'day',
      },
      15,
      TODAY
    )
    expect(manipulatedRange.interval).toBe('week')
  })

  it('navigates complete week and budget-period windows', () => {
    expect(
      shiftReportRange({ preset: 'week', from: '2026-07-27', to: '2026-08-02' }, -1, 15)
    ).toEqual({ from: '2026-07-20', to: '2026-07-26' })
    expect(
      shiftReportRange({ preset: 'month', from: '2026-07-15', to: '2026-08-14' }, 1, 15)
    ).toEqual({ from: '2026-08-15', to: '2026-09-14' })
  })

  it('supports previous period, previous year and validated custom comparisons', () => {
    expect(
      reportComparisonRange('previous-period', '2026-07-15', '2026-08-14', '', '', 'month', 15)
    ).toEqual({ from: '2026-06-15', to: '2026-07-14' })
    expect(reportComparisonRange('previous-year', '2024-02-29', '2024-03-31')).toEqual({
      from: '2023-02-28',
      to: '2023-03-31',
    })
    expect(
      reportComparisonRange('custom', '2026-07-15', '2026-08-14', '2025-11-01', '2025-11-30')
    ).toEqual({ from: '2025-11-01', to: '2025-11-30' })
    expect(
      reportComparisonRange('custom', '2026-07-15', '2026-08-14', 'invalid', '2025-11-30')
    ).toBeNull()
  })

  it('validates and serializes comparison configuration in report URLs', () => {
    const state = resolveReportViewState(
      {
        preset: 'month',
        from: '2026-07-15',
        to: '2026-08-14',
        compare: 'custom',
        compareFrom: '2025-07-15',
        compareTo: '2025-08-14',
      },
      15,
      TODAY
    )
    expect(state.comparison).toEqual({
      mode: 'custom',
      from: '2025-07-15',
      to: '2025-08-14',
    })
    expect(serializeReportViewState(state)).toMatch(/compare=custom/)
    expect(serializeReportViewState(state)).toMatch(/compareFrom=2025-07-15/)

    const invalid = resolveReportViewState(
      {
        compare: 'custom',
        compareFrom: 'later',
        compareTo: 'earlier',
      },
      15,
      TODAY
    )
    expect(invalid.comparison.mode).toBe('none')
  })
})
