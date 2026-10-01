import { describe, expect, it } from 'vitest'
import {
  applyEligibleAutomaticCorrections,
  buildCorrectionSuggestionEvents,
  mergeCorrectionSuggestionEvents,
  parseCorrectionSuggestions,
  type ReceiptCorrectionSuggestion,
} from './receipt-correction-suggestions'
import type { ScanFeedbackEvent } from './receipt-scan-feedback'

const suggestion: ReceiptCorrectionSuggestion = {
  key: 'household_memory:1',
  entityType: 'item',
  lineIndex: 0,
  fieldName: 'name',
  originalValue: 'Banaanl',
  suggestedValue: 'Banaani',
  sourceType: 'household_memory',
  sourceKey: '1',
  sourceVersion: 'household-memory-v1',
  confidenceTier: 'medium',
  evidenceTier: 'repeated',
  autoApply: false,
  automationReason: null,
  automationPolicyVersion: null,
}

const item = {
  id: 'item-1',
  name: 'Banaani',
  amount: 1.5,
  quantity: 1,
  unit: 'kg',
  include: true,
  source: 'ocr' as const,
  isOnReceipt: true,
  lineIndex: 0,
}

describe('receipt correction suggestions', () => {
  it('applies only policy-approved aliases and leaves financial fields untouched', () => {
    const result = applyEligibleAutomaticCorrections(
      'K Markef',
      [{ lineIndex: 0, name: 'Banaanl', amount: 2.49 }],
      [
        {
          ...suggestion,
          key: 'household_memory:store-1',
          entityType: 'receipt',
          lineIndex: null,
          fieldName: 'store_name',
          originalValue: 'K Markef',
          suggestedValue: 'K-Market',
          autoApply: true,
          automationReason: 'household_verified',
          automationPolicyVersion: 'holdout-2026-09',
        },
        {
          ...suggestion,
          autoApply: true,
          automationReason: 'household_verified',
          automationPolicyVersion: 'holdout-2026-09',
        },
      ]
    )

    expect(result.storeName).toBe('K-Market')
    expect(result.items).toEqual([{ lineIndex: 0, name: 'Banaani', amount: 2.49 }])
    expect(result.decisions).toEqual({
      'household_memory:store-1': 'accepted',
      [suggestion.key]: 'accepted',
    })
  })

  it('does not apply ineligible or stale corrections', () => {
    const result = applyEligibleAutomaticCorrections(
      'Different store',
      [{ lineIndex: 0, name: 'Already edited' }],
      [{ ...suggestion, autoApply: true, automationReason: 'household_verified' }]
    )

    expect(result).toEqual({
      storeName: 'Different store',
      items: [{ lineIndex: 0, name: 'Already edited' }],
      decisions: {},
    })
  })

  it('accepts only the minimal validated suggestion contract', () => {
    expect(
      parseCorrectionSuggestions([suggestion, { ...suggestion, sourceType: 'unknown' }])
    ).toEqual([suggestion])
    expect(parseCorrectionSuggestions({ rawEvidence: true })).toEqual([])
    expect(
      parseCorrectionSuggestions([
        { ...suggestion, autoApply: true, automationPolicyVersion: 'holdout-2026-09' },
      ])
    ).toEqual([])
  })

  it('records offered and accepted outcomes with provenance', () => {
    const events = buildCorrectionSuggestionEvents({
      suggestions: [suggestion],
      decisions: { [suggestion.key]: 'accepted' },
      finalStoreName: 'K-Market',
      finalItems: [item],
    })

    expect(events.map((event) => event.eventType)).toEqual([
      'suggestion_offered',
      'suggestion_accepted',
    ])
    expect(events[1]).toMatchObject({
      sourceType: 'household_memory',
      sourceKey: '1',
      rawValue: 'Banaanl',
      finalValue: 'Banaani',
      context: { evidenceTier: 'repeated', confidenceTier: 'medium' },
    })
  })

  it('turns an accepted suggestion into an undo when the user changes it again', () => {
    const events = buildCorrectionSuggestionEvents({
      suggestions: [suggestion],
      decisions: { [suggestion.key]: 'accepted' },
      finalStoreName: 'K-Market',
      finalItems: [{ ...item, name: 'Luomubanaani' }],
    })

    expect(events.map((event) => event.eventType)).toEqual([
      'suggestion_offered',
      'suggestion_accepted',
      'suggestion_undone',
    ])
  })

  it('does not double-count an accepted suggestion as an ordinary field edit', () => {
    const baseFieldChange: ScanFeedbackEvent = {
      eventKey: 'item:0:field:name',
      eventType: 'field_changed',
      entityType: 'item',
      receiptLineIndex: 0,
      fieldName: 'name',
      rawValue: 'Banaanl',
      finalValue: 'Banaani',
      sourceType: 'model',
      sourceKey: 'model',
      sourceVersion: 'v14',
      context: {},
    }
    const suggestionEvents = buildCorrectionSuggestionEvents({
      suggestions: [suggestion],
      decisions: { [suggestion.key]: 'accepted' },
      finalStoreName: 'K-Market',
      finalItems: [item],
    })

    expect(mergeCorrectionSuggestionEvents([baseFieldChange], suggestionEvents)).toEqual(
      suggestionEvents
    )
  })
})
