import { parseFinnishReceiptDate } from './receipt-date'

type NumericValue = number | string | null

export interface HistoricalReceipt {
  id: string
  family_id: string
  uploaded_by: string | null
  store_name: string | null
  receipt_date: string | null
  total_amount: NumericValue
  scan_provider: string | null
  scan_model: string | null
  scan_prompt_version: string | null
  scan_schema_version: string | null
  scan_raw_result: unknown
  scan_latency_ms: number | null
  scan_input_tokens: number | null
  scan_output_tokens: number | null
  scan_feedback_expected: boolean
  scan_feedback_schema_version: string | null
  scan_feedback_recorded_at: string | null
  scan_quality_schema_version?: string | null
  scan_quality_score?: number | null
  scan_quality_level?: string | null
  scan_quality_warnings?: unknown
  scan_review_duration_ms?: number | null
  scan_low_review_risk?: boolean
  scan_saved_with_unresolved_warnings?: boolean
}

export interface HistoricalExpenseItem {
  id: string
  receipt_id: string | null
  name: string
  amount: NumericValue
  quantity: NumericValue
  unit: string | null
  is_manual: boolean
  is_on_receipt: boolean | null
  receipt_line_index: number | null
}

export interface HistoricalItemCorrection {
  id: string
  receipt_id: string | null
  ocr_raw_name: string
  ocr_raw_price: NumericValue
  ocr_raw_quantity: NumericValue
  ocr_raw_unit: string | null
  corrected_name: string | null
  corrected_price: NumericValue
  corrected_quantity: NumericValue
  corrected_unit: string | null
  store_name: string | null
}

export interface HistoricalReceiptCorrection {
  id: string
  receipt_id: string | null
  ocr_raw_store_name: string | null
  corrected_store_name: string | null
  ocr_raw_date: string | null
  corrected_date: string | null
}

export interface HistoricalFeedbackEvent {
  id: string
  receipt_id: string
  actor_id: string | null
  event_type: string
  context: unknown
}

export interface HistoricalScanDataset {
  receipts: HistoricalReceipt[]
  expenseItems: HistoricalExpenseItem[]
  itemCorrections: HistoricalItemCorrection[]
  receiptCorrections: HistoricalReceiptCorrection[]
  feedbackEvents: HistoricalFeedbackEvent[]
}

export interface ScanCostRates {
  inputPerMillion: number
  outputPerMillion: number
  currency: string
}

export interface ScanAnalysisCliOptions {
  familyId: string | null
  output: string | null
  limit: number | null
  costRates?: ScanCostRates
  help: boolean
}

interface RawItem {
  name: string
  amount: number
  quantity: number | null
  unit: string | null
}

interface RawReceipt {
  storeName: string | null
  receiptDate: string | null
  totalAmount: number | null
  items: RawItem[]
}

interface MetricAccumulator {
  receiptCount: number
  rawItemCount: number
  matchedItemCount: number
  missedItemCount: number
  falseItemCount: number
  nameCorrect: number
  nameCompared: number
  priceCorrect: number
  priceCompared: number
  quantityCorrect: number
  quantityCompared: number
  unitCorrect: number
  unitCompared: number
  storeCorrect: number
  storeCompared: number
  dateCorrect: number
  dateCompared: number
  totalCorrect: number
  totalCompared: number
  latencyTotalMs: number
  latencyCount: number
  inputTokens: number
  outputTokens: number
}

export interface ScanMetricSummary {
  receiptCount: number
  rawItemCount: number
  matchedItemCount: number
  missedItemCount: number
  falseItemCount: number
  itemRecall: number | null
  falseItemRate: number | null
  fieldCorrections: {
    name: number
    price: number
    quantity: number
    unit: number
    store: number
    date: number
    total: number
  }
  fieldComparisons: {
    name: number
    price: number
    quantity: number
    unit: number
    store: number
    date: number
    total: number
  }
  nameAccuracy: number | null
  priceAccuracy: number | null
  quantityAccuracy: number | null
  unitAccuracy: number | null
  storeAccuracy: number | null
  dateAccuracy: number | null
  totalAccuracy: number | null
  averageLatencyMs: number | null
  inputTokens: number
  outputTokens: number
  estimatedCost: number | null
  costCurrency: string | null
}

