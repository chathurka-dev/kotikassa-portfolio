import { describe, expect, it } from 'vitest'
import {
  assessReceiptScanQuality,
  isLowReviewRisk,
  resolveScanQualityWarningOutcomes,
  type ReceiptScanQualityInput,
  type ScanQualityItem,
} from './receipt-scan-quality'

const validReceipt: ReceiptScanQualityInput = {
  storeName: 'K-Market',
  receiptDateRaw: '7.8.2026',
  receiptDate: '2026-08-07',
  totalAmount: 2,
  items: [
    {
      name: 'Sipuli',
      amount: 2,
      quantity: 1,
      unit: 'kg',
      unitPrice: 2,
      discountAmount: null,
      originalPrice: null,
      lineIndex: 0,
    },
  ],
}

const validItem: ScanQualityItem = validReceipt.items[0]!

describe('receipt scan quality', () => {
  it('keeps a reconciled valid receipt low risk', () => {
    expect(assessReceiptScanQuality(validReceipt, [], '2026-08-07')).toMatchObject({
      score: 0,
      level: 'low',
      warnings: [],
    })
  })

  it('detects invalid dates, totals, non-product rows, duplicates, and arithmetic errors', () => {
    const assessment = assessReceiptScanQuality(
      {
        storeName: '',
        receiptDateRaw: '31.2.2026',
        receiptDate: null,
        totalAmount: 20,
        items: [
          { ...validItem, name: 'YHTEENSÄ', amount: 5, quantity: 2, unitPrice: 1 },
          { ...validItem, name: 'YHTEENSÄ', amount: 5, quantity: 2, unitPrice: 1, lineIndex: 1 },
        ],
      },
      [],
      '2026-08-07'
    )

    expect(assessment.level).toBe('high')
    expect(assessment.warnings.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'store_missing',
        'date_invalid',
        'total_mismatch',
        'non_product_row',
        'duplicate_line',
        'quantity_arithmetic',
      ])
    )
  })

  it('uses robust household unit-price history only after three samples', () => {
    const assessment = assessReceiptScanQuality(
      { ...validReceipt, totalAmount: 20, items: [{ ...validItem, amount: 20 }] },
      [
        {
          lineIndex: 0,
          sampleCount: 5,
          canonicalUnit: 'kg',
          medianUnitPrice: 2,
          lowerUnitPrice: 1.8,
          upperUnitPrice: 2.2,
        },
      ],
      '2026-08-07'
    )

    expect(assessment.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'price_outlier', lineIndex: 0 })])
    )
  })

  it('records corrected and dismissed outcomes and detects a rushed review', () => {
    const original = assessReceiptScanQuality(
      { ...validReceipt, storeName: '', totalAmount: 3 },
      [],
      '2026-08-07'
    )
    const outcomes = resolveScanQualityWarningOutcomes(
      original,
      { ...validReceipt, storeName: 'K-Market', totalAmount: 3 },
      [],
      {
        'receipt:receipt:store_name:store_missing': true,
        'receipt:receipt:total_amount:total_mismatch': true,
      },
      '2026-08-07'
    )

    expect(outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'store_missing', outcome: 'corrected' }),
        expect.objectContaining({ code: 'total_mismatch', outcome: 'dismissed' }),
      ])
    )
    expect(isLowReviewRisk(900, original, outcomes)).toBe(true)
  })
})
