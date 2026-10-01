import { describe, expect, it } from 'vitest'
import {
  analyzeHistoricalScans,
  parseScanAnalysisArgs,
  type HistoricalExpenseItem,
  type HistoricalReceipt,
  type HistoricalScanDataset,
} from './receipt-scan-analysis'

function receipt(overrides: Partial<HistoricalReceipt> = {}): HistoricalReceipt {
  return {
    id: 'receipt-1',
    family_id: 'family-1',
    uploaded_by: 'user-1',
    store_name: 'K-Market',
    receipt_date: '2026-08-02',
    total_amount: 3.5,
    scan_provider: 'openai',
    scan_model: 'gpt-test',
    scan_prompt_version: 'v14',
    scan_schema_version: 'v4',
    scan_raw_result: {
      storeName: 'K-Market',
      receiptDateRaw: '2.8.2026',
      totalAmount: 3.5,
      items: [
        { name: 'Banaani', amount: 1.5, quantity: 1, unit: 'kg' },
        { name: 'Maito', amount: 2, quantity: 1, unit: 'kpl' },
      ],
    },
    scan_latency_ms: 1200,
    scan_input_tokens: 100,
    scan_output_tokens: 50,
    scan_feedback_expected: false,
    scan_feedback_schema_version: null,
    scan_feedback_recorded_at: null,
    ...overrides,
  }
}

function expense(overrides: Partial<HistoricalExpenseItem> = {}): HistoricalExpenseItem {
  return {
    id: 'expense-1',
    receipt_id: 'receipt-1',
    name: 'Banaani',
    amount: 1.5,
    quantity: 1,
    unit: 'kg',
    is_manual: false,
    is_on_receipt: true,
    receipt_line_index: 0,
    ...overrides,
  }
}

function dataset(overrides: Partial<HistoricalScanDataset> = {}): HistoricalScanDataset {
  return {
    receipts: [receipt()],
    expenseItems: [
      expense(),
      expense({ id: 'expense-2', name: 'Maito', amount: 2, unit: 'kpl', receipt_line_index: 1 }),
    ],
    itemCorrections: [],
    receiptCorrections: [],
    feedbackEvents: [],
    ...overrides,
  }
}

