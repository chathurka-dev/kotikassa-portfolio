import type { ScanFeedbackEvent, ScanFeedbackItem } from './receipt-scan-feedback'

export type CorrectionSuggestionSource =
  | 'deterministic_rule'
  | 'household_memory'
  | 'global_candidate'

export type CorrectionSuggestionDecision = 'offered' | 'accepted' | 'rejected' | 'undone'

export interface ReceiptCorrectionSuggestion {
  key: string
  entityType: 'receipt' | 'item'
  lineIndex: number | null
  fieldName: 'store_name' | 'name'
  originalValue: string
  suggestedValue: string
  sourceType: CorrectionSuggestionSource
  sourceKey: string
  sourceVersion: string
  confidenceTier: 'low' | 'medium' | 'high'
  evidenceTier: 'single' | 'repeated' | 'conflicting' | 'exploratory' | 'independent'
  autoApply: boolean
  automationReason: 'household_verified' | 'global_holdout_verified' | null
  automationPolicyVersion: string | null
}

const suggestionSources = new Set<CorrectionSuggestionSource>([
  'deterministic_rule',
  'household_memory',
  'global_candidate',
])

export function parseCorrectionSuggestions(value: unknown): ReceiptCorrectionSuggestion[] {
  if (!Array.isArray(value)) return []

  return value.filter((entry): entry is ReceiptCorrectionSuggestion => {
    if (!entry || typeof entry !== 'object') return false
    const candidate = entry as Partial<ReceiptCorrectionSuggestion>
    return (
      typeof candidate.key === 'string' &&
      (candidate.entityType === 'receipt' || candidate.entityType === 'item') &&
      (candidate.lineIndex === null || Number.isInteger(candidate.lineIndex)) &&
      (candidate.fieldName === 'store_name' || candidate.fieldName === 'name') &&
      typeof candidate.originalValue === 'string' &&
      typeof candidate.suggestedValue === 'string' &&
      candidate.originalValue.trim() !== candidate.suggestedValue.trim() &&
      suggestionSources.has(candidate.sourceType as CorrectionSuggestionSource) &&
      typeof candidate.sourceKey === 'string' &&
      typeof candidate.sourceVersion === 'string' &&
      (candidate.confidenceTier === 'low' ||
        candidate.confidenceTier === 'medium' ||
        candidate.confidenceTier === 'high') &&
      (candidate.evidenceTier === 'single' ||
        candidate.evidenceTier === 'repeated' ||
        candidate.evidenceTier === 'conflicting' ||
        candidate.evidenceTier === 'exploratory' ||
        candidate.evidenceTier === 'independent') &&
      typeof candidate.autoApply === 'boolean' &&
      (candidate.autoApply
        ? (candidate.automationReason === 'household_verified' ||
            candidate.automationReason === 'global_holdout_verified') &&
          typeof candidate.automationPolicyVersion === 'string' &&
          candidate.automationPolicyVersion.trim() !== ''
        : candidate.automationReason === null && candidate.automationPolicyVersion === null)
    )
  })
}

interface AutomaticCorrectionItem {
  name: string
  lineIndex?: number
}

export function applyEligibleAutomaticCorrections<T extends AutomaticCorrectionItem>(
  storeName: string,
  items: T[],
  suggestions: ReceiptCorrectionSuggestion[]
) {
  let correctedStoreName = storeName
  const correctedItems = items.map((item) => ({ ...item }))
  const decisions: Record<string, CorrectionSuggestionDecision> = {}

  for (const suggestion of suggestions) {
    if (!suggestion.autoApply || suggestion.automationReason === null) continue

    if (suggestion.entityType === 'receipt' && suggestion.fieldName === 'store_name') {
      if (normalized(correctedStoreName) !== normalized(suggestion.originalValue)) continue
      correctedStoreName = suggestion.suggestedValue
      decisions[suggestion.key] = 'accepted'
      continue
    }

    if (suggestion.entityType !== 'item' || suggestion.fieldName !== 'name') continue
    const item = correctedItems.find((candidate) => candidate.lineIndex === suggestion.lineIndex)
    if (!item || normalized(item.name) !== normalized(suggestion.originalValue)) continue
    item.name = suggestion.suggestedValue
    decisions[suggestion.key] = 'accepted'
  }

  return { storeName: correctedStoreName, items: correctedItems, decisions }
}

