import { describe, expect, it } from 'vitest'
import { createCsv, escapeCsvCell, safeReportFilename } from './report-csv'

describe('report CSV export', () => {
  it('protects text formulas while preserving numeric values', () => {
    expect(escapeCsvCell('=HYPERLINK("bad")')).toBe(`"'=HYPERLINK(""bad"")"`)
    expect(escapeCsvCell('  +SUM(A1:A2)')).toBe(`"'  +SUM(A1:A2)"`)
    expect(escapeCsvCell(-25)).toBe('"-25"')
    expect(createCsv([['Name'], ['@formula']])).toMatch(/^\uFEFF"Name"\r\n"'@formula"$/)
    expect(safeReportFilename('Store/report:*')).toBe('Store-report--')
  })
})