export interface ScanAnalysisReport {
  coverage: {
    candidateReceipts: number
    completeReceipts: number
    partialReceipts: number
    unusableReceipts: number
    completeRate: number | null
  }
  evidence: {
    total: number
    complete: number
    partial: number
    conflicting: number
    unusable: number
    conflictingPatterns: number
    independence: {
      candidatePatterns: number
      oneOffPatterns: number
      repeatedByOneContributorPatterns: number
      supportedByMultipleContributorsPatterns: number
      unknownContributorPatterns: number
    }
  }
  reviewSignals: {
    candidateReceipts: number
    receiptsWithExplicitCorrections: number
    receiptsWithoutExplicitCorrections: number
    explicitCorrectionRate: number | null
    distinctContributors: number
    contributorsWithExplicitCorrections: number
    maxContributorReceiptShare: number | null
    recordedReviewReceipts: number
    saveOnlyReviewReceipts: number
    explicitlyConfirmedReceipts: number
    feedbackEventActors: number
    expectedFeedbackReceipts: number
    completedFeedbackReceipts: number
    pendingFeedbackReceipts: number
  }
  qualitySignals: {
    assessedReceipts: number
    highRiskReceipts: number
    lowReviewRiskReceipts: number
    correctedWarnings: number
    dismissedWarnings: number
    unresolvedWarnings: number
    savedIncorrectScanProxyRate: number | null
    baselineExplicitCorrectionRate: number | null
    qualityPeriodExplicitCorrectionRate: number | null
    explicitCorrectionRateChange: number | null
  }
  overall: ScanMetricSummary
  byModel: Record<string, ScanMetricSummary>
  byPromptVersion: Record<string, ScanMetricSummary>
  byStore: Record<string, ScanMetricSummary>
  limitations: string[]
}

interface ReceiptEvaluation {
  classification: 'complete' | 'partial' | 'unusable'
  raw: RawReceipt | null
  finalByLineIndex: Map<number, HistoricalExpenseItem>
  missedItems: HistoricalExpenseItem[]
}

interface EvidenceEvent {
  sourceId: string
  receiptId: string | null
  contributorId: string | null
  kind: 'item_name' | 'item_exclusion' | 'receipt_store' | 'receipt_date' | 'item_field'
  context: string
  raw: string | null
  corrected: string | null
  baseClassification: 'complete' | 'partial' | 'unusable'
}