interface BuildSuggestionEventsInput {
  suggestions: ReceiptCorrectionSuggestion[]
  decisions: Record<string, CorrectionSuggestionDecision>
  finalStoreName: string
  finalItems: ScanFeedbackItem[]
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase()
}

export function buildCorrectionSuggestionEvents({
  suggestions,
  decisions,
  finalStoreName,
  finalItems,
}: BuildSuggestionEventsInput): ScanFeedbackEvent[] {
  const events: ScanFeedbackEvent[] = []
  const itemByLine = new Map(
    finalItems
      .filter((item) => item.lineIndex != null)
      .map((item) => [item.lineIndex as number, item])
  )

  for (const suggestion of suggestions) {
    const currentValue =
      suggestion.entityType === 'receipt'
        ? finalStoreName
        : itemByLine.get(suggestion.lineIndex ?? -1)?.name
    const requestedDecision = decisions[suggestion.key] ?? 'offered'
    const decision =
      requestedDecision === 'accepted' &&
      currentValue != null &&
      normalized(currentValue) !== normalized(suggestion.suggestedValue)
        ? 'undone'
        : requestedDecision
    const context = {
      storeName: finalStoreName.trim() || null,
      confidenceTier: suggestion.confidenceTier,
      evidenceTier: suggestion.evidenceTier,
      autoApplied: suggestion.autoApply,
      automationReason: suggestion.automationReason,
      automationPolicyVersion: suggestion.automationPolicyVersion,
    }
    const base = {
      entityType: suggestion.entityType,
      receiptLineIndex: suggestion.lineIndex,
      fieldName: suggestion.fieldName,
      rawValue: suggestion.originalValue,
      finalValue: suggestion.suggestedValue,
      sourceType: suggestion.sourceType,
      sourceKey: suggestion.sourceKey,
      sourceVersion: suggestion.sourceVersion,
      context,
    } satisfies Omit<ScanFeedbackEvent, 'eventKey' | 'eventType'>

    events.push({
      ...base,
      eventKey: `suggestion:${suggestion.key}:offered`,
      eventType: 'suggestion_offered',
    })

    if (decision === 'accepted' || decision === 'undone') {
      events.push({
        ...base,
        eventKey: `suggestion:${suggestion.key}:accepted`,
        eventType: 'suggestion_accepted',
      })
    }
    if (decision === 'rejected') {
      events.push({
        ...base,
        eventKey: `suggestion:${suggestion.key}:rejected`,
        eventType: 'suggestion_rejected',
      })
    }
    if (decision === 'undone') {
      events.push({
        ...base,
        eventKey: `suggestion:${suggestion.key}:undone`,
        eventType: 'suggestion_undone',
      })
    }
  }

  return events
}

export function mergeCorrectionSuggestionEvents(
  baseEvents: ScanFeedbackEvent[],
  suggestionEvents: ScanFeedbackEvent[]
): ScanFeedbackEvent[] {
  const accepted = suggestionEvents.filter((event) => event.eventType === 'suggestion_accepted')
  const withoutDuplicateChanges = baseEvents.filter((event) => {
    if (event.eventType !== 'field_changed') return true
    return !accepted.some(
      (suggestion) =>
        suggestion.entityType === event.entityType &&
        suggestion.receiptLineIndex === event.receiptLineIndex &&
        suggestion.fieldName === event.fieldName &&
        suggestion.rawValue === event.rawValue &&
        suggestion.finalValue === event.finalValue
    )
  })
  return [...withoutDuplicateChanges, ...suggestionEvents]
}
