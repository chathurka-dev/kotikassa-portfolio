'use client'

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Loader2, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Sentry from '@sentry/nextjs'
import { createClient, SCAN_ERROR_CODES } from '@kotikassa/shared'
import { compressReceiptImage } from '@/lib/receipt-image'
import { compareReceipt, type MatchItem, type ReceiptMatchResult } from '@/lib/receipt-match'
import { useFormatCurrency } from '@/lib/currency-context'

interface ReceiptValue {
  id: string
  store_name: string | null
  receipt_date: string | null
  total_amount: number | null
}

export interface RecoveryReceiptItem {
  id: string
  name: string
  amount: number
  quantity: number | null
  unit: string | null
  discount_amount: number | null
  original_price: number | null
  receipt_line_index: number | null
  categories: { name: string; icon: string } | null
}

type RecoveryReceiptItemRow = Omit<RecoveryReceiptItem, 'categories'> & {
  categories:
    | RecoveryReceiptItem['categories']
    | Array<NonNullable<RecoveryReceiptItem['categories']>>
}

interface ScanItem extends MatchItem {
  quantity: number
  unit: string
  unitPrice: number | null
  discountAmount: number | null
  originalPrice: number | null
}

interface ScanResponse {
  storeName: string | null
  receiptDateRaw: string | null
  receiptDate: string | null
  totalAmount: number | null
  items: ScanItem[]
  scanMeta: {
    provider: string
    model: string
    promptVersion: string
    schemaVersion: string
    latencyMs: number
    inputTokens: number | null
    outputTokens: number | null
  }
}

interface Props {
  familyId: string
  receipt: ReceiptValue
  items: RecoveryReceiptItem[]
  onAttached: (
    path: string,
    signedUrl: string,
    totalAmount: number | null,
    refreshedItems: RecoveryReceiptItem[]
  ) => void
}

type Stage = 'idle' | 'scanning' | 'review' | 'uploading'

function scanItemForSave(item: ScanItem, receiptLineIndex: number) {
  const discountAmount =
    item.discountAmount != null && item.discountAmount > 0 ? item.discountAmount : null
  return {
    name: item.name.trim(),
    amount: item.amount,
    quantity: item.quantity,
    unit: item.unit.trim() || null,
    discountAmount,
    originalPrice: discountAmount == null ? null : item.amount + discountAmount,
    receiptLineIndex,
  }
}

