import { describe, expect, it } from 'vitest'
import { parseFinnishReceiptDate } from './receipt-date'

describe('parseFinnishReceiptDate', () => {
  it.each([
    ['2.8.2026', '2026-08-02'],
    ['02.08.2026', '2026-08-02'],
    ['8.2.2026', '2026-02-08'],
    ['29.2.2024', '2024-02-29'],
  ])('converts the printed Finnish date %s without swapping day and month', (raw, expected) => {
    expect(parseFinnishReceiptDate(raw)).toBe(expected)
  })

  it.each([null, '', '2026-08-02', '31.2.2026', '29.2.2025', '2/8/2026'])(
    'returns null for an unreadable or invalid printed date: %s',
    (raw) => {
      expect(parseFinnishReceiptDate(raw)).toBeNull()
    }
  )
})
