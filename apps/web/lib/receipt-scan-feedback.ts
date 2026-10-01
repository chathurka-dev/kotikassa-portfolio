export const RECEIPT_SCAN_FEEDBACK_SCHEMA_VERSION = 'v2'

type Value = string | number | boolean | null

export interface ScanFeedbackItem {
  id: string
  name: string
  amount: number
  quantity?: number
  unit?: string
  include: boolean
  source: 'ocr' | 'manual'
  isOnReceipt: boolean
  lineIndex?: number
}

export interface ScanFeedbackEvent {
  eventKey: string
  eventType:
    | 'review_saved'
    | 'field_changed'
    | 'item_excluded'
    | 'item_added'
    | 'suggestion_offered'
    | 'suggestion_accepted'
    | 'suggestion_rejected'
    | 'suggestion_undone'
  entityType: 'receipt' | 'item'
  receiptLineIndex: number | null
  fieldName: string | null
  rawValue: Value
  finalValue: Value
  sourceType: 'model' | 'deterministic_rule' | 'household_memory' | 'global_candidate' | 'user'
  sourceKey: string | null
  sourceVersion: string | null
  context: Record<string, Value>
}

interface BuildFeedbackInput {
  originalItems: ScanFeedbackItem[]
  finalItems: ScanFeedbackItem[]
  originalStoreName: string
  finalStoreName: string
  originalDate: string
  finalDate: string
  originalTotal: number | null
  finalTotal: number | null
  model: string | null
  promptVersion: string | null
  reviewContext?: Record<string, Value>
}

const comparableFields = ['name', 'amount', 'quantity', 'unit'] as const

function normalizedValue(field: (typeof comparableFields)[number], item: ScanFeedbackItem): Value {
  if (field === 'name') return item.name.trim()
  if (field === 'amount') return Math.round(item.amount * 100) / 100
  if (field === 'quantity') return item.quantity ?? null
  return item.unit ?? null
}

export function buildReceiptScanFeedbackEvents(input: BuildFeedbackInput): ScanFeedbackEvent[] {
  const events: ScanFeedbackEvent[] = []
  const finalById = new Map(input.finalItems.map((item) => [item.id, item]))
  let changedFieldCount = 0
  let excludedCount = 0

  for (const original of input.originalItems) {
    const current = finalById.get(original.id)
    if (!current || !current.include) {
      excludedCount += 1
      events.push({
        eventKey: `item:${original.lineIndex ?? original.id}:excluded`,
        eventType: 'item_excluded',
        entityType: 'item',
        receiptLineIndex: original.lineIndex ?? null,
        fieldName: null,
        rawValue: original.name.trim(),
        finalValue: null,
        sourceType: 'model',
        sourceKey: input.model,
        sourceVersion: input.promptVersion,
        context: { storeName: input.finalStoreName.trim() || null },
      })
      continue
    }

    for (const field of comparableFields) {
      const rawValue = normalizedValue(field, original)
      const finalValue = normalizedValue(field, current)
      if (rawValue === finalValue) continue
      changedFieldCount += 1
      events.push({
        eventKey: `item:${original.lineIndex ?? original.id}:field:${field}`,
        eventType: 'field_changed',
        entityType: 'item',
        receiptLineIndex: original.lineIndex ?? null,
        fieldName: field,
        rawValue,
        finalValue,
        sourceType: 'model',
        sourceKey: input.model,
        sourceVersion: input.promptVersion,
        context: { storeName: input.finalStoreName.trim() || null },
      })
    }
  }

  const addedItems = input.finalItems.filter(
    (item) => item.source === 'manual' && item.include && item.isOnReceipt
  )
  addedItems.forEach((item, index) => {
    events.push({
      eventKey: `item:added:${index}`,
      eventType: 'item_added',
      entityType: 'item',
      receiptLineIndex: null,
      fieldName: null,
      rawValue: null,
      finalValue: item.name.trim(),
      sourceType: 'user',
      sourceKey: null,
      sourceVersion: null,
      context: {},
    })
  })

  const receiptFields = [
    ['store_name', input.originalStoreName.trim() || null, input.finalStoreName.trim() || null],
    ['receipt_date', input.originalDate || null, input.finalDate || null],
    ['total_amount', input.originalTotal, input.finalTotal],
  ] as const
  for (const [fieldName, rawValue, finalValue] of receiptFields) {
    if (rawValue === finalValue) continue
    changedFieldCount += 1
    events.push({
      eventKey: `receipt:field:${fieldName}`,
      eventType: 'field_changed',
      entityType: 'receipt',
      receiptLineIndex: null,
      fieldName,
      rawValue,
      finalValue,
      sourceType: 'model',
      sourceKey: input.model,
      sourceVersion: input.promptVersion,
      context: {},
    })
  }

  events.unshift({
    eventKey: 'review:saved',
    eventType: 'review_saved',
    entityType: 'receipt',
    receiptLineIndex: null,
    fieldName: null,
    rawValue: null,
    finalValue: null,
    sourceType: 'user',
    sourceKey: null,
    sourceVersion: null,
    context: {
      confirmationMode: 'save_only',
      originalItemCount: input.originalItems.length,
      finalItemCount: input.finalItems.filter((item) => item.include).length,
      changedFieldCount,
      excludedCount,
      addedCount: addedItems.length,
      ...input.reviewContext,
    },
  })

  return events
}