const UNKNOWN_GROUP = '(unknown)'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseScanAnalysisArgs(argv: string[]): ScanAnalysisCliOptions {
  const values = new Map<string, string>()
  let help = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') {
      help = true
      continue
    }
    if (!argument?.startsWith('--')) throw new Error(`Unexpected argument: ${argument ?? ''}`)

    const equalsIndex = argument.indexOf('=')
    const flag = equalsIndex >= 0 ? argument.slice(0, equalsIndex) : argument
    const inlineValue = equalsIndex >= 0 ? argument.slice(equalsIndex + 1) : null
    const supported = new Set([
      '--family-id',
      '--output',
      '--limit',
      '--input-cost-per-million',
      '--output-cost-per-million',
      '--cost-currency',
    ])
    if (!supported.has(flag)) throw new Error(`Unknown option: ${flag}`)

    const value = inlineValue ?? argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`)
    if (inlineValue === null) index += 1
    if (values.has(flag)) throw new Error(`Duplicate option: ${flag}`)
    values.set(flag, value)
  }

  if (help) return { familyId: null, output: null, limit: null, help: true }

  const familyId = values.get('--family-id') ?? null
  if (!familyId || !UUID_PATTERN.test(familyId)) {
    throw new Error('Provide one valid --family-id UUID; unscoped analysis is not allowed')
  }

  const limitValue = values.get('--limit')
  const limit = limitValue === undefined ? null : Number(limitValue)
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error('--limit must be a positive integer')
  }

  const inputRateValue = values.get('--input-cost-per-million')
  const outputRateValue = values.get('--output-cost-per-million')
  if ((inputRateValue === undefined) !== (outputRateValue === undefined)) {
    throw new Error('Provide both input and output cost rates, or neither')
  }

  let costRates: ScanCostRates | undefined
  if (inputRateValue !== undefined && outputRateValue !== undefined) {
    const inputPerMillion = Number(inputRateValue)
    const outputPerMillion = Number(outputRateValue)
    if (
      !Number.isFinite(inputPerMillion) ||
      inputPerMillion < 0 ||
      !Number.isFinite(outputPerMillion) ||
      outputPerMillion < 0
    ) {
      throw new Error('Cost rates must be non-negative numbers')
    }
    const currency = (values.get('--cost-currency') ?? 'USD').trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('--cost-currency must be a 3-letter code')
    costRates = { inputPerMillion, outputPerMillion, currency }
  } else if (values.has('--cost-currency')) {
    throw new Error('--cost-currency requires input and output cost rates')
  }

  return {
    familyId,
    output: values.get('--output') ?? null,
    limit,
    costRates,
    help: false,
  }
}

function emptyAccumulator(): MetricAccumulator {
  return {
    receiptCount: 0,
    rawItemCount: 0,
    matchedItemCount: 0,
    missedItemCount: 0,
    falseItemCount: 0,
    nameCorrect: 0,
    nameCompared: 0,
    priceCorrect: 0,
    priceCompared: 0,
    quantityCorrect: 0,
    quantityCompared: 0,
    unitCorrect: 0,
    unitCompared: 0,
    storeCorrect: 0,
    storeCompared: 0,
    dateCorrect: 0,
    dateCompared: 0,
    totalCorrect: 0,
    totalCompared: 0,
    latencyTotalMs: 0,
    latencyCount: 0,
    inputTokens: 0,
    outputTokens: 0,
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || null
}

function parseRawReceipt(value: unknown): RawReceipt | null {
  const record = asRecord(value)
  if (!record || !Array.isArray(record['items'])) return null

  const storeName = nullableString(record['storeName'])
  const receiptDate = nullableString(record['receiptDateRaw'] ?? record['receiptDate'])
  const totalAmount = record['totalAmount'] == null ? null : finiteNumber(record['totalAmount'])
  if (
    storeName === undefined ||
    receiptDate === undefined ||
    (totalAmount === null && record['totalAmount'] != null)
  ) {
    return null
  }

  const items: RawItem[] = []
  for (const valueItem of record['items']) {
    const item = asRecord(valueItem)
    if (!item) return null
    const name = nullableString(item['name'])
    const amount = finiteNumber(item['amount'])
    const quantity = item['quantity'] == null ? null : finiteNumber(item['quantity'])
    const unit = nullableString(item['unit'])
    if (
      !name ||
      amount === null ||
      (quantity === null && item['quantity'] != null) ||
      unit === undefined
    ) {
      return null
    }
    items.push({ name, amount, quantity, unit })
  }

  return { storeName, receiptDate, totalAmount, items }
}

function normalizedText(value: string | null): string | null {
  if (!value) return null
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fi-FI') || null
}

function normalizedDate(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  return parseFinnishReceiptDate(trimmed)
}

function cents(value: NumericValue): number | null {
  const parsed = finiteNumber(value)
  return parsed === null ? null : Math.round(parsed * 100)
}

function millis(value: NumericValue): number | null {
  const parsed = finiteNumber(value)
  return parsed === null ? null : Math.round(parsed * 1000)
}

function evaluateReceipt(
  receipt: HistoricalReceipt,
  items: HistoricalExpenseItem[]
): ReceiptEvaluation {
  const raw = parseRawReceipt(receipt.scan_raw_result)
  if (!raw || raw.items.length === 0) {
    return {
      classification: 'unusable',
      raw,
      finalByLineIndex: new Map(),
      missedItems: [],
    }
  }

  const finalByLineIndex = new Map<number, HistoricalExpenseItem>()
  const missedItems: HistoricalExpenseItem[] = []
  let ambiguous = false
  let visibleItemCount = 0

  for (const item of items) {
    if (item.is_on_receipt === false) continue
    if (item.is_on_receipt !== true) {
      ambiguous = true
      continue
    }
    visibleItemCount += 1

    if (item.is_manual) {
      missedItems.push(item)
      continue
    }

    const index = item.receipt_line_index
    if (
      index === null ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= raw.items.length ||
      finalByLineIndex.has(index)
    ) {
      ambiguous = true
      continue
    }
    finalByLineIndex.set(index, item)
  }

  return {
    classification: ambiguous || visibleItemCount === 0 ? 'partial' : 'complete',
    raw,
    finalByLineIndex,
    missedItems,
  }
}

function compareField(
  accumulator: MetricAccumulator,
  correctKey: 'nameCorrect' | 'priceCorrect' | 'quantityCorrect' | 'unitCorrect',
  comparedKey: 'nameCompared' | 'priceCompared' | 'quantityCompared' | 'unitCompared',
  correct: boolean
) {
  accumulator[comparedKey] += 1
  if (correct) accumulator[correctKey] += 1
}

function addReceiptMetrics(
  accumulator: MetricAccumulator,
  receipt: HistoricalReceipt,
  evaluation: ReceiptEvaluation
) {
  const raw = evaluation.raw
  if (!raw) return

  accumulator.receiptCount += 1
  accumulator.rawItemCount += raw.items.length
  accumulator.matchedItemCount += evaluation.finalByLineIndex.size
  accumulator.missedItemCount += evaluation.missedItems.length
  accumulator.falseItemCount += raw.items.length - evaluation.finalByLineIndex.size

  for (const [index, finalItem] of evaluation.finalByLineIndex) {
    const rawItem = raw.items[index]
    if (!rawItem) continue
    compareField(
      accumulator,
      'nameCorrect',
      'nameCompared',
      normalizedText(rawItem.name) === normalizedText(finalItem.name)
    )
    compareField(
      accumulator,
      'priceCorrect',
      'priceCompared',
      cents(rawItem.amount) === cents(finalItem.amount)
    )
    compareField(
      accumulator,
      'quantityCorrect',
      'quantityCompared',
      millis(rawItem.quantity) === millis(finalItem.quantity)
    )
    compareField(
      accumulator,
      'unitCorrect',
      'unitCompared',
      normalizedText(rawItem.unit) === normalizedText(finalItem.unit)
    )
  }

  if (receipt.store_name) {
    accumulator.storeCompared += 1
    if (normalizedText(raw.storeName) === normalizedText(receipt.store_name)) {
      accumulator.storeCorrect += 1
    }
  }
  if (receipt.receipt_date) {
    accumulator.dateCompared += 1
    if (normalizedDate(raw.receiptDate) === normalizedDate(receipt.receipt_date)) {
      accumulator.dateCorrect += 1
    }
  }
  if (receipt.total_amount !== null) {
    accumulator.totalCompared += 1
    if (cents(raw.totalAmount) === cents(receipt.total_amount)) accumulator.totalCorrect += 1
  }
  if (receipt.scan_latency_ms !== null && Number.isFinite(receipt.scan_latency_ms)) {
    accumulator.latencyTotalMs += receipt.scan_latency_ms
    accumulator.latencyCount += 1
  }
  accumulator.inputTokens += receipt.scan_input_tokens ?? 0
  accumulator.outputTokens += receipt.scan_output_tokens ?? 0
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator
}

function summarize(accumulator: MetricAccumulator, costRates?: ScanCostRates): ScanMetricSummary {
  const estimatedCost = costRates
    ? (accumulator.inputTokens * costRates.inputPerMillion +
        accumulator.outputTokens * costRates.outputPerMillion) /
      1_000_000
    : null

  return {
    receiptCount: accumulator.receiptCount,
    rawItemCount: accumulator.rawItemCount,
    matchedItemCount: accumulator.matchedItemCount,
    missedItemCount: accumulator.missedItemCount,
    falseItemCount: accumulator.falseItemCount,
    itemRecall: ratio(
      accumulator.matchedItemCount,
      accumulator.matchedItemCount + accumulator.missedItemCount
    ),
    falseItemRate: ratio(accumulator.falseItemCount, accumulator.rawItemCount),
    fieldCorrections: {
      name: accumulator.nameCompared - accumulator.nameCorrect,
      price: accumulator.priceCompared - accumulator.priceCorrect,
      quantity: accumulator.quantityCompared - accumulator.quantityCorrect,
      unit: accumulator.unitCompared - accumulator.unitCorrect,
      store: accumulator.storeCompared - accumulator.storeCorrect,
      date: accumulator.dateCompared - accumulator.dateCorrect,
      total: accumulator.totalCompared - accumulator.totalCorrect,
    },
    fieldComparisons: {
      name: accumulator.nameCompared,
      price: accumulator.priceCompared,
      quantity: accumulator.quantityCompared,
      unit: accumulator.unitCompared,
      store: accumulator.storeCompared,
      date: accumulator.dateCompared,
      total: accumulator.totalCompared,
    },
    nameAccuracy: ratio(accumulator.nameCorrect, accumulator.nameCompared),
    priceAccuracy: ratio(accumulator.priceCorrect, accumulator.priceCompared),
    quantityAccuracy: ratio(accumulator.quantityCorrect, accumulator.quantityCompared),
    unitAccuracy: ratio(accumulator.unitCorrect, accumulator.unitCompared),
    storeAccuracy: ratio(accumulator.storeCorrect, accumulator.storeCompared),
    dateAccuracy: ratio(accumulator.dateCorrect, accumulator.dateCompared),
    totalAccuracy: ratio(accumulator.totalCorrect, accumulator.totalCompared),
    averageLatencyMs: ratio(accumulator.latencyTotalMs, accumulator.latencyCount),
    inputTokens: accumulator.inputTokens,
    outputTokens: accumulator.outputTokens,
    estimatedCost,
    costCurrency: costRates?.currency ?? null,
  }
}

function addToGroup(
  groups: Map<string, MetricAccumulator>,
  key: string | null,
  receipt: HistoricalReceipt,
  evaluation: ReceiptEvaluation
) {
  const normalizedKey = key?.trim() || UNKNOWN_GROUP
  const accumulator = groups.get(normalizedKey) ?? emptyAccumulator()
  addReceiptMetrics(accumulator, receipt, evaluation)
  groups.set(normalizedKey, accumulator)
}

function summarizeGroups(
  groups: Map<string, MetricAccumulator>,
  costRates?: ScanCostRates
): Record<string, ScanMetricSummary> {
  return Object.fromEntries(
    [...groups.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, accumulator]) => [key, summarize(accumulator, costRates)])
  )
}

function correctionRawItemIndex(
  correction: HistoricalItemCorrection,
  raw: RawReceipt
): number | null {
  const matchingIndexes = raw.items.flatMap((item, index) =>
    normalizedText(item.name) === normalizedText(correction.ocr_raw_name) &&
    (correction.ocr_raw_price === null || cents(item.amount) === cents(correction.ocr_raw_price)) &&
    (correction.ocr_raw_quantity === null ||
      millis(item.quantity) === millis(correction.ocr_raw_quantity)) &&
    (correction.ocr_raw_unit === null ||
      normalizedText(item.unit) === normalizedText(correction.ocr_raw_unit))
      ? [index]
      : []
  )
  return matchingIndexes.length === 1 ? matchingIndexes[0]! : null
}

function correctionMatchesFinalItem(
  correction: HistoricalItemCorrection,
  evaluation: ReceiptEvaluation,
  rawIndex: number,
  isExclusion: boolean
): boolean {
  const finalItem = evaluation.finalByLineIndex.get(rawIndex)
  if (isExclusion) return finalItem === undefined
  if (!finalItem) return false

  return (
    (correction.corrected_name === null ||
      normalizedText(finalItem.name) === normalizedText(correction.corrected_name)) &&
    (correction.corrected_price === null ||
      cents(finalItem.amount) === cents(correction.corrected_price)) &&
    (correction.corrected_quantity === null ||
      millis(finalItem.quantity) === millis(correction.corrected_quantity)) &&
    (correction.corrected_unit === null ||
      normalizedText(finalItem.unit) === normalizedText(correction.corrected_unit))
  )
}

function itemEvidenceSignature(
  name: string,
  price: NumericValue,
  quantity: NumericValue,
  unit: string | null
): string | null {
  const normalizedName = normalizedText(name)
  if (!normalizedName) return null
  return [
    normalizedName,
    cents(price)?.toString() ?? '',
    millis(quantity)?.toString() ?? '',
    normalizedText(unit) ?? '',
  ].join('|')
}

function correctionTargetSignature(correction: HistoricalItemCorrection): string {
  return [
    normalizedText(correction.corrected_name) ?? '',
    cents(correction.corrected_price)?.toString() ?? '',
    millis(correction.corrected_quantity)?.toString() ?? '',
    normalizedText(correction.corrected_unit) ?? '',
  ].join('|')
}

function receiptCorrectionMatchesSourceAndFinal(
  kind: 'receipt_store' | 'receipt_date',
  rawValue: string | null,
  correctedValue: string | null,
  receipt: HistoricalReceipt | undefined,
  evaluation: ReceiptEvaluation | undefined
): boolean {
  if (!receipt || evaluation?.classification !== 'complete' || !evaluation.raw) return false
  if (kind === 'receipt_store') {
    return (
      normalizedText(rawValue) === normalizedText(evaluation.raw.storeName) &&
      normalizedText(correctedValue) === normalizedText(receipt.store_name)
    )
  }
  return (
    normalizedDate(rawValue) === normalizedDate(evaluation.raw.receiptDate) &&
    normalizedDate(correctedValue) === normalizedDate(receipt.receipt_date)
  )
}

function buildEvidenceEvents(
  dataset: HistoricalScanDataset,
  evaluations: Map<string, ReceiptEvaluation>
): EvidenceEvent[] {
  const events: EvidenceEvent[] = []
  const receiptsById = new Map(dataset.receipts.map((receipt) => [receipt.id, receipt]))

  for (const correction of dataset.itemCorrections) {
    const receipt = correction.receipt_id ? receiptsById.get(correction.receipt_id) : undefined
    const correctedFields = [
      correction.corrected_name,
      correction.corrected_price,
      correction.corrected_quantity,
      correction.corrected_unit,
    ]
    const isExclusion = correctedFields.every((value) => value === null)
    const evaluation = correction.receipt_id ? evaluations.get(correction.receipt_id) : undefined
    const rawIndex = evaluation?.raw ? correctionRawItemIndex(correction, evaluation.raw) : null
    const linkedAndMatched = Boolean(
      evaluation?.classification === 'complete' &&
      rawIndex !== null &&
      correctionMatchesFinalItem(correction, evaluation, rawIndex, isExclusion)
    )
    const hasUsableTarget = isExclusion || correctedFields.some((value) => value !== null)
    const kind = isExclusion
      ? 'item_exclusion'
      : correction.corrected_name !== null
        ? 'item_name'
        : 'item_field'
    const rawSignature =
      kind === 'item_name'
        ? normalizedText(correction.ocr_raw_name)
        : itemEvidenceSignature(
            correction.ocr_raw_name,
            correction.ocr_raw_price,
            correction.ocr_raw_quantity,
            correction.ocr_raw_unit
          )
    const correctedSignature = isExclusion
      ? '__excluded__'
      : kind === 'item_name'
        ? normalizedText(correction.corrected_name)
        : correctionTargetSignature(correction)

    events.push({
      sourceId: correction.id,
      receiptId: correction.receipt_id,
      contributorId: receipt?.uploaded_by ?? null,
      kind,
      context: normalizedText(correction.store_name) ?? '',
      raw: rawSignature,
      corrected: correctedSignature,
      baseClassification:
        !rawSignature || !correctedSignature || !hasUsableTarget
          ? 'unusable'
          : linkedAndMatched
            ? 'complete'
            : 'partial',
    })
  }

  for (const correction of dataset.receiptCorrections) {
    const evaluation = correction.receipt_id ? evaluations.get(correction.receipt_id) : undefined
    const receipt = correction.receipt_id ? receiptsById.get(correction.receipt_id) : undefined
    const fields = [
      {
        kind: 'receipt_store' as const,
        raw: normalizedText(correction.ocr_raw_store_name),
        corrected: normalizedText(correction.corrected_store_name),
      },
      {
        kind: 'receipt_date' as const,
        raw: normalizedDate(correction.ocr_raw_date),
        corrected: normalizedDate(correction.corrected_date),
      },
    ].filter((field) => field.corrected !== null)

    if (fields.length === 0) {
      events.push({
        sourceId: correction.id,
        receiptId: correction.receipt_id,
        contributorId: receipt?.uploaded_by ?? null,
        kind: 'receipt_store',
        context: '',
        raw: null,
        corrected: null,
        baseClassification: 'unusable',
      })
      continue
    }

    for (const field of fields) {
      const complete = receiptCorrectionMatchesSourceAndFinal(
        field.kind,
        field.raw,
        field.corrected,
        receipt,
        evaluation
      )
      events.push({
        sourceId: `${correction.id}:${field.kind}`,
        receiptId: correction.receipt_id,
        contributorId: receipt?.uploaded_by ?? null,
        kind: field.kind,
        context: '',
        raw: field.raw,
        corrected: field.corrected,
        baseClassification:
          !field.raw || !field.corrected ? 'unusable' : complete ? 'complete' : 'partial',
      })
    }
  }

  return events
}

function summarizeEvidence(events: EvidenceEvent[]) {
  const targetsByPattern = new Map<string, Set<string>>()
  for (const event of events) {
    if (event.baseClassification === 'unusable' || !event.raw || !event.corrected) continue
    const pattern = `${event.kind}|${event.context}|${event.raw}`
    const targets = targetsByPattern.get(pattern) ?? new Set<string>()
    targets.add(event.corrected)
    targetsByPattern.set(pattern, targets)
  }
  const conflictingPatterns = new Set(
    [...targetsByPattern.entries()]
      .filter(([, targets]) => targets.size > 1)
      .map(([pattern]) => pattern)
  )

  const eventsByCandidate = new Map<string, EvidenceEvent[]>()
  for (const event of events) {
    if (event.baseClassification === 'unusable' || !event.raw || !event.corrected) continue
    const candidate = `${event.kind}|${event.context}|${event.raw}|${event.corrected}`
    const candidateEvents = eventsByCandidate.get(candidate) ?? []
    candidateEvents.push(event)
    eventsByCandidate.set(candidate, candidateEvents)
  }

  let oneOffPatterns = 0
  let repeatedByOneContributorPatterns = 0
  let supportedByMultipleContributorsPatterns = 0
  let unknownContributorPatterns = 0
  for (const patternEvents of eventsByCandidate.values()) {
    const contributors = new Set(
      patternEvents.flatMap((event) => (event.contributorId ? [event.contributorId] : []))
    )
    if (contributors.size === 0) unknownContributorPatterns += 1
    else if (patternEvents.length === 1) oneOffPatterns += 1
    else if (contributors.size === 1) repeatedByOneContributorPatterns += 1
    else supportedByMultipleContributorsPatterns += 1
  }

  const counts = { complete: 0, partial: 0, conflicting: 0, unusable: 0 }
  for (const event of events) {
    const pattern = event.raw ? `${event.kind}|${event.context}|${event.raw}` : null
    if (pattern && conflictingPatterns.has(pattern)) counts.conflicting += 1
    else counts[event.baseClassification] += 1
  }

  return {
    total: events.length,
    ...counts,
    conflictingPatterns: conflictingPatterns.size,
    independence: {
      candidatePatterns: eventsByCandidate.size,
      oneOffPatterns,
      repeatedByOneContributorPatterns,
      supportedByMultipleContributorsPatterns,
      unknownContributorPatterns,
    },
  }
}

function summarizeReviewSignals(
  receipts: HistoricalReceipt[],
  events: EvidenceEvent[],
  feedbackEvents: HistoricalFeedbackEvent[]
) {
  const candidateReceiptIds = new Set(receipts.map((receipt) => receipt.id))
  const explicitCorrectionReceiptIds = new Set(
    events.flatMap((event) =>
      event.receiptId &&
      candidateReceiptIds.has(event.receiptId) &&
      event.baseClassification !== 'unusable'
        ? [event.receiptId]
        : []
    )
  )
  const contributorReceiptCounts = new Map<string, number>()
  for (const receipt of receipts) {
    if (!receipt.uploaded_by) continue
    contributorReceiptCounts.set(
      receipt.uploaded_by,
      (contributorReceiptCounts.get(receipt.uploaded_by) ?? 0) + 1
    )
  }
  const contributorsWithExplicitCorrections = new Set(
    events.flatMap((event) =>
      event.receiptId &&
      candidateReceiptIds.has(event.receiptId) &&
      event.baseClassification !== 'unusable' &&
      event.contributorId
        ? [event.contributorId]
        : []
    )
  )
  const knownContributorReceipts = [...contributorReceiptCounts.values()].reduce(
    (sum, count) => sum + count,
    0
  )
  const largestContributorReceiptCount = Math.max(0, ...contributorReceiptCounts.values())
  const expectedFeedbackReceipts = receipts.filter((receipt) => receipt.scan_feedback_expected)
  const completedFeedbackReceipts = expectedFeedbackReceipts.filter(
    (receipt) => receipt.scan_feedback_recorded_at !== null
  )
  const reviewEvents = feedbackEvents.filter(
    (event) => candidateReceiptIds.has(event.receipt_id) && event.event_type === 'review_saved'
  )
  const recordedReviewReceiptIds = new Set(reviewEvents.map((event) => event.receipt_id))
  const saveOnlyReviewReceiptIds = new Set(
    reviewEvents.flatMap((event) => {
      const context = asRecord(event.context)
      return context?.['confirmationMode'] === 'save_only' ? [event.receipt_id] : []
    })
  )
  const explicitlyConfirmedReceiptIds = new Set(
    feedbackEvents.flatMap((event) =>
      candidateReceiptIds.has(event.receipt_id) && event.event_type === 'field_confirmed'
        ? [event.receipt_id]
        : []
    )
  )

  return {
    candidateReceipts: receipts.length,
    receiptsWithExplicitCorrections: explicitCorrectionReceiptIds.size,
    receiptsWithoutExplicitCorrections: receipts.length - explicitCorrectionReceiptIds.size,
    explicitCorrectionRate: ratio(explicitCorrectionReceiptIds.size, receipts.length),
    distinctContributors: contributorReceiptCounts.size,
    contributorsWithExplicitCorrections: contributorsWithExplicitCorrections.size,
    maxContributorReceiptShare: ratio(largestContributorReceiptCount, knownContributorReceipts),
    recordedReviewReceipts: recordedReviewReceiptIds.size,
    saveOnlyReviewReceipts: saveOnlyReviewReceiptIds.size,
    explicitlyConfirmedReceipts: explicitlyConfirmedReceiptIds.size,
    feedbackEventActors: new Set(
      feedbackEvents.flatMap((event) => (event.actor_id ? [event.actor_id] : []))
    ).size,
    expectedFeedbackReceipts: expectedFeedbackReceipts.length,
    completedFeedbackReceipts: completedFeedbackReceipts.length,
    pendingFeedbackReceipts: expectedFeedbackReceipts.length - completedFeedbackReceipts.length,
  }
}

function summarizeQualitySignals(receipts: HistoricalReceipt[], events: EvidenceEvent[]) {
  const explicitReceiptIds = new Set(
    events.flatMap((event) =>
      event.receiptId && event.baseClassification !== 'unusable' ? [event.receiptId] : []
    )
  )
  const assessed = receipts.filter((receipt) => receipt.scan_quality_schema_version)
  const baseline = receipts.filter((receipt) => !receipt.scan_quality_schema_version)
  let correctedWarnings = 0
  let dismissedWarnings = 0
  let unresolvedWarnings = 0

  for (const receipt of assessed) {
    if (!Array.isArray(receipt.scan_quality_warnings)) continue
    for (const warning of receipt.scan_quality_warnings) {
      const outcome = asRecord(warning)?.['outcome']
      if (outcome === 'corrected') correctedWarnings += 1
      else if (outcome === 'dismissed') dismissedWarnings += 1
      else if (outcome === 'unresolved') unresolvedWarnings += 1
    }
  }

  const baselineRate = ratio(
    baseline.filter((receipt) => explicitReceiptIds.has(receipt.id)).length,
    baseline.length
  )
  const qualityRate = ratio(
    assessed.filter((receipt) => explicitReceiptIds.has(receipt.id)).length,
    assessed.length
  )

  return {
    assessedReceipts: assessed.length,
    highRiskReceipts: assessed.filter((receipt) => receipt.scan_quality_level === 'high').length,
    lowReviewRiskReceipts: assessed.filter((receipt) => receipt.scan_low_review_risk).length,
    correctedWarnings,
    dismissedWarnings,
    unresolvedWarnings,
    savedIncorrectScanProxyRate: ratio(
      assessed.filter((receipt) => receipt.scan_saved_with_unresolved_warnings).length,
      assessed.length
    ),
    baselineExplicitCorrectionRate: baselineRate,
    qualityPeriodExplicitCorrectionRate: qualityRate,
    explicitCorrectionRateChange:
      baselineRate === null || qualityRate === null ? null : qualityRate - baselineRate,
  }
}

export function analyzeHistoricalScans(
  dataset: HistoricalScanDataset,
  costRates?: ScanCostRates
): ScanAnalysisReport {
  const itemsByReceipt = new Map<string, HistoricalExpenseItem[]>()
  for (const item of dataset.expenseItems) {
    if (!item.receipt_id) continue
    const items = itemsByReceipt.get(item.receipt_id) ?? []
    items.push(item)
    itemsByReceipt.set(item.receipt_id, items)
  }

  const evaluations = new Map<string, ReceiptEvaluation>()
  const overall = emptyAccumulator()
  const byModel = new Map<string, MetricAccumulator>()
  const byPromptVersion = new Map<string, MetricAccumulator>()
  const byStore = new Map<string, MetricAccumulator>()
  let completeReceipts = 0
  let partialReceipts = 0
  let unusableReceipts = 0

  for (const receipt of dataset.receipts) {
    const evaluation = evaluateReceipt(receipt, itemsByReceipt.get(receipt.id) ?? [])
    evaluations.set(receipt.id, evaluation)
    if (evaluation.classification === 'complete') {
      completeReceipts += 1
      addReceiptMetrics(overall, receipt, evaluation)
      addToGroup(byModel, receipt.scan_model, receipt, evaluation)
      addToGroup(byPromptVersion, receipt.scan_prompt_version, receipt, evaluation)
      addToGroup(byStore, receipt.store_name, receipt, evaluation)
    } else if (evaluation.classification === 'partial') {
      partialReceipts += 1
    } else {
      unusableReceipts += 1
    }
  }

  const evidenceEvents = buildEvidenceEvents(dataset, evaluations)
  const evidence = summarizeEvidence(evidenceEvents)
  const candidateReceipts = dataset.receipts.length

  return {
    coverage: {
      candidateReceipts,
      completeReceipts,
      partialReceipts,
      unusableReceipts,
      completeRate: ratio(completeReceipts, candidateReceipts),
    },
    evidence,
    reviewSignals: summarizeReviewSignals(dataset.receipts, evidenceEvents, dataset.feedbackEvents),
    qualitySignals: summarizeQualitySignals(dataset.receipts, evidenceEvents),
    overall: summarize(overall, costRates),
    byModel: summarizeGroups(byModel, costRates),
    byPromptVersion: summarizeGroups(byPromptVersion, costRates),
    byStore: summarizeGroups(byStore, costRates),
    limitations: [
      'Accuracy metrics include only complete receipts with deterministic final-item matching.',
      'Partial correction evidence can support future suggestions but cannot establish an accuracy denominator.',
      'Estimated provider cost is omitted unless explicit per-million-token rates are supplied.',
      'Historical corrections record changed fields, not why the user made each change.',
      'A save without an explicit correction is not proof that the user reviewed or confirmed every scanned field.',
      'Repeated evidence from one contributor is correlated personal support, not independent global agreement.',
      'Legacy correction rows do not record field touches, suggestion provenance, acceptance, rejection, undo, or review duration.',
      'Legacy correction rows could be lost after a financial save; versioned feedback now exposes expected-but-pending receipts for repair.',
    ],
  }
}