export default function ReceiptImageRecovery({ familyId, receipt, items, onAttached }: Props) {
  const t = useTranslations('expenses')
  const fmt = useFormatCurrency()
  const supabase = useMemo(() => createClient(), [])
  const inputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [scan, setScan] = useState<ScanResponse | null>(null)
  const [editableItems, setEditableItems] = useState<ScanItem[]>([])
  const [existingEdits, setExistingEdits] = useState<Record<string, ScanItem>>({})
  const [match, setMatch] = useState<ReceiptMatchResult | null>(null)
  const [selectedUpdateIds, setSelectedUpdateIds] = useState<Set<string>>(new Set())
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<string>>(new Set())
  const [selectedExtraIndexes, setSelectedExtraIndexes] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [consentRequired, setConsentRequired] = useState(false)

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl]
  )

  function resetSelection() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setImageBlob(null)
    setScan(null)
    setEditableItems([])
    setExistingEdits({})
    setMatch(null)
    setSelectedUpdateIds(new Set())
    setSelectedDeleteIds(new Set())
    setSelectedExtraIndexes(new Set())
    setError(null)
    setConsentRequired(false)
    setStage('idle')
    if (inputRef.current) inputRef.current.value = ''
  }

  function chooseAnotherImage() {
    resetSelection()
    window.setTimeout(() => inputRef.current?.click(), 0)
  }

  function updateEditableItem(index: number, patch: Partial<ScanItem>) {
    setEditableItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    )
  }

  function updateExistingItem(id: string, patch: Partial<ScanItem>) {
    setExistingEdits((current) => ({
      ...current,
      [id]: { ...current[id]!, ...patch },
    }))
  }

  function setUpdateSelected(id: string, selected: boolean) {
    setSelectedUpdateIds((current) => {
      const next = new Set(current)
      if (selected) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function setExtraSelected(index: number, selected: boolean) {
    setSelectedExtraIndexes((current) => {
      const next = new Set(current)
      if (selected) next.add(index)
      else next.delete(index)
      return next
    })
  }

  function setExistingDecision(id: string, decision: 'keep' | 'edit' | 'remove') {
    setSelectedUpdateIds((current) => {
      const next = new Set(current)
      if (decision === 'edit') next.add(id)
      else next.delete(id)
      return next
    })
    setSelectedDeleteIds((current) => {
      const next = new Set(current)
      if (decision === 'remove') next.add(id)
      else next.delete(id)
      return next
    })
  }

  function scanErrorMessage(code: string): string {
    if (code === SCAN_ERROR_CODES.RATE_LIMITED) return t('receiptRecoveryRateLimited')
    if (code === SCAN_ERROR_CODES.CONSENT_REQUIRED) return t('receiptRecoveryConsentRequired')
    if (code === SCAN_ERROR_CODES.NO_ITEMS || code === SCAN_ERROR_CODES.UNREADABLE)
      return t('receiptRecoveryUnreadable')
    if (
      code === SCAN_ERROR_CODES.INVALID_OUTPUT ||
      code === SCAN_ERROR_CODES.INCOMPLETE_OUTPUT ||
      code === SCAN_ERROR_CODES.REFUSAL
    )
      return t('receiptRecoveryInvalidOutput')
    if (code === SCAN_ERROR_CODES.TIMEOUT) return t('receiptRecoveryTimeout')
    if (code === SCAN_ERROR_CODES.UNSUPPORTED_FORMAT || code === SCAN_ERROR_CODES.IMAGE_TOO_LARGE)
      return t('receiptRecoveryUnsupported')
    return t('receiptRecoveryScanError')
  }

  async function verifyFile(file: File) {
    resetSelection()
    const nextPreviewUrl = URL.createObjectURL(file)
    setPreviewUrl(nextPreviewUrl)
    setStage('scanning')

    const compressed = await compressReceiptImage(file)
    if (!compressed) {
      setError(t('receiptRecoveryUnsupported'))
      setStage('idle')
      return
    }
    setImageBlob(compressed)

    try {
      const formData = new FormData()
      formData.append('image', compressed, 'receipt.jpg')
      const response = await fetch('/api/scan', { method: 'POST', body: formData })
      if (!response.ok) {
        let code: string = SCAN_ERROR_CODES.UNAVAILABLE
        try {
          code = ((await response.json()) as { error?: string }).error ?? code
        } catch {
          /* not JSON */
        }
        Sentry.captureMessage(`Receipt recovery scan failed: ${code}`)
        setConsentRequired(code === SCAN_ERROR_CODES.CONSENT_REQUIRED)
        const message = scanErrorMessage(code)
        setError(process.env.NODE_ENV === 'development' ? `${message} [${code}]` : message)
        setStage('idle')
        return
      }

      const result = (await response.json()) as ScanResponse
      const comparison = compareReceipt(
        {
          storeName: receipt.store_name,
          receiptDate: receipt.receipt_date,
          totalAmount: receipt.total_amount,
        },
        items.map((item) => ({
          id: item.id,
          name: item.name,
          amount: item.amount,
          quantity: item.quantity,
          unit: item.unit,
          originalPrice: item.original_price,
        })),
        {
          storeName: result.storeName,
          receiptDate: result.receiptDate,
          totalAmount: result.totalAmount,
        },
        result.items
      )
      setScan(result)
      setEditableItems(result.items.map((item) => ({ ...item })))
      setExistingEdits(
        Object.fromEntries(
          items.map((item) => [
            item.id,
            {
              name: item.name,
              amount: item.amount,
              quantity: item.quantity ?? 1,
              unit: item.unit ?? 'kpl',
              unitPrice: null,
              discountAmount: item.discount_amount,
              originalPrice: item.original_price,
            },
          ])
        )
      )
      setMatch(comparison)
      setStage('review')
    } catch (scanError) {
      Sentry.captureException(scanError)
      setError(t('receiptRecoveryScanError'))
      setStage('idle')
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) await verifyFile(file)
  }

  async function uploadWithRetry(path: string, body: ArrayBuffer) {
    let lastError: { message: string } | null = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt - 1)))
      const { error: uploadError } = await supabase.storage.from('receipts').upload(path, body, {
        upsert: false,
        contentType: 'image/jpeg',
      })
      if (!uploadError) return null
      lastError = uploadError
      const { data: exists } = await supabase.storage.from('receipts').exists(path)
      if (exists) return null
      if (!/load failed|network|fetch|failed to fetch/i.test(uploadError.message)) break
    }
    return lastError
  }

  async function handleAttach() {
    if (!scan || !match || !imageBlob) return

    const matchedUpdates = match.matches.flatMap((itemMatch) => {
      const existing = items[itemMatch.existingIndex]
      const edited = editableItems[itemMatch.scannedIndex]
      if (!existing || !edited || !selectedUpdateIds.has(existing.id)) return []
      return [{ id: existing.id, ...scanItemForSave(edited, itemMatch.scannedIndex) }]
    })
    const unmatchedUpdates = match.unmatchedExisting.flatMap((index) => {
      const existing = items[index]
      const edited = existing ? existingEdits[existing.id] : undefined
      if (!existing || !edited || !selectedUpdateIds.has(existing.id)) return []
      return [{ id: existing.id, ...scanItemForSave(edited, existing.receipt_line_index ?? index) }]
    })
    const itemUpdates = [...matchedUpdates, ...unmatchedUpdates]
    const itemDeletes = [...selectedDeleteIds].map((id) => ({ id, delete: true as const }))
    const newItems = match.unmatchedScanned.flatMap((index) => {
      const edited = editableItems[index]
      if (!edited || !selectedExtraIndexes.has(index)) return []
      return [scanItemForSave(edited, index)]
    })
    const invalid = [...itemUpdates, ...newItems].some(
      (item) =>
        !item.name ||
        !Number.isFinite(item.amount) ||
        item.amount < 0 ||
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0
    )
    if (invalid) {
      setError(t('receiptRecoveryInvalidCorrection'))
      return
    }

    setStage('uploading')
    setError(null)
    const path = `${familyId}/${receipt.id}/${Date.now()}.jpg`
    let uploaded = false

    try {
      const uploadError = await uploadWithRetry(path, await imageBlob.arrayBuffer())
      if (uploadError) throw new Error(uploadError.message)
      uploaded = true

      const { data: signed, error: signedError } = await supabase.storage
        .from('receipts')
        .createSignedUrl(path, 600)
      if (signedError || !signed) throw signedError ?? new Error('Signed URL missing')

      const rawResult = {
        storeName: scan.storeName,
        receiptDateRaw: scan.receiptDateRaw,
        totalAmount: scan.totalAmount,
        items: scan.items,
      }
      const { data: reconciled, error: reconcileError } = await supabase.rpc(
        'reconcile_receipt_image',
        {
          p_receipt_id: receipt.id,
          p_image_url: path,
          p_total_amount: scan.totalAmount,
          p_scan_metadata: { ...scan.scanMeta, rawResult },
          p_item_updates: [...itemUpdates, ...itemDeletes],
          p_new_items: newItems,
        }
      )
      if (reconcileError || reconciled !== true) {
        if (/already attached/i.test(reconcileError?.message ?? '')) {
          await supabase.storage.from('receipts').remove([path])
          uploaded = false
          setError(t('receiptRecoveryAlreadyAttached'))
          setStage('review')
          return
        }
        throw reconcileError ?? new Error('Receipt reconciliation failed')
      }
      // The database now owns this object path. Never remove it because of a
      // later, read-only refresh failure.
      uploaded = false

      const { data: itemData, error: itemError } = await supabase
        .from('expense_items')
        .select(
          'id, name, amount, quantity, unit, discount_amount, original_price, receipt_line_index, categories(name, icon)'
        )
        .eq('receipt_id', receipt.id)
        .eq('family_id', familyId)
        .order('receipt_line_index', { ascending: true, nullsFirst: false })
      if (itemError) Sentry.captureException(itemError)

      const refreshedItems = itemError
        ? [
            ...items
              .filter((item) => !selectedDeleteIds.has(item.id))
              .map((item) => {
                const update = itemUpdates.find((candidate) => candidate.id === item.id)
                return update
                  ? {
                      ...item,
                      name: update.name,
                      amount: update.amount,
                      quantity: update.quantity,
                      unit: update.unit,
                      discount_amount: update.discountAmount,
                      original_price: update.originalPrice,
                      receipt_line_index: update.receiptLineIndex,
                    }
                  : item
              }),
            ...newItems.map((item) => ({
              id: crypto.randomUUID(),
              name: item.name,
              amount: item.amount,
              quantity: item.quantity,
              unit: item.unit,
              discount_amount: item.discountAmount,
              original_price: item.originalPrice,
              receipt_line_index: item.receiptLineIndex,
              categories: null,
            })),
          ]
        : ((itemData ?? []) as unknown as RecoveryReceiptItemRow[]).map((item) => ({
            ...item,
            categories: Array.isArray(item.categories)
              ? (item.categories[0] ?? null)
              : item.categories,
          }))
      onAttached(path, signed.signedUrl, receipt.total_amount ?? scan.totalAmount, refreshedItems)
    } catch (attachError) {
      if (uploaded) await supabase.storage.from('receipts').remove([path])
      Sentry.captureException(attachError)
      setError(t('receiptRecoveryUploadError'))
      setStage('review')
    }
  }

  const busy = stage === 'scanning' || stage === 'uploading'

  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={handleFileChange}
      />

      {previewUrl && (
        <img
          src={previewUrl}
          alt={t('receiptRecoveryPreviewAlt')}
          className="mx-auto mb-4 max-h-64 rounded-lg object-contain"
        />
      )}

      {busy ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          {stage === 'scanning' ? t('receiptRecoveryScanning') : t('receiptRecoveryUploading')}
        </div>
      ) : stage === 'review' && scan && match ? (
        <div className="space-y-4">
          <div
            className={`flex items-start gap-3 rounded-lg border p-3 ${match.verified ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}
          >
            {match.verified ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            )}
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {match.verified ? t('receiptRecoveryVerified') : t('receiptRecoveryReviewTitle')}
              </p>
              <p className="mt-0.5 text-xs text-gray-600">
                {match.verified ? t('receiptRecoveryVerifiedHint') : t('receiptRecoveryReviewHint')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <ComparisonValue
              label={t('storeNameLabel')}
              existing={receipt.store_name ?? '—'}
              scanned={scan.storeName ?? '—'}
              matches={match.storeMatches}
            />
            <ComparisonValue
              label={t('receiptRecoveryDate')}
              existing={receipt.receipt_date ?? '—'}
              scanned={scan.receiptDate ?? '—'}
              matches={match.dateMatches}
            />
            <ComparisonValue
              label={t('receiptTotal')}
              existing={fmt(receipt.total_amount ?? match.existingTotal)}
              scanned={fmt(scan.totalAmount ?? match.scannedItemsTotal)}
              matches={match.totalMatches}
            />
            <ComparisonValue
              label={t('receiptItems')}
              existing={String(items.length)}
              scanned={String(scan.items.length)}
              matches={match.unmatchedExisting.length === 0 && match.unmatchedScanned.length === 0}
            />
          </div>

          {!match.verified && (
            <div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 text-xs">
              {match.matches.map((itemMatch) => {
                const existing = items[itemMatch.existingIndex]!
                const edited = editableItems[itemMatch.scannedIndex]!
                const differs =
                  !itemMatch.exactAmount || !itemMatch.exactName || !itemMatch.quantityMatches
                if (!differs) return null
                const selected = selectedUpdateIds.has(existing.id)
                return (
                  <div key={existing.id} className="rounded-lg border border-amber-200 p-3">
                    <p className="font-semibold text-gray-700">
                      {t('receiptRecoveryExistingValues')}
                    </p>
                    <div className="mt-1 flex justify-between gap-3">
                      <span>{existing.name}</span>
                      <span>{fmt(existing.amount)}</span>
                    </div>
                    <div className="mt-1 flex justify-between gap-3 text-amber-700">
                      <span>↳ {edited.name}</span>
                      <span>{fmt(edited.amount)}</span>
                    </div>
                    {!itemMatch.quantityMatches && (
                      <p className="mt-1 text-amber-700">
                        {t('quantityLabel')}: {formatQuantity(existing.quantity, existing.unit)} →{' '}
                        {formatQuantity(edited.quantity, edited.unit)}
                      </p>
                    )}
                    <DecisionButtons
                      leftLabel={t('receiptRecoveryKeepExisting')}
                      rightLabel={t('receiptRecoveryUseScanned')}
                      rightSelected={selected}
                      onChange={(useScanned) => setUpdateSelected(existing.id, useScanned)}
                    />
                    {selected && (
                      <EditableItemFields
                        item={edited}
                        onChange={(patch) => updateEditableItem(itemMatch.scannedIndex, patch)}
                      />
                    )}
                  </div>
                )
              })}

              {match.unmatchedExisting.map((index) => {
                const existing = items[index]!
                const edited = existingEdits[existing.id]!
                const decision = selectedDeleteIds.has(existing.id)
                  ? 'remove'
                  : selectedUpdateIds.has(existing.id)
                    ? 'edit'
                    : 'keep'
                return (
                  <div
                    key={`existing-${index}`}
                    className="rounded-lg border border-gray-200 p-3 text-gray-600"
                  >
                    <p>{t('receiptRecoveryKeptMissing', { item: existing.name })}</p>
                    <ExistingDecisionButtons
                      decision={decision}
                      keepLabel={t('receiptRecoveryKeepExisting')}
                      editLabel={t('receiptRecoveryEditExisting')}
                      removeLabel={t('receiptRecoveryRemoveExisting')}
                      onChange={(nextDecision) => setExistingDecision(existing.id, nextDecision)}
                    />
                    {decision === 'edit' && edited && (
                      <EditableItemFields
                        item={edited}
                        onChange={(patch) => updateExistingItem(existing.id, patch)}
                      />
                    )}
                  </div>
                )
              })}

              {match.unmatchedScanned.map((index) => {
                const edited = editableItems[index]!
                const selected = selectedExtraIndexes.has(index)
                return (
                  <div key={`scanned-${index}`} className="rounded-lg border border-amber-200 p-3">
                    <div className="flex justify-between gap-3 text-gray-700">
                      <span>{edited.name}</span>
                      <span>{fmt(edited.amount)}</span>
                    </div>
                    <DecisionButtons
                      leftLabel={t('receiptRecoverySkipItem')}
                      rightLabel={t('receiptRecoveryAddItem')}
                      rightSelected={selected}
                      onChange={(addItem) => setExtraSelected(index, addItem)}
                    />
                    {selected && (
                      <EditableItemFields
                        item={edited}
                        onChange={(patch) => updateEditableItem(index, patch)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={chooseAnotherImage}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('receiptRecoveryChooseAnother')}
            </button>
            <button
              type="button"
              onClick={handleAttach}
              className={`rounded-lg px-3 py-2 text-sm font-semibold text-white ${match.verified ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'}`}
            >
              {match.verified ? t('receiptRecoveryAttach') : t('receiptRecoveryApplyAndAttach')}
            </button>
          </div>
        </div>
      ) : (
        <div className="py-4 text-center">
          <Upload className="mx-auto h-6 w-6 text-indigo-500" />
          <p className="mt-2 text-sm font-medium text-gray-800">{t('receiptImageUnavailable')}</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-gray-500">{t('receiptRecoveryHint')}</p>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          {consentRequired && (
            <Link
              href="/privacy/consent?next=/expenses"
              className="mt-2 inline-block text-sm font-medium text-indigo-600 hover:underline"
            >
              {t('receiptRecoveryEnableScanning')}
            </Link>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mx-auto mt-4 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Upload className="h-4 w-4" />
            {t('receiptRecoveryUpload')}
          </button>
        </div>
      )}
    </div>
  )
}

