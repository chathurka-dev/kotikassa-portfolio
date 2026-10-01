import { describe, expect, it } from 'vitest'
import { buildReceiptScanFeedbackEvents, type ScanFeedbackItem } from './receipt-scan-feedback'

function item(overrides: Partial<ScanFeedbackItem> = {}): ScanFeedbackItem {
  return {
    id: 'item-1',
    name: 'Banaani',
    amount: 1.5,
    quantity: 1,
    unit: 'kg',
    include: true,
    source: 'ocr',
    isOnReceipt: true,
    lineIndex: 0,
    ...overrides,
  }
}

describe('buildReceiptScanFeedbackEvents', () => {
  it('records an unchanged save as save-only evidence rather than confirmation', () => {
    const events = buildReceiptScanFeedbackEvents({
      originalItems: [item()],
      finalItems: [item()],
      originalStoreName: 'K-Market',
      finalStoreName: 'K-Market',
      originalDate: '2026-08-04',
      finalDate: '2026-08-04',
      originalTotal: 1.5,
      finalTotal: 1.5,
      model: 'gpt-test',
      promptVersion: 'v1',
    })

    expect(events).toEqual([
      expect.objectContaining({
        eventKey: 'review:saved',
        eventType: 'review_saved',
        context: expect.objectContaining({ confirmationMode: 'save_only', changedFieldCount: 0 }),
      }),
    ])
  })

  it('records changed fields, exclusions, additions, and receipt corrections with provenance', () => {
    const events = buildReceiptScanFeedbackEvents({
      originalItems: [item(), item({ id: 'item-2', name: 'Maito', lineIndex: 1 })],
      finalItems: [
        item({ name: 'Banaani Chiquita', amount: 1.75 }),
        item({ id: 'manual', name: 'Sipuli', source: 'manual', lineIndex: undefined }),
      ],
      originalStoreName: 'K-Market',
      finalStoreName: 'K-Market Kamppi',
      originalDate: '2026-08-04',
      finalDate: '2026-08-05',
      originalTotal: 3,
      finalTotal: 3.5,
      model: 'gpt-test',
      promptVersion: 'v1',
    })

    expect(events.map((event) => event.eventKey)).toEqual([
      'review:saved',
      'item:0:field:name',
      'item:0:field:amount',
      'item:1:excluded',
      'item:added:0',
      'receipt:field:store_name',
      'receipt:field:receipt_date',
      'receipt:field:total_amount',
    ])
    expect(events[1]).toMatchObject({
      rawValue: 'Banaani',
      finalValue: 'Banaani Chiquita',
      sourceKey: 'gpt-test',
      sourceVersion: 'v1',
    })
    expect(events[0]?.context).toMatchObject({
      changedFieldCount: 5,
      excludedCount: 1,
      addedCount: 1,
    })
  })
})
