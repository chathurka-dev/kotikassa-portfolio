import { createHash } from 'node:crypto'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const RECEIPT_TRAINING_CONSENT_VERSION = '2026-07-12'

const RECEIPT_COLUMNS = [
  'id',
  'image_url',
  'store_name',
  'receipt_date',
  'scan_provider',
  'scan_model',
  'scan_prompt_version',
  'scan_schema_version',
  'uploaded_by',
  'created_at',
  'training_eligible',
  'training_consent_version',
  'training_consented_at',
].join(',')

const ITEM_COLUMNS = [
  'id',
  'receipt_id',
  'name',
  'amount',
  'quantity',
  'unit',
  'discount_amount',
  'original_price',
  'receipt_line_index',
].join(',')

function parseArgs(argv) {
  const options = { receiptId: null, userId: null, consentedUsers: false, output: null, limit: null }

  const readValue = (flag, index) => {
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`)
    return value
  }

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--consented-users' || flag === 'consented-users') options.consentedUsers = true
    else if (flag.startsWith('--receipt-id=')) options.receiptId = flag.slice('--receipt-id='.length)
    else if (flag.startsWith('--user-id=')) options.userId = flag.slice('--user-id='.length)
    else if (flag.startsWith('--output=')) options.output = flag.slice('--output='.length)
    else if (flag.startsWith('--limit=')) options.limit = Number.parseInt(flag.slice('--limit='.length), 10)
    else if (flag === '--receipt-id') {
      options.receiptId = readValue(flag, index)
      index += 1
    } else if (flag === '--user-id') {
      options.userId = readValue(flag, index)
      index += 1
    } else if (flag === '--output') {
      options.output = readValue(flag, index)
      index += 1
    } else if (flag === '--limit') {
      options.limit = Number.parseInt(readValue(flag, index), 10)
      index += 1
    } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(flag)) {
      if (options.receiptId || options.userId) throw new Error(`Unexpected extra UUID: ${flag}`)
      options.userId = flag
    } else throw new Error(`Unknown option: ${flag}`)
  }

  const selectorCount = [options.receiptId, options.userId, options.consentedUsers].filter(Boolean).length
  if (selectorCount !== 1) {
    throw new Error('Provide exactly one selector: --receipt-id, --user-id, or --consented-users')
  }
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error('--limit must be a positive integer')
  }
  return options
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
}

function chunks(values, size) {
  const result = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

function itemOrder(left, right) {
  const leftIndex = left.receipt_line_index ?? Number.MAX_SAFE_INTEGER
  const rightIndex = right.receipt_line_index ?? Number.MAX_SAFE_INTEGER
  return leftIndex - rightIndex || left.id.localeCompare(right.id)
}

function splitName(receiptId, total) {
  if (total < 10) return 'train'
  const bucket = createHash('sha256').update(receiptId).digest()[0] % 10
  if (bucket < 8) return 'train'
  return bucket === 8 ? 'validation' : 'test'
}

function isJpeg(bytes) {
  return bytes.length > 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[bytes.length - 2] === 0xff
    && bytes[bytes.length - 1] === 0xd9
}

async function ensureEmptyDirectory(path) {
  await mkdir(path, { recursive: true })
  const existing = await readdir(path)
  if (existing.length > 0) throw new Error(`Output directory is not empty: ${path}`)
}

async function fetchReceipts(supabase, options) {
  const applyEligibility = (query) => query
    .eq('status', 'confirmed')
    .not('image_url', 'is', null)
    .not('scan_provider', 'is', null)
    .not('scan_schema_version', 'is', null)

  if (options.receiptId) {
    const { data, error } = await applyEligibility(
      supabase.from('receipts').select(RECEIPT_COLUMNS).eq('id', options.receiptId)
    ).maybeSingle()
    if (error) throw error
    return data ? [data] : []
  }

  const receipts = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from('receipts')
      .select(RECEIPT_COLUMNS)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (options.userId) query = query.eq('uploaded_by', options.userId)
    if (options.consentedUsers) query = query
      .eq('training_eligible', true)
      .eq('training_consent_version', RECEIPT_TRAINING_CONSENT_VERSION)

    const { data, error } = await applyEligibility(query)
    if (error) throw error
    receipts.push(...data)
    if (data.length < pageSize || (options.userId && options.limit && receipts.length >= options.limit)) break
  }

  if (!options.consentedUsers) return options.limit ? receipts.slice(0, options.limit) : receipts

  const uploaderIds = [...new Set(receipts.map((receipt) => receipt.uploaded_by).filter(Boolean))]
  const consentedUploaderIds = new Set()
  for (const uploaderIdBatch of chunks(uploaderIds, 100)) {
    const { data, error } = await supabase
      .from('user_privacy_choices')
      .select('user_id')
      .in('user_id', uploaderIdBatch)
      .eq('receipt_training_enabled', true)
      .eq('receipt_training_choice_version', RECEIPT_TRAINING_CONSENT_VERSION)
      .not('receipt_training_consented_at', 'is', null)
      .is('receipt_training_withdrawn_at', null)
    if (error) throw error
    for (const choice of data) consentedUploaderIds.add(choice.user_id)
  }

  const consentedReceipts = receipts.filter((receipt) =>
    consentedUploaderIds.has(receipt.uploaded_by)
    && receipt.training_eligible
    && receipt.training_consent_version === RECEIPT_TRAINING_CONSENT_VERSION
    && receipt.training_consented_at
  )
  return options.limit ? consentedReceipts.slice(0, options.limit) : consentedReceipts
}

async function fetchItems(supabase, receiptIds) {
  const items = []
  for (const receiptIdBatch of chunks(receiptIds, 20)) {
    const pageSize = 1000
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from('expense_items')
        .select(ITEM_COLUMNS)
        .in('receipt_id', receiptIdBatch)
        .eq('is_on_receipt', true)
        .range(offset, offset + pageSize - 1)
      if (error) throw error
      items.push(...data)
      if (data.length < pageSize) break
    }
  }
  return items
}

async function downloadReceipt(supabase, receipt, imageDirectory) {
  const { data, error } = await supabase.storage.from('receipts').download(receipt.image_url)
  if (error) throw error

  const bytes = Buffer.from(await data.arrayBuffer())
  if (!isJpeg(bytes)) throw new Error('Downloaded file is not a complete JPEG')

  const filename = `${receipt.id}.jpg`
  await writeFile(resolve(imageDirectory, filename), bytes)
  return { filename, byteLength: bytes.length }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }

  const outputDirectory = resolve(options.output ?? `training-data/export-${timestamp()}`)
  const imageDirectory = resolve(outputDirectory, 'images')
  await ensureEmptyDirectory(outputDirectory)
  await mkdir(imageDirectory)

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const receipts = await fetchReceipts(supabase, options)
  if (receipts.length === 0) {
    throw new Error('No eligible receipt found. Consented multi-user exports also require current user permission and a matching receipt-level consent snapshot.')
  }

  const items = await fetchItems(supabase, receipts.map((receipt) => receipt.id))
  const itemsByReceipt = new Map()
  for (const item of items) {
    const receiptItems = itemsByReceipt.get(item.receipt_id) ?? []
    receiptItems.push(item)
    itemsByReceipt.set(item.receipt_id, receiptItems)
  }

  const records = []
  const failures = []
  for (const receipt of receipts) {
    const receiptItems = (itemsByReceipt.get(receipt.id) ?? []).sort(itemOrder)
    if (receiptItems.length === 0) {
      failures.push({ receiptId: receipt.id, reason: 'No confirmed on-receipt items' })
      continue
    }

    try {
      const image = await downloadReceipt(supabase, receipt, imageDirectory)
      records.push({
        id: receipt.id,
        image: `images/${image.filename}`,
        label: {
          storeName: receipt.store_name,
          receiptDate: receipt.receipt_date,
          items: receiptItems.map((item) => ({
            name: item.name,
            amount: Number(item.amount),
            quantity: item.quantity === null ? null : Number(item.quantity),
            unit: item.unit,
            discountAmount: item.discount_amount === null ? null : Number(item.discount_amount),
            originalPrice: item.original_price === null ? null : Number(item.original_price),
          })),
        },
        metadata: {
          provider: receipt.scan_provider,
          model: receipt.scan_model,
          promptVersion: receipt.scan_prompt_version,
          schemaVersion: receipt.scan_schema_version,
          imageBytes: image.byteLength,
        },
      })
    } catch (error) {
      failures.push({ receiptId: receipt.id, reason: error instanceof Error ? error.message : String(error) })
    }
  }

  if (records.length === 0) throw new Error(`No complete samples exported. Failures: ${JSON.stringify(failures)}`)

  const splitRecords = { train: [], validation: [], test: [] }
  for (const record of records) splitRecords[splitName(record.id, records.length)].push(record)

  const toJsonl = (values) => values.map((value) => JSON.stringify(value)).join('\n') + (values.length ? '\n' : '')
  await Promise.all([
    writeFile(resolve(outputDirectory, 'all.jsonl'), toJsonl(records), 'utf8'),
    writeFile(resolve(outputDirectory, 'train.jsonl'), toJsonl(splitRecords.train), 'utf8'),
    writeFile(resolve(outputDirectory, 'validation.jsonl'), toJsonl(splitRecords.validation), 'utf8'),
    writeFile(resolve(outputDirectory, 'test.jsonl'), toJsonl(splitRecords.test), 'utf8'),
    writeFile(resolve(outputDirectory, 'manifest.json'), JSON.stringify({
      createdAt: new Date().toISOString(),
      selector: options.receiptId
        ? { receiptId: options.receiptId }
        : options.userId
          ? { userId: options.userId }
          : { consentedUsers: true, consentVersion: RECEIPT_TRAINING_CONSENT_VERSION },
      counts: {
        exported: records.length,
        failed: failures.length,
        train: splitRecords.train.length,
        validation: splitRecords.validation.length,
        test: splitRecords.test.length,
      },
      failures,
    }, null, 2) + '\n', 'utf8'),
  ])

  console.log(`Exported ${records.length} receipt(s) to ${outputDirectory}`)
  console.log(`Splits: train=${splitRecords.train.length}, validation=${splitRecords.validation.length}, test=${splitRecords.test.length}`)
  if (failures.length > 0) console.warn(`Skipped ${failures.length} receipt(s); see manifest.json`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