function DecisionButtons({
  leftLabel,
  rightLabel,
  rightSelected,
  onChange,
}: {
  leftLabel: string
  rightLabel: string
  rightSelected: boolean
  onChange: (rightSelected: boolean) => void
}) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
      <button
        type="button"
        aria-pressed={!rightSelected}
        onClick={() => onChange(false)}
        className={`rounded-md px-2 py-2 text-center font-medium transition ${
          rightSelected ? 'text-gray-500 hover:bg-white/70' : 'bg-white text-gray-800 shadow-sm'
        }`}
      >
        {leftLabel}
      </button>
      <button
        type="button"
        aria-pressed={rightSelected}
        onClick={() => onChange(true)}
        className={`rounded-md px-2 py-2 text-center font-medium transition ${
          rightSelected ? 'bg-amber-600 text-white shadow-sm' : 'text-amber-800 hover:bg-amber-50'
        }`}
      >
        {rightLabel}
      </button>
    </div>
  )
}

function ExistingDecisionButtons({
  decision,
  keepLabel,
  editLabel,
  removeLabel,
  onChange,
}: {
  decision: 'keep' | 'edit' | 'remove'
  keepLabel: string
  editLabel: string
  removeLabel: string
  onChange: (decision: 'keep' | 'edit' | 'remove') => void
}) {
  const choices = [
    { value: 'keep' as const, label: keepLabel },
    { value: 'edit' as const, label: editLabel },
    { value: 'remove' as const, label: removeLabel },
  ]

  return (
    <div className="mt-3 grid grid-cols-1 gap-1 rounded-lg bg-gray-100 p-1 sm:grid-cols-3">
      {choices.map((choice) => {
        const selected = decision === choice.value
        const remove = choice.value === 'remove'
        return (
          <button
            key={choice.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(choice.value)}
            className={`rounded-md px-2 py-2 text-center font-medium transition ${
              selected
                ? remove
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-white text-gray-800 shadow-sm'
                : remove
                  ? 'text-red-700 hover:bg-red-50'
                  : 'text-gray-600 hover:bg-white/70'
            }`}
          >
            {choice.label}
          </button>
        )
      })}
    </div>
  )
}

