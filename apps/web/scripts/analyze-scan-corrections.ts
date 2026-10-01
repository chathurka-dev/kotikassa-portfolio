import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { config } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  analyzeHistoricalScans,
  parseScanAnalysisArgs,
  type HistoricalExpenseItem,
  type HistoricalFeedbackEvent,
  type HistoricalItemCorrection,
  type HistoricalReceipt,
  type HistoricalReceiptCorrection,
} from '../lib/receipt-scan-analysis'

config({ path: resolve(process.cwd(), 'apps/web/.env.local'), quiet: true })

const PAGE_SIZE = 500
const RECEIPT_BATCH_SIZE = 100

const HELP = `Usage:
  npm run scan:analyze -- --family-id <uuid> [options]

Required:
  --family-id <uuid>                  Analyse exactly one household

Options:
  --limit <count>                     Analyse only the oldest selected receipts
  --output <path>                     Write JSON without overwriting an existing file
  --input-cost-per-million <amount>   Provider input-token rate
  --output-cost-per-million <amount>  Provider output-token rate
  --cost-currency <code>              Three-letter currency code (default: USD)
  --help                              Show this help

The command performs SELECT queries only. Monetary cost is omitted unless both
token rates are supplied explicitly.`

type QueryResult<T> = { data: T[] | null; error: { message: string } | null }

async function fetchPages<T>(
  loadPage: (from: number, to: number) => PromiseLike<QueryResult<T>>,
  limit: number | null = null
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const remaining = limit === null ? PAGE_SIZE : Math.min(PAGE_SIZE, limit - rows.length)
    if (remaining <= 0) break
    const { data, error } = await loadPage(from, from + remaining - 1)
    if (error) throw new Error(error.message)
    const page = data ?? []
    rows.push(...page)
    if (page.length < remaining) break
  }
  return rows
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

async function verifyFamily(supabase: SupabaseClient, familyId: string) {
  const { data, error } = await supabase
    .from('families')
    .select('id')
    .eq('id', familyId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error(`No household found for family ID ${familyId}`)
}

async function fetchReceipts(
  supabase: SupabaseClient,
  familyId: string,
  limit: number | null
): Promise<HistoricalReceipt[]> {
  return fetchPages<HistoricalReceipt>(
    (from, to) =>
      supabase
        .from('receipts')
        .select(
          'id,family_id,uploaded_by,store_name,receipt_date,total_amount,scan_provider,scan_model,scan_prompt_version,scan_schema_version,scan_raw_result,scan_latency_ms,scan_input_tokens,scan_output_tokens,scan_feedback_expected,scan_feedback_schema_version,scan_feedback_recorded_at,scan_quality_schema_version,scan_quality_score,scan_quality_level,scan_quality_warnings,scan_review_duration_ms,scan_low_review_risk,scan_saved_with_unresolved_warnings'
        )
        .eq('family_id', familyId)
        .eq('status', 'confirmed')
        .not('scan_provider', 'is', null)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<QueryResult<HistoricalReceipt>>,
    limit
  )
}

async function fetchExpenseItems(
  supabase: SupabaseClient,
  receiptIds: string[]
): Promise<HistoricalExpenseItem[]> {
  const rows: HistoricalExpenseItem[] = []
  for (const receiptIdBatch of chunks(receiptIds, RECEIPT_BATCH_SIZE)) {
    const batchRows = await fetchPages<HistoricalExpenseItem>(
      (from, to) =>
        supabase
          .from('expense_items')
          .select(
            'id,receipt_id,name,amount,quantity,unit,is_manual,is_on_receipt,receipt_line_index'
          )
          .in('receipt_id', receiptIdBatch)
          .order('receipt_id', { ascending: true })
          .order('receipt_line_index', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<QueryResult<HistoricalExpenseItem>>
    )
    rows.push(...batchRows)
  }
  return rows
}

async function fetchItemCorrections(
  supabase: SupabaseClient,
  familyId: string
): Promise<HistoricalItemCorrection[]> {
  return fetchPages<HistoricalItemCorrection>(
    (from, to) =>
      supabase
        .from('ocr_corrections')
        .select(
          'id,receipt_id,ocr_raw_name,ocr_raw_price,ocr_raw_quantity,ocr_raw_unit,corrected_name,corrected_price,corrected_quantity,corrected_unit,store_name'
        )
        .eq('family_id', familyId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<QueryResult<HistoricalItemCorrection>>
  )
}

async function fetchReceiptCorrections(
  supabase: SupabaseClient,
  familyId: string
): Promise<HistoricalReceiptCorrection[]> {
  return fetchPages<HistoricalReceiptCorrection>(
    (from, to) =>
      supabase
        .from('ocr_receipt_corrections')
        .select('id,receipt_id,ocr_raw_store_name,corrected_store_name,ocr_raw_date,corrected_date')
        .eq('family_id', familyId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<QueryResult<HistoricalReceiptCorrection>>
  )
}

async function fetchFeedbackEvents(
  supabase: SupabaseClient,
  familyId: string
): Promise<HistoricalFeedbackEvent[]> {
  return fetchPages<HistoricalFeedbackEvent>(
    (from, to) =>
      supabase
        .from('receipt_scan_feedback_events')
        .select('id,receipt_id,actor_id,event_type,context')
        .eq('family_id', familyId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<QueryResult<HistoricalFeedbackEvent>>
  )
}

async function main() {
  const options = parseScanAnalysisArgs(process.argv.slice(2))
  if (options.help) {
    console.log(HELP)
    return
  }

  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in apps/web/.env.local or the process environment'
    )
  }

  const familyId = options.familyId!
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  await verifyFamily(supabase, familyId)
  const receipts = await fetchReceipts(supabase, familyId, options.limit)
  const [expenseItems, allItemCorrections, allReceiptCorrections, allFeedbackEvents] =
    await Promise.all([
      fetchExpenseItems(
        supabase,
        receipts.map((receipt) => receipt.id)
      ),
      fetchItemCorrections(supabase, familyId),
      fetchReceiptCorrections(supabase, familyId),
      fetchFeedbackEvents(supabase, familyId),
    ])
  const selectedReceiptIds = new Set(receipts.map((receipt) => receipt.id))
  const itemCorrections =
    options.limit === null
      ? allItemCorrections
      : allItemCorrections.filter(
          (correction) => correction.receipt_id && selectedReceiptIds.has(correction.receipt_id)
        )
  const receiptCorrections =
    options.limit === null
      ? allReceiptCorrections
      : allReceiptCorrections.filter(
          (correction) => correction.receipt_id && selectedReceiptIds.has(correction.receipt_id)
        )
  const feedbackEvents = allFeedbackEvents.filter((event) =>
    selectedReceiptIds.has(event.receipt_id)
  )

  const analysis = analyzeHistoricalScans(
    { receipts, expenseItems, itemCorrections, receiptCorrections, feedbackEvents },
    options.costRates
  )
  const output = {
    generatedAt: new Date().toISOString(),
    scope: { familyId, receiptLimit: options.limit },
    sourceCounts: {
      receipts: receipts.length,
      expenseItems: expenseItems.length,
      itemCorrections: itemCorrections.length,
      receiptCorrections: receiptCorrections.length,
      feedbackEvents: feedbackEvents.length,
    },
    costRates: options.costRates ?? null,
    analysis,
  }
  const json = `${JSON.stringify(output, null, 2)}\n`

  if (!options.output) {
    process.stdout.write(json)
    return
  }

  const outputPath = resolve(options.output)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, json, { encoding: 'utf8', flag: 'wx' })
  console.log(`Wrote scan analysis to ${outputPath}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