describe('analyzeHistoricalScans', () => {
  it('compares persisted quality outcomes with the pre-quality baseline', () => {
    const report = analyzeHistoricalScans(
      dataset({
        receipts: [
          receipt({ id: 'baseline' }),
          receipt({
            id: 'quality',
            scan_quality_schema_version: 'v1',
            scan_quality_score: 55,
            scan_quality_level: 'high',
            scan_low_review_risk: true,
            scan_saved_with_unresolved_warnings: true,
            scan_quality_warnings: [
              { outcome: 'corrected' },
              { outcome: 'dismissed' },
              { outcome: 'unresolved' },
            ],
          }),
        ],
        expenseItems: [
          expense({ id: 'baseline-1', receipt_id: 'baseline' }),
          expense({
            id: 'baseline-2',
            receipt_id: 'baseline',
            name: 'Maito',
            amount: 2,
            unit: 'kpl',
            receipt_line_index: 1,
          }),
          expense({ id: 'quality-1', receipt_id: 'quality' }),
          expense({
            id: 'quality-2',
            receipt_id: 'quality',
            name: 'Maito',
            amount: 2,
            unit: 'kpl',
            receipt_line_index: 1,
          }),
        ],
      })
    )

    expect(report.qualitySignals).toEqual({
      assessedReceipts: 1,
      highRiskReceipts: 1,
      lowReviewRiskReceipts: 1,
      correctedWarnings: 1,
      dismissedWarnings: 1,
      unresolvedWarnings: 1,
      savedIncorrectScanProxyRate: 1,
      baselineExplicitCorrectionRate: 0,
      qualityPeriodExplicitCorrectionRate: 0,
      explicitCorrectionRateChange: 0,
    })
  })

  it('classifies a deterministically matched receipt as complete and reports perfect accuracy', () => {
    const report = analyzeHistoricalScans(dataset())

    expect(report.coverage).toEqual({
      candidateReceipts: 1,
      completeReceipts: 1,
      partialReceipts: 0,
      unusableReceipts: 0,
      completeRate: 1,
    })
    expect(report.overall).toMatchObject({
      receiptCount: 1,
      rawItemCount: 2,
      matchedItemCount: 2,
      missedItemCount: 0,
      falseItemCount: 0,
      itemRecall: 1,
      falseItemRate: 0,
      nameAccuracy: 1,
      priceAccuracy: 1,
      quantityAccuracy: 1,
      unitAccuracy: 1,
      storeAccuracy: 1,
      dateAccuracy: 1,
      totalAccuracy: 1,
      averageLatencyMs: 1200,
      inputTokens: 100,
      outputTokens: 50,
    })
    expect(report.reviewSignals).toEqual({
      candidateReceipts: 1,
      receiptsWithExplicitCorrections: 0,
      receiptsWithoutExplicitCorrections: 1,
      explicitCorrectionRate: 0,
      distinctContributors: 1,
      contributorsWithExplicitCorrections: 0,
      maxContributorReceiptShare: 1,
      recordedReviewReceipts: 0,
      saveOnlyReviewReceipts: 0,
      explicitlyConfirmedReceipts: 0,
      feedbackEventActors: 0,
      expectedFeedbackReceipts: 0,
      completedFeedbackReceipts: 0,
      pendingFeedbackReceipts: 0,
    })
  })

  it('measures corrected fields, false items, and manually added missed items', () => {
    const report = analyzeHistoricalScans(
      dataset({
        expenseItems: [
          expense({ name: 'Banaani Chiquita', amount: 1.75, quantity: 2, unit: 'kpl' }),
          expense({
            id: 'expense-missed',
            name: 'Sipuli',
            amount: 0.8,
            is_manual: true,
            receipt_line_index: null,
          }),
        ],
      })
    )

    expect(report.overall).toMatchObject({
      matchedItemCount: 1,
      missedItemCount: 1,
      falseItemCount: 1,
      itemRecall: 0.5,
      falseItemRate: 0.5,
      fieldCorrections: {
        name: 1,
        price: 1,
        quantity: 1,
        unit: 1,
        store: 0,
        date: 0,
        total: 0,
      },
      nameAccuracy: 0,
      priceAccuracy: 0,
      quantityAccuracy: 0,
      unitAccuracy: 0,
    })
  })

  it('excludes partial and unusable receipts from accuracy metrics', () => {
    const partial = receipt({ id: 'partial' })
    const unusable = receipt({ id: 'unusable', scan_raw_result: { items: 'not-an-array' } })
    const report = analyzeHistoricalScans({
      receipts: [partial, unusable],
      expenseItems: [expense({ id: 'ambiguous', receipt_id: 'partial', receipt_line_index: null })],
      itemCorrections: [],
      receiptCorrections: [],
      feedbackEvents: [],
    })

    expect(report.coverage).toEqual({
      candidateReceipts: 2,
      completeReceipts: 0,
      partialReceipts: 1,
      unusableReceipts: 1,
      completeRate: 0,
    })
    expect(report.overall.receiptCount).toBe(0)
    expect(report.overall.itemRecall).toBeNull()
  })

  it('groups complete metrics and calculates cost only from explicit rates', () => {
    const secondReceipt = receipt({
      id: 'receipt-2',
      store_name: 'Lidl',
      scan_model: 'gpt-other',
      scan_prompt_version: 'v15',
      scan_input_tokens: 200,
      scan_output_tokens: 80,
    })
    const report = analyzeHistoricalScans(
      dataset({
        receipts: [receipt(), secondReceipt],
        expenseItems: [
          expense(),
          expense({
            id: 'expense-2',
            name: 'Maito',
            amount: 2,
            unit: 'kpl',
            receipt_line_index: 1,
          }),
          expense({ id: 'expense-3', receipt_id: 'receipt-2' }),
          expense({
            id: 'expense-4',
            receipt_id: 'receipt-2',
            name: 'Maito',
            amount: 2,
            unit: 'kpl',
            receipt_line_index: 1,
          }),
        ],
      }),
      { inputPerMillion: 1, outputPerMillion: 2, currency: 'USD' }
    )

    expect(Object.keys(report.byModel)).toEqual(['gpt-other', 'gpt-test'])
    expect(Object.keys(report.byPromptVersion)).toEqual(['v14', 'v15'])
    expect(Object.keys(report.byStore)).toEqual(['K-Market', 'Lidl'])
    expect(report.overall.estimatedCost).toBeCloseTo(0.00056)
    expect(report.overall.costCurrency).toBe('USD')
  })

  it('classifies linked, partial, conflicting, and unusable correction evidence', () => {
    const report = analyzeHistoricalScans(
      dataset({
        itemCorrections: [
          {
            id: 'complete',
            receipt_id: 'receipt-1',
            ocr_raw_name: 'Banaani',
            ocr_raw_price: 1.5,
            ocr_raw_quantity: 1,
            ocr_raw_unit: 'kg',
            corrected_name: 'Banaani Chiquita',
            corrected_price: 1.5,
            corrected_quantity: 1,
            corrected_unit: 'kg',
            store_name: 'K-Market',
          },
          {
            id: 'conflict',
            receipt_id: null,
            ocr_raw_name: 'Banaani',
            ocr_raw_price: null,
            ocr_raw_quantity: null,
            ocr_raw_unit: null,
            corrected_name: 'Luomubanaani',
            corrected_price: null,
            corrected_quantity: null,
            corrected_unit: null,
            store_name: 'K-Market',
          },
          {
            id: 'partial',
            receipt_id: null,
            ocr_raw_name: 'Maito',
            ocr_raw_price: 2,
            ocr_raw_quantity: 1,
            ocr_raw_unit: 'kpl',
            corrected_name: 'Kevytmaito',
            corrected_price: 2,
            corrected_quantity: 1,
            corrected_unit: 'kpl',
            store_name: 'K-Market',
          },
        ],
        receiptCorrections: [
          {
            id: 'unusable',
            receipt_id: null,
            ocr_raw_store_name: null,
            corrected_store_name: null,
            ocr_raw_date: null,
            corrected_date: null,
          },
        ],
      })
    )

    expect(report.evidence).toMatchObject({
      total: 4,
      complete: 0,
      partial: 1,
      conflicting: 2,
      unusable: 1,
      conflictingPatterns: 1,
      independence: {
        candidatePatterns: 3,
        oneOffPatterns: 1,
        repeatedByOneContributorPatterns: 0,
        supportedByMultipleContributorsPatterns: 0,
        unknownContributorPatterns: 2,
      },
    })
  })

  it('keeps a correction partial when duplicate raw lines prevent unique matching', () => {
    const duplicated = receipt({
      scan_raw_result: {
        storeName: 'K-Market',
        receiptDateRaw: '2.8.2026',
        totalAmount: 3,
        items: [
          { name: 'Banaani', amount: 1.5, quantity: 1, unit: 'kg' },
          { name: 'Banaani', amount: 1.5, quantity: 1, unit: 'kg' },
        ],
      },
    })
    const report = analyzeHistoricalScans(
      dataset({
        receipts: [duplicated],
        expenseItems: [expense(), expense({ id: 'expense-2', receipt_line_index: 1 })],
        itemCorrections: [
          {
            id: 'ambiguous-correction',
            receipt_id: 'receipt-1',
            ocr_raw_name: 'Banaani',
            ocr_raw_price: 1.5,
            ocr_raw_quantity: 1,
            ocr_raw_unit: 'kg',
            corrected_name: 'Banaani Chiquita',
            corrected_price: 1.5,
            corrected_quantity: 1,
            corrected_unit: 'kg',
            store_name: 'K-Market',
          },
        ],
      })
    )

    expect(report.coverage.completeReceipts).toBe(1)
    expect(report.evidence).toMatchObject({ total: 1, complete: 0, partial: 1 })
  })

  it('requires correction evidence to match both the original scan and final saved values', () => {
    const correctedReceipt = receipt({
      store_name: 'K-Market Kamppi',
      receipt_date: '2026-08-03',
    })
    const report = analyzeHistoricalScans(
      dataset({
        receipts: [correctedReceipt],
        expenseItems: [
          expense({ name: 'Banaani Chiquita' }),
          expense({
            id: 'expense-2',
            name: 'Maito',
            amount: 2,
            unit: 'kpl',
            receipt_line_index: 1,
          }),
        ],
        itemCorrections: [
          {
            id: 'item-chain',
            receipt_id: 'receipt-1',
            ocr_raw_name: 'Banaani',
            ocr_raw_price: 1.5,
            ocr_raw_quantity: 1,
            ocr_raw_unit: 'kg',
            corrected_name: 'Banaani Chiquita',
            corrected_price: 1.5,
            corrected_quantity: 1,
            corrected_unit: 'kg',
            store_name: 'K-Market',
          },
        ],
        receiptCorrections: [
          {
            id: 'receipt-chain',
            receipt_id: 'receipt-1',
            ocr_raw_store_name: 'K-Market',
            corrected_store_name: 'K-Market Kamppi',
            ocr_raw_date: '2026-08-02',
            corrected_date: '2026-08-03',
          },
        ],
      })
    )

    expect(report.evidence).toMatchObject({
      total: 3,
      complete: 3,
      partial: 0,
      conflicting: 0,
      unusable: 0,
      conflictingPatterns: 0,
    })
  })

  it('does not treat different numeric source values as one conflicting field pattern', () => {
    const baseCorrection = {
      receipt_id: null,
      ocr_raw_name: 'Banaani',
      ocr_raw_quantity: 1,
      ocr_raw_unit: 'kg',
      corrected_name: null,
      corrected_quantity: null,
      corrected_unit: null,
      store_name: 'K-Market',
    }
    const report = analyzeHistoricalScans(
      dataset({
        itemCorrections: [
          {
            ...baseCorrection,
            id: 'price-one',
            ocr_raw_price: 1,
            corrected_price: 1.1,
          },
          {
            ...baseCorrection,
            id: 'price-two',
            ocr_raw_price: 2,
            corrected_price: 2.1,
          },
        ],
      })
    )

    expect(report.evidence).toMatchObject({
      total: 2,
      complete: 0,
      partial: 2,
      conflicting: 0,
      conflictingPatterns: 0,
    })
  })

  it('separates repeated evidence from one contributor and independent contributors', () => {
    const correction = (id: string, receiptId: string) => ({
      id,
      receipt_id: receiptId,
      ocr_raw_name: 'Banaani',
      ocr_raw_price: 1.5,
      ocr_raw_quantity: 1,
      ocr_raw_unit: 'kg',
      corrected_name: 'Banaani Chiquita',
      corrected_price: 1.5,
      corrected_quantity: 1,
      corrected_unit: 'kg',
      store_name: 'K-Market',
    })
    const report = analyzeHistoricalScans(
      dataset({
        receipts: [
          receipt(),
          receipt({ id: 'receipt-2', uploaded_by: 'user-1' }),
          receipt({ id: 'receipt-3', uploaded_by: 'user-2' }),
          receipt({ id: 'receipt-4', uploaded_by: 'user-3' }),
        ],
        expenseItems: [],
        itemCorrections: [
          correction('correction-1', 'receipt-1'),
          correction('correction-2', 'receipt-2'),
          correction('correction-3', 'receipt-3'),
        ],
      })
    )

    expect(report.evidence.independence).toEqual({
      candidatePatterns: 1,
      oneOffPatterns: 0,
      repeatedByOneContributorPatterns: 0,
      supportedByMultipleContributorsPatterns: 1,
      unknownContributorPatterns: 0,
    })
    expect(report.reviewSignals).toEqual({
      candidateReceipts: 4,
      receiptsWithExplicitCorrections: 3,
      receiptsWithoutExplicitCorrections: 1,
      explicitCorrectionRate: 0.75,
      distinctContributors: 3,
      contributorsWithExplicitCorrections: 2,
      maxContributorReceiptShare: 0.5,
      recordedReviewReceipts: 0,
      saveOnlyReviewReceipts: 0,
      explicitlyConfirmedReceipts: 0,
      feedbackEventActors: 0,
      expectedFeedbackReceipts: 0,
      completedFeedbackReceipts: 0,
      pendingFeedbackReceipts: 0,
    })

    const singleContributorReport = analyzeHistoricalScans(
      dataset({
        receipts: [receipt(), receipt({ id: 'receipt-2', uploaded_by: 'user-1' })],
        expenseItems: [],
        itemCorrections: [
          correction('correction-1', 'receipt-1'),
          correction('correction-2', 'receipt-2'),
        ],
      })
    )

    expect(singleContributorReport.evidence.independence).toMatchObject({
      repeatedByOneContributorPatterns: 1,
      supportedByMultipleContributorsPatterns: 0,
    })
  })

  it('reports save-only review events without treating them as confirmation', () => {
    const report = analyzeHistoricalScans(
      dataset({
        feedbackEvents: [
          {
            id: 'feedback-1',
            receipt_id: 'receipt-1',
            actor_id: 'user-1',
            event_type: 'review_saved',
            context: { confirmationMode: 'save_only' },
          },
        ],
      })
    )

    expect(report.reviewSignals).toMatchObject({
      recordedReviewReceipts: 1,
      saveOnlyReviewReceipts: 1,
      explicitlyConfirmedReceipts: 0,
      feedbackEventActors: 1,
    })
  })

  it('reports expected feedback that remains pending after a save failure', () => {
    const report = analyzeHistoricalScans(
      dataset({
        receipts: [
          receipt({
            scan_feedback_expected: true,
            scan_feedback_schema_version: 'v1',
            scan_feedback_recorded_at: null,
          }),
        ],
      })
    )

    expect(report.reviewSignals).toMatchObject({
      expectedFeedbackReceipts: 1,
      completedFeedbackReceipts: 0,
      pendingFeedbackReceipts: 1,
    })
  })
})

describe('parseScanAnalysisArgs', () => {
  const familyId = '15000000-0000-4000-8000-000000000001'

  it('requires an explicitly scoped family and accepts repeatable cost inputs', () => {
    expect(
      parseScanAnalysisArgs([
        '--family-id',
        familyId,
        '--limit=25',
        '--input-cost-per-million',
        '0.15',
        '--output-cost-per-million=0.60',
        '--cost-currency',
        'eur',
      ])
    ).toEqual({
      familyId,
      output: null,
      limit: 25,
      costRates: { inputPerMillion: 0.15, outputPerMillion: 0.6, currency: 'EUR' },
      help: false,
    })
  })

  it('rejects unscoped analysis and incomplete cost configuration', () => {
    expect(() => parseScanAnalysisArgs([])).toThrow(/unscoped analysis is not allowed/i)
    expect(() =>
      parseScanAnalysisArgs(['--family-id', familyId, '--input-cost-per-million', '0.15'])
    ).toThrow(/both input and output cost rates/i)
  })

  it('allows help without credentials or a family selector', () => {
    expect(parseScanAnalysisArgs(['--help'])).toEqual({
      familyId: null,
      output: null,
      limit: null,
      help: true,
    })
  })
})