function formatQuantity(
  quantity: number | null | undefined,
  unit: string | null | undefined
): string {
  if (quantity == null) return '—'
  return `${String(quantity).replace('.', ',')}${unit ? ` ${unit}` : ''}`
}

function EditableItemFields({
  item,
  onChange,
}: {
  item: ScanItem
  onChange: (patch: Partial<ScanItem>) => void
}) {
  const t = useTranslations('expenses')
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <label className="col-span-2 text-gray-600">
        <span className="mb-1 block">{t('itemName')}</span>
        <input
          type="text"
          maxLength={120}
          value={item.name}
          onChange={(event) => onChange({ name: event.target.value })}
          className="input-base w-full text-sm"
        />
      </label>
      <label className="text-gray-600">
        <span className="mb-1 block">{t('amountLabel')}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={item.amount}
          onChange={(event) => onChange({ amount: Number(event.target.value) })}
          className="input-base w-full text-sm"
        />
      </label>
      <label className="text-gray-600">
        <span className="mb-1 block">{t('quantityLabel')}</span>
        <input
          type="number"
          min="0.001"
          step="0.001"
          value={item.quantity}
          onChange={(event) => onChange({ quantity: Number(event.target.value) })}
          className="input-base w-full text-sm"
        />
      </label>
      <label className="text-gray-600">
        <span className="mb-1 block">{t('unitLabel')}</span>
        <input
          type="text"
          value={item.unit}
          onChange={(event) => onChange({ unit: event.target.value })}
          className="input-base w-full text-sm"
        />
      </label>
      <label className="text-gray-600">
        <span className="mb-1 block">{t('discountLabel')}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={item.discountAmount ?? ''}
          onChange={(event) =>
            onChange({
              discountAmount: event.target.value === '' ? null : Number(event.target.value),
            })
          }
          className="input-base w-full text-sm"
        />
      </label>
    </div>
  )
}

function ComparisonValue({
  label,
  existing,
  scanned,
  matches,
}: {
  label: string
  existing: string
  scanned: string
  matches: boolean
}) {
  return (
    <div
      className={`rounded-lg border p-2 ${matches ? 'border-gray-200 bg-white' : 'border-amber-300 bg-amber-50'}`}
    >
      <p className="font-medium text-gray-500">{label}</p>
      <p className="mt-1 truncate text-gray-800">{existing}</p>
      {!matches && <p className="mt-0.5 truncate text-amber-700">→ {scanned}</p>}
    </div>
  )
}
