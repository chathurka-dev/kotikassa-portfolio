'use client'

import { useState, useRef, useCallback, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Upload, Camera, Trash2, Check, AlertCircle, ChevronRight, ShieldCheck } from 'lucide-react'
import {
  createClient,
  categorizeItems,
  RECEIPT_TRAINING_CONSENT_VERSION,
  SCAN_ERROR_CODES,
} from '@kotikassa/shared'
import ItemNameSuggestInput, { type ItemSuggestion } from '../../_components/ItemNameSuggestInput'
import { useFormatCurrency } from '@/lib/currency-context'
import { compressReceiptImage } from '@/lib/receipt-image'
import { findSimilarItemNames, hasExactItemName } from '@/lib/item-name-similarity'
import {
  buildReceiptScanFeedbackEvents,
  RECEIPT_SCAN_FEEDBACK_SCHEMA_VERSION,
} from '@/lib/receipt-scan-feedback'
import {
  applyEligibleAutomaticCorrections,
  buildCorrectionSuggestionEvents,
  mergeCorrectionSuggestionEvents,
  parseCorrectionSuggestions,
  type CorrectionSuggestionDecision,
  type ReceiptCorrectionSuggestion,
} from '@/lib/receipt-correction-suggestions'
import CorrectionSuggestionCard from './CorrectionSuggestionCard'
import ScanQualityWarningCard from './ScanQualityWarningCard'
import {
  assessReceiptScanQuality,
  isLowReviewRisk,
  resolveScanQualityWarningOutcomes,
  type ReceiptScanQualityAssessment,
  type ReceiptScanQualityWarning,
  type ScanPriceContext,
} from '@/lib/receipt-scan-quality'
import * as Sentry from '@sentry/nextjs'

interface Category {
  id: string
  name: string
  icon: string
  color: string
}

interface ReviewItem {
  id: string // temp client-side ID
  name: string
  amount: number
  quantity?: number
  unit?: string
  unitPrice?: number
  discountAmount?: number
  originalPrice?: number
  categoryId: string | null
  include: boolean // user can uncheck to skip saving this item
  source: 'ocr' | 'manual' // 'ocr' = model-extracted, 'manual' = typed on review screen
  isOnReceipt: boolean // visible in the receipt image -> label-eligible (not training consent)
  lineIndex?: number // 0-based order in the scan result -> receipt_line_index
}

interface Props {
  familyId: string
  userId: string
  categories: Category[]
  memoryMap: Record<string, string> // item_name.lower → category_id
  suggestions: ItemSuggestion[]
  storeNames: string[]
  receiptScanningEnabled: boolean
}

type Stage = 'upload' | 'processing' | 'review' | 'saving' | 'done'

// ── /api/scan response shape (see apps/web/app/api/scan/route.ts) ─────────
interface ScanItem {
  name: string
  amount: number
  quantity: number
  unit: string
  unitPrice: number | null
  discountAmount: number | null
  originalPrice: number | null
}

interface ScanMeta {
  provider: string
  model: string
  promptVersion: string
  schemaVersion: string
  latencyMs: number
  inputTokens: number | null
  outputTokens: number | null
  raw: unknown // validated original model JSON -> receipts.scan_raw_result
}

interface ScanResponse {
  storeName: string | null
  receiptDateRaw: string | null
  receiptDate: string | null
  totalAmount: number | null
  items: ScanItem[]
  scanQuality: ReceiptScanQualityAssessment
  scanQualityContext: ScanPriceContext[]
  scanMeta: Omit<ScanMeta, 'raw'> // raw is reconstructed client-side from the body
}

let itemIdCounter = 0
function newId() {
  return `item-${++itemIdCounter}`
}

type ReceiptSavePhase =
  | 'image_upload'
  | 'privacy_lookup'
  | 'receipt_insert'
  | 'expense_insert'
  | 'post_save'

interface DatabaseFailure {
  message: string
  code?: string | null
  details?: string | null
  hint?: string | null
}

class ReceiptSaveError extends Error {
  constructor(
    readonly phase: ReceiptSavePhase,
    readonly databaseError: DatabaseFailure | null,
    fallbackMessage: string
  ) {
    const code = databaseError?.code ? ` [${databaseError.code}]` : ''
    super(`${databaseError?.message ?? fallbackMessage}${code}`)
    this.name = 'ReceiptSaveError'
  }
}

export default function ReceiptScanner({
  familyId,
  userId,
  categories,
  memoryMap,
  suggestions,
  storeNames,
  receiptScanningEnabled,
}: Props) {
  const fmt = useFormatCurrency()
  const t = useTranslations('scan')
  const tc = useTranslations('common')
  const supabase = createClient()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  const [stage, setStage] = useState<Stage>('upload')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [storeName, setStoreName] = useState('')
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10))
  const [receiptTotal, setReceiptTotal] = useState<number | null>(null)
  const [receiptTotalText, setReceiptTotalText] = useState('')
  // /api/scan telemetry — persisted onto the receipts row at save time
  const [scanMeta, setScanMeta] = useState<ScanMeta | null>(null)
  // The compressed JPEG that was scanned; reused verbatim for the Storage upload
  const compressedBlobRef = useRef<Blob | null>(null)
  const [items, setItems] = useState<ReviewItem[]>([])
  const currentStoreNameRef = useRef(storeName)
  const currentItemsRef = useRef(items)

  useEffect(() => {
    currentStoreNameRef.current = storeName
    currentItemsRef.current = items
  }, [storeName, items])
  // Snapshot of model-extracted values — never mutated after scan. Used to diff
  // against what the user saves, producing the ocr_corrections accuracy rows.
  const originalOcrItemsRef = useRef<ReviewItem[]>([])
  // Snapshot of model-extracted store name and date — never mutated after scan.
  // Used to detect user corrections for ocr_receipt_corrections rows.
  const originalStoreNameRef = useRef<string>('')
  const originalDateRef = useRef<string>('')
  const originalReceiptDateRawRef = useRef<string>('')
  const originalReceiptTotalRef = useRef<number | null>(null)
  const reviewStartedAtRef = useRef<number | null>(null)
  const [scanQuality, setScanQuality] = useState<ReceiptScanQualityAssessment | null>(null)
  const [scanQualityContext, setScanQualityContext] = useState<ScanPriceContext[]>([])
  const [dismissedQualityWarnings, setDismissedQualityWarnings] = useState<Record<string, boolean>>(
    {}
  )
  const [receiptDateEdited, setReceiptDateEdited] = useState(false)
  const suggestionRequestRef = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadWarning, setUploadWarning] = useState<string | null>(null)
  // Raw text values for amount inputs — lets users type freely before parsing
  const [amountText, setAmountText] = useState<Record<string, string>>({})
  const [quantityText, setQuantityText] = useState<Record<string, string>>({})
  const [discountText, setDiscountText] = useState<Record<string, string>>({})
  const [discountMode, setDiscountMode] = useState<Record<string, 'eur' | 'pct'>>({})
  const [discountOpen, setDiscountOpen] = useState<Record<string, boolean>>({})
  const [entryMode, setEntryMode] = useState<'scan' | 'manual'>('scan')
  const [lastAddedId, setLastAddedId] = useState<string | null>(null)
  const [trainingPromptReceiptId, setTrainingPromptReceiptId] = useState<string | null>(null)
  const [trainingChoiceSaving, setTrainingChoiceSaving] = useState(false)
  const [trainingChoiceError, setTrainingChoiceError] = useState<string | null>(null)
  const [correctionSuggestions, setCorrectionSuggestions] = useState<ReceiptCorrectionSuggestion[]>(
    []
  )
  const [suggestionDecisions, setSuggestionDecisions] = useState<
    Record<string, CorrectionSuggestionDecision>
  >({})

  // ── Category resolution helpers ───────────────────────────────────────────

  const catByName = useCallback(
    (name: string | null) => categories.find((c) => c.name === name) ?? null,
    [categories]
  )

  function resolveCategoryId(
    suggestedId: string | null,
    suggestedName: string | null
  ): string | null {
    if (suggestedId) return suggestedId
    if (suggestedName) return catByName(suggestedName)?.id ?? null
    return null
  }

  // ── File selection ────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    // A new photo invalidates any previous scan's blob + telemetry — otherwise
    // a later save could upload the OLD image with the new items
    compressedBlobRef.current = null
    setScanMeta(null)
    setReceiptTotal(null)
    clearCorrectionSuggestionState()
    setError(null)
  }

  function clearCorrectionSuggestionState() {
    suggestionRequestRef.current += 1
    setCorrectionSuggestions([])
    setSuggestionDecisions({})
  }

  // ── Scan via /api/scan (GPT Vision, ADR-015) ─────────────────────────────

  async function handleScan() {
    if (!selectedFile) return
    const suggestionRequest = ++suggestionRequestRef.current
    setCorrectionSuggestions([])
    setSuggestionDecisions({})
    setStage('processing')
    setError(null)

    // Compress once, up front — this exact JPEG goes to the API now and to
    // Supabase Storage at save time.
    const compressed = await compressReceiptImage(selectedFile)
    if (!compressed) {
      // e.g. HEIC the browser cannot decode; /api/scan accepts JPEG only
      setError(t('unsupportedFormat'))
      setStage('upload')
      return
    }
    compressedBlobRef.current = compressed

    try {
      const formData = new FormData()
      formData.append('image', compressed, 'receipt.jpg')
      const res = await fetch('/api/scan', { method: 'POST', body: formData })

      if (!res.ok) {
        let code: string = SCAN_ERROR_CODES.UNAVAILABLE
        try {
          code = ((await res.json()) as { error?: string }).error ?? code
        } catch {
          /* body not JSON */
        }
        const message =
          code === SCAN_ERROR_CODES.RATE_LIMITED
            ? t('rateLimited')
            : code === SCAN_ERROR_CODES.CONSENT_REQUIRED
              ? t('scanConsentRequired')
              : code === SCAN_ERROR_CODES.NO_ITEMS || code === SCAN_ERROR_CODES.UNREADABLE
                ? t('noItemsFound')
                : code === SCAN_ERROR_CODES.TIMEOUT
                  ? t('scanTimeout')
                  : code === SCAN_ERROR_CODES.UNSUPPORTED_FORMAT ||
                      code === SCAN_ERROR_CODES.IMAGE_TOO_LARGE
                    ? t('unsupportedFormat')
                    : t('scanUnavailable')
        setError(message)
        setStage('upload')
        return
      }

      const data = (await res.json()) as ScanResponse

      // Reconstruct the validated model JSON for receipts.scan_raw_result —
      // identical to what the route validated; not echoed to halve the payload
      setScanMeta({
        ...data.scanMeta,
        raw: {
          storeName: data.storeName,
          receiptDateRaw: data.receiptDateRaw,
          totalAmount: data.totalAmount,
          items: data.items,
        },
      })
      setStoreName(data.storeName ?? '')
      setReceiptDate(data.receiptDate ?? '')
      setReceiptTotal(data.totalAmount)
      setReceiptTotalText(
        data.totalAmount == null ? '' : data.totalAmount.toFixed(2).replace('.', ',')
      )
      setScanQuality(data.scanQuality)
      setScanQualityContext(data.scanQualityContext)
      setDismissedQualityWarnings({})
      // Snapshot for ocr_receipt_corrections — what the model said, before edits
      originalStoreNameRef.current = data.storeName ?? ''
      originalDateRef.current = data.receiptDate ?? ''
      originalReceiptDateRawRef.current = data.receiptDateRaw ?? ''
      originalReceiptTotalRef.current = data.totalAmount
      setReceiptDateEdited(false)

      const categorized = categorizeItems(data.items, memoryMap)

      const reviewItems: ReviewItem[] = categorized.map((item, index) => ({
        id: newId(),
        name: item.name,
        amount: item.amount,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice ?? undefined,
        discountAmount: item.discountAmount ?? undefined,
        originalPrice: item.originalPrice ?? undefined,
        categoryId: resolveCategoryId(item.suggestedCategoryId, item.suggestedCategoryName),
        include: true,
        source: 'ocr',
        isOnReceipt: true,
        lineIndex: index,
      }))

      // Freeze the original model values for correction diffing at save time
      originalOcrItemsRef.current = reviewItems
      const visibleReviewItems = reviewItems.length > 0 ? reviewItems : [blankItem()]
      currentStoreNameRef.current = data.storeName ?? ''
      currentItemsRef.current = visibleReviewItems
      setItems(visibleReviewItems)
      reviewStartedAtRef.current = Date.now()
      setStage('review')

      // Suggestions are loaded after the valid scan is already visible. A
      // memory lookup failure must never block review or saving the receipt.
      void loadCorrectionSuggestions(data.storeName ?? '', data.items, suggestionRequest)
    } catch {
      setError(t('scanUnavailable'))
      setStage('upload')
    }
  }

  // ── Manual entry ──────────────────────────────────────────────────────────

  function blankItem(): ReviewItem {
    return {
      id: newId(),
      name: '',
      amount: 0,
      categoryId: null,
      include: true,
      source: 'manual',
      isOnReceipt: true,
    }
  }

  function addItem() {
    const item = blankItem()
    setItems([...items, item])
    setLastAddedId(item.id)
  }

  function updateItem(id: string, patch: Partial<ReviewItem>) {
    if (typeof patch.name === 'string') {
      const current = items.find((item) => item.id === id)
      const suggestion = correctionSuggestions.find(
        (candidate) => candidate.entityType === 'item' && candidate.lineIndex === current?.lineIndex
      )
      if (
        suggestion &&
        suggestionDecisions[suggestion.key] === 'accepted' &&
        patch.name.trim().toLocaleLowerCase() !==
          suggestion.suggestedValue.trim().toLocaleLowerCase()
      ) {
        setSuggestionDecisions((decisions) => ({
          ...decisions,
          [suggestion.key]: 'undone',
        }))
      }
    }
    setItems(items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  async function loadCorrectionSuggestions(
    scannedStoreName: string,
    scannedItems: ScanItem[],
    requestId: number
  ) {
    const { data, error: suggestionError } = await supabase.rpc(
      'get_receipt_correction_recommendations',
      {
        p_store_name: scannedStoreName,
        p_items: scannedItems.map((item, lineIndex) => ({ lineIndex, name: item.name })),
      }
    )
    if (requestId !== suggestionRequestRef.current) return
    if (suggestionError) {
      Sentry.captureException(
        new Error(`correction suggestion lookup failed: ${suggestionError.message}`)
      )
      return
    }
    const parsedSuggestions = parseCorrectionSuggestions(data)
    const automatic = applyEligibleAutomaticCorrections(
      currentStoreNameRef.current,
      currentItemsRef.current,
      parsedSuggestions
    )
    setCorrectionSuggestions(parsedSuggestions)
    setStoreName(automatic.storeName)
    setItems(automatic.items)
    setSuggestionDecisions((current) => ({ ...current, ...automatic.decisions }))
  }

  function acceptCorrectionSuggestion(suggestion: ReceiptCorrectionSuggestion) {
    if (suggestion.entityType === 'receipt') {
      setStoreName(suggestion.suggestedValue)
    } else {
      setItems((current) =>
        current.map((item) =>
          item.lineIndex === suggestion.lineIndex
            ? { ...item, name: suggestion.suggestedValue }
            : item
        )
      )
    }
    setSuggestionDecisions((decisions) => ({
      ...decisions,
      [suggestion.key]: 'accepted',
    }))
  }

  function undoCorrectionSuggestion(suggestion: ReceiptCorrectionSuggestion) {
    if (suggestion.entityType === 'receipt') {
      setStoreName(suggestion.originalValue)
    } else {
      setItems((current) =>
        current.map((item) =>
          item.lineIndex === suggestion.lineIndex
            ? { ...item, name: suggestion.originalValue }
            : item
        )
      )
    }
    setSuggestionDecisions((decisions) => ({
      ...decisions,
      [suggestion.key]: 'undone',
    }))
  }

  function rejectCorrectionSuggestion(suggestion: ReceiptCorrectionSuggestion) {
    setSuggestionDecisions((decisions) => ({
      ...decisions,
      [suggestion.key]: 'rejected',
    }))
  }

  function restoreCorrectionSuggestion(suggestion: ReceiptCorrectionSuggestion) {
    setSuggestionDecisions((decisions) => ({
      ...decisions,
      [suggestion.key]: 'offered',
    }))
  }

  function correctionSuggestionCard(suggestion: ReceiptCorrectionSuggestion) {
    const source =
      suggestion.sourceType === 'household_memory'
        ? t('correctionSourceHousehold')
        : suggestion.sourceType === 'global_candidate'
          ? t('correctionSourceGlobal')
          : t('correctionSourceRule')
    const sourceHelp =
      suggestion.sourceType === 'household_memory'
        ? suggestion.evidenceTier === 'conflicting'
          ? t('correctionHelpHouseholdConflicting')
          : suggestion.evidenceTier === 'single'
            ? t('correctionHelpHouseholdSingle')
            : t('correctionHelpHouseholdRepeated')
        : suggestion.sourceType === 'global_candidate'
          ? suggestion.evidenceTier === 'exploratory'
            ? t('correctionHelpGlobalExploratory')
            : t('correctionHelpGlobalIndependent')
          : t('correctionHelpRule')
    const help = suggestion.autoApply
      ? `${sourceHelp} ${
          suggestion.automationReason === 'global_holdout_verified'
            ? t('automaticCorrectionHelpGlobal')
            : t('automaticCorrectionHelpHousehold')
        }`
      : sourceHelp

    return (
      <CorrectionSuggestionCard
        suggestion={suggestion}
        decision={suggestionDecisions[suggestion.key] ?? 'offered'}
        labels={{
          heading:
            suggestion.autoApply &&
            (suggestionDecisions[suggestion.key] ?? 'offered') === 'accepted'
              ? t('automaticCorrectionHeading')
              : t('correctionSuggestionHeading'),
          helpLabel: t('correctionSuggestionHelpLabel'),
          source,
          help,
          useValue: t('useCorrectionSuggestion'),
          dismiss: t('dismissCorrectionSuggestion'),
          applied: t('correctionSuggestionApplied'),
          undo: t('undoCorrectionSuggestion'),
          dismissed: t('correctionSuggestionDismissed'),
          restore: t('restoreCorrectionSuggestion'),
        }}
        onAccept={() => acceptCorrectionSuggestion(suggestion)}
        onReject={() => rejectCorrectionSuggestion(suggestion)}
        onUndo={() => undoCorrectionSuggestion(suggestion)}
        onRestore={() => restoreCorrectionSuggestion(suggestion)}
      />
    )
  }

  const validCategoryId = (id: string | null) =>
    id && categories.some((c) => c.id === id) ? id : null

  function pickSuggestionForRow(id: string, s: ItemSuggestion) {
    setItems(
      items.map((item) => {
        if (item.id !== id) return item
        const inheritedCategoryId = validCategoryId(s.categoryId)
        return {
          ...item,
          name: s.name,
          // Historical categories can be deleted. Inherit only a category that
          // still exists, otherwise preserve the user's current selection.
          categoryId: inheritedCategoryId ?? item.categoryId,
        }
      })
    )
  }

  function addSuggestedItem(s: ItemSuggestion) {
    setItems([
      ...items,
      {
        id: newId(),
        name: s.name,
        amount: s.lastPrice,
        categoryId: validCategoryId(s.categoryId),
        include: true,
        source: 'manual',
        isOnReceipt: true,
      },
    ])
  }

  const quickItems = suggestions.slice(0, 12)

  function removeItem(id: string) {
    setItems(items.filter((item) => item.id !== id))
    setError(null)
  }

  // ── Save to Supabase ──────────────────────────────────────────────────────

  // Retry wrapper for Supabase Storage uploads.
  // iOS Safari drops large fetch requests with "Load failed" on flaky networks;
  // 1–2 retries with a short backoff resolve the vast majority of cases.
  async function uploadWithRetry(
    storagePath: string,
    body: Blob | File | ArrayBuffer,
    options: { upsert: boolean; contentType?: string },
    maxAttempts = 3
  ): Promise<{ error: { message: string } | null }> {
    let lastError: { message: string } | null = null
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt - 1)))
      }
      const { error } = await supabase.storage.from('receipts').upload(storagePath, body, options)
      if (!error) return { error: null }
      lastError = error
      try {
        const { data: exists, error: existsError } = await supabase.storage
          .from('receipts')
          .exists(storagePath)
        if (!existsError && exists) return { error: null }
      } catch {
        // The connection may still be offline; the network retry below handles it.
      }
      // Don't retry on definitive errors (permissions, duplicate key, etc.)
      // "Load failed" and similar network strings are worth retrying
      const isNetworkError = /load failed|network|fetch|failed to fetch/i.test(error.message)
      if (!isNetworkError) break
    }
    return { error: lastError }
  }

  async function handleSave() {
    const toSave = items.filter((item) => item.include && item.name.trim() && item.amount > 0)
    if (toSave.length === 0) {
      setError(t('noItemsSelected'))
      return
    }
    const missingQty = toSave.filter((item) => item.quantity == null || isNaN(item.quantity))
    if (missingQty.length > 0) {
      setError(t('missingQuantity', { names: missingQty.map((i) => i.name).join(', ') }))
      return
    }
    if (!receiptDate) {
      setError(t('missingReceiptDate'))
      return
    }

    const reviewDurationMs = Math.max(0, Date.now() - (reviewStartedAtRef.current ?? Date.now()))
    const finalQualityInput = {
      storeName,
      receiptDateRaw: receiptDate,
      receiptDate: receiptDate || null,
      totalAmount: receiptTotal,
      items: items.map((item) => ({
        name: item.name,
        amount: item.amount,
        quantity: item.quantity ?? 0,
        unit: item.unit ?? '',
        unitPrice: item.unitPrice ?? null,
        discountAmount: item.discountAmount ?? null,
        originalPrice: item.originalPrice ?? null,
        include: item.include,
        lineIndex: item.lineIndex,
      })),
    }
    const qualityOutcomes = scanQuality
      ? resolveScanQualityWarningOutcomes(
          scanQuality,
          finalQualityInput,
          scanQualityContext,
          dismissedQualityWarnings
        )
      : []
    const lowReviewRisk = scanQuality
      ? isLowReviewRisk(reviewDurationMs, scanQuality, qualityOutcomes)
      : false

    setSaving(true)
    setStage('saving')
    setError(null)

    let savePhase: ReceiptSavePhase = 'image_upload'
    let receiptCreated = false
    let savedExpenseCount = 0

    try {
      let imageUrl: string | null = null
      setUploadWarning(null)
      if (selectedFile) {
        // Upload the exact JPEG that was scanned so any separately consented
        // future dataset uses the same pixels the model saw. The fallback
        // compress covers the manual path where no scan ran.
        const compressed = compressedBlobRef.current ?? (await compressReceiptImage(selectedFile))
        const body = compressed ?? selectedFile
        const ext = compressed ? 'jpg' : (selectedFile.name.split('.').pop() ?? 'jpg')
        const path = `${familyId}/${Date.now()}.${ext}`
        // Convert to ArrayBuffer before uploading. On iOS Chrome, camera-captured
        // File/Blob objects reference a temporary system file that iOS can reclaim
        // while the GPT scan is running. Reading into ArrayBuffer forces the full
        // image into JS heap so the upload has a stable in-memory buffer to stream.
        const bodyBuffer = await body.arrayBuffer()
        const { error: uploadErr } = await uploadWithRetry(path, bodyBuffer, {
          upsert: false,
          contentType: compressed ? 'image/jpeg' : selectedFile.type || undefined,
        })
        if (uploadErr) {
          Sentry.captureException(
            new Error(`Receipt image upload failed after retries: ${uploadErr.message}`)
          )
          setUploadWarning(t('uploadWarning', { reason: uploadErr.message }))
        } else {
          imageUrl = path
        }
      }

      let trainingChoice: {
        receipt_training_enabled: boolean
        receipt_training_choice_version: string | null
        receipt_training_consented_at: string | null
      } | null = null
      savePhase = 'privacy_lookup'
      if (entryMode === 'scan') {
        const { data, error: choiceError } = await supabase
          .from('user_privacy_choices')
          .select(
            'receipt_training_enabled, receipt_training_choice_version, receipt_training_consented_at'
          )
          .eq('user_id', userId)
          .maybeSingle()
        if (choiceError) {
          Sentry.captureException(
            new Error(`training choice lookup failed: ${choiceError.message}`)
          )
        } else {
          trainingChoice = data
        }
      }

      const hasCurrentTrainingConsent = Boolean(
        trainingChoice?.receipt_training_enabled &&
        trainingChoice.receipt_training_choice_version === RECEIPT_TRAINING_CONSENT_VERSION &&
        trainingChoice.receipt_training_consented_at
      )
      const trainingEligible = Boolean(
        entryMode === 'scan' && imageUrl && scanMeta && hasCurrentTrainingConsent
      )

      savePhase = 'receipt_insert'
      const { data: receipt, error: receiptErr } = await supabase
        .from('receipts')
        .insert({
          family_id: familyId,
          uploaded_by: userId,
          image_url: imageUrl,
          store_name: storeName || null,
          receipt_date: receiptDate,
          total_amount: receiptTotal,
          ocr_confidence: null, // Tesseract-era field; unused since Phase 9
          status: 'confirmed',
          // Phase 9 scan telemetry (all null for manual entries) — migration 027
          scan_provider: scanMeta?.provider ?? null,
          scan_model: scanMeta?.model ?? null,
          scan_prompt_version: scanMeta?.promptVersion ?? null,
          scan_schema_version: scanMeta?.schemaVersion ?? null,
          scan_raw_result: scanMeta?.raw ?? null,
          scan_latency_ms: scanMeta?.latencyMs ?? null,
          scan_input_tokens: scanMeta?.inputTokens ?? null,
          scan_output_tokens: scanMeta?.outputTokens ?? null,
          scan_feedback_expected: Boolean(entryMode === 'scan' && scanMeta),
          scan_feedback_schema_version:
            entryMode === 'scan' && scanMeta ? RECEIPT_SCAN_FEEDBACK_SCHEMA_VERSION : null,
          scan_quality_schema_version: scanQuality?.schemaVersion ?? null,
          scan_quality_score: scanQuality?.score ?? null,
          scan_quality_level: scanQuality?.level ?? null,
          scan_quality_warnings: scanQuality ? qualityOutcomes : null,
          scan_review_duration_ms: scanQuality ? reviewDurationMs : null,
          scan_low_review_risk: lowReviewRisk,
          scan_saved_with_unresolved_warnings: qualityOutcomes.some(
            (warning) => warning.outcome === 'unresolved'
          ),
          // Phase 10: consent snapshot. is_on_receipt on items remains a
          // separate label-quality signal and never grants permission itself.
          training_eligible: trainingEligible,
          training_consent_version: trainingEligible ? RECEIPT_TRAINING_CONSENT_VERSION : null,
          training_consented_at: trainingEligible
            ? trainingChoice?.receipt_training_consented_at
            : null,
        })
        .select('id')
        .single()

      if (receiptErr || !receipt) {
        throw new ReceiptSaveError('receipt_insert', receiptErr, t('saveReceiptError'))
      }
      receiptCreated = true

      const expenseRows = toSave.map((item) => ({
        family_id: familyId,
        added_by: userId,
        receipt_id: receipt.id,
        category_id: item.categoryId,
        name: item.name.trim(),
        amount: item.amount,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        original_price: item.originalPrice ?? null,
        discount_amount: item.discountAmount ?? null,
        expense_date: receiptDate,
        is_manual: item.source === 'manual',
        // is_on_receipt: model items are on the receipt; manually added review
        // items default true (commonly a line the model missed) with a toggle.
        // Standalone manual entries (no scan) are never receipt-image labels.
        is_on_receipt: entryMode === 'scan' ? item.isOnReceipt : false,
        receipt_line_index: item.lineIndex ?? null,
      }))

      savePhase = 'expense_insert'
      const { data: savedExpenses, error: itemsErr } = await supabase
        .from('expense_items')
        .insert(expenseRows)
        .select('id')

      if (itemsErr) {
        throw new ReceiptSaveError('expense_insert', itemsErr, t('saveFailed'))
      }
      savedExpenseCount = savedExpenses?.length ?? 0
      if (savedExpenseCount !== expenseRows.length) {
        throw new ReceiptSaveError('expense_insert', null, t('saveFailed'))
      }

      // Record model corrections — diff original GPT values vs what the user saved.
      // Only applies to OCR-sourced items; manual entries have no 'original' to diff against.
      // Round-to-integer helpers prevent false positives from floating-point representation
      // (e.g. parseFloat('0,52') might differ from parseFloat('0.52') at the 15th decimal).
      savePhase = 'post_save'
      if (entryMode === 'scan' && scanMeta) {
        const baseFeedbackEvents = buildReceiptScanFeedbackEvents({
          originalItems: originalOcrItemsRef.current,
          finalItems: items,
          originalStoreName: originalStoreNameRef.current,
          finalStoreName: storeName,
          originalDate: originalDateRef.current,
          finalDate: receiptDate,
          originalTotal: originalReceiptTotalRef.current,
          finalTotal: receiptTotal,
          model: scanMeta.model,
          promptVersion: scanMeta.promptVersion,
          reviewContext: {
            reviewDurationMs,
            qualityScore: scanQuality?.score ?? null,
            qualityLevel: scanQuality?.level ?? null,
            correctedWarningCount: qualityOutcomes.filter(
              (warning) => warning.outcome === 'corrected'
            ).length,
            dismissedWarningCount: qualityOutcomes.filter(
              (warning) => warning.outcome === 'dismissed'
            ).length,
            unresolvedWarningCount: qualityOutcomes.filter(
              (warning) => warning.outcome === 'unresolved'
            ).length,
            lowReviewRisk,
          },
        })
        const suggestionEvents = buildCorrectionSuggestionEvents({
          suggestions: correctionSuggestions,
          decisions: suggestionDecisions,
          finalStoreName: storeName,
          finalItems: items,
        })
        const feedbackEvents = mergeCorrectionSuggestionEvents(baseFeedbackEvents, suggestionEvents)
        let feedbackError: { message: string } | null = null
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          const result = await supabase.rpc('record_receipt_scan_feedback', {
            p_receipt_id: receipt.id,
            p_feedback_schema_version: RECEIPT_SCAN_FEEDBACK_SCHEMA_VERSION,
            p_events: feedbackEvents,
          })
          feedbackError = result.error
          if (!feedbackError) break
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 250))
          }
        }
        if (feedbackError) {
          Sentry.captureException(
            new Error(`receipt scan feedback insert failed: ${feedbackError.message}`)
          )
        }
      }

      const cents = (n: number) => Math.round(n * 100)
      const millis = (n: number | undefined) => (n == null ? null : Math.round(n * 1000))

      const correctionRows = items
        .filter((item) => item.source === 'ocr')
        .flatMap((item) => {
          const orig = originalOcrItemsRef.current.find((o) => o.id === item.id)
          if (!orig) return []
          const excluded = !item.include
          const nameChanged = item.name.trim() !== orig.name
          const priceChanged = cents(item.amount) !== cents(orig.amount)
          const qtyChanged = millis(item.quantity) !== millis(orig.quantity)
          const unitChanged = item.unit !== orig.unit
          // Category changes are intentionally not tracked — category assignment
          // is handled by item_category_memory, not the OCR model.
          if (!excluded && !nameChanged && !priceChanged && !qtyChanged && !unitChanged) return []
          return [
            {
              family_id: familyId,
              receipt_id: receipt.id,
              ocr_raw_name: orig.name,
              ocr_raw_price: orig.amount,
              ocr_raw_quantity: orig.quantity ?? null,
              ocr_raw_unit: orig.unit ?? null,
              corrected_name: excluded ? null : item.name.trim(),
              corrected_price: excluded ? null : item.amount,
              corrected_quantity: excluded ? null : (item.quantity ?? null),
              corrected_unit: excluded ? null : (item.unit ?? null),
              store_name: storeName || null,
            },
          ]
        })

      // Also capture OCR items that were deleted via the trash icon.
      // Deleted items are absent from `items` state, so the flatMap above never
      // sees them. Treat them as excluded (corrected_name: null) — same as unchecked.
      const currentOcrIds = new Set(items.filter((i) => i.source === 'ocr').map((i) => i.id))
      const deletedRows = originalOcrItemsRef.current
        .filter((orig) => !currentOcrIds.has(orig.id))
        .map((orig) => ({
          family_id: familyId,
          receipt_id: receipt.id,
          ocr_raw_name: orig.name,
          ocr_raw_price: orig.amount,
          ocr_raw_quantity: orig.quantity ?? null,
          ocr_raw_unit: orig.unit ?? null,
          corrected_name: null, // deleted = excluded
          corrected_price: null,
          corrected_quantity: null,
          corrected_unit: null,
          store_name: storeName || null,
        }))

      const allCorrectionRows = [...correctionRows, ...deletedRows]
      if (allCorrectionRows.length > 0) {
        // Awaited so navigation cannot drop the insert (ADR-015); a failure is
        // reported but never rolls back the already-saved receipt.
        const { error: corrErr } = await supabase.from('ocr_corrections').insert(allCorrectionRows)
        if (corrErr)
          Sentry.captureException(new Error(`ocr_corrections insert failed: ${corrErr.message}`))
      }

      // Receipt-level corrections: store name and/or date changed by user
      const storeNameChanged = storeName.trim() !== originalStoreNameRef.current
      const dateChanged = receiptDate !== originalDateRef.current
      if (storeNameChanged || dateChanged) {
        // Awaited for the same reason as ocr_corrections above
        const { error: rcErr } = await supabase.from('ocr_receipt_corrections').insert({
          family_id: familyId,
          receipt_id: receipt.id,
          ocr_raw_store_name: originalStoreNameRef.current || null,
          corrected_store_name: storeNameChanged ? storeName.trim() || null : null,
          ocr_raw_date: originalDateRef.current || null,
          corrected_date: dateChanged ? receiptDate : null,
        })
        if (rcErr)
          Sentry.captureException(
            new Error(`ocr_receipt_corrections insert failed: ${rcErr.message}`)
          )
      }

      let shouldAskTrainingChoice = false
      if (entryMode === 'scan' && imageUrl && scanMeta) {
        const { data: promptClaimed, error: promptError } = await supabase.rpc(
          'claim_receipt_training_prompt',
          {
            p_receipt_id: receipt.id,
            p_prompt_version: RECEIPT_TRAINING_CONSENT_VERSION,
          }
        )
        if (promptError) {
          Sentry.captureException(new Error(`training prompt claim failed: ${promptError.message}`))
        } else {
          shouldAskTrainingChoice = promptClaimed === true
        }
      }
      setTrainingPromptReceiptId(shouldAskTrainingChoice ? receipt.id : null)
      setTrainingChoiceError(null)

      router.refresh()
      setStage('done')
    } catch (err) {
      const saveError = err instanceof Error ? err : new Error(t('saveFailed'))
      const phase = err instanceof ReceiptSaveError ? err.phase : savePhase
      const databaseError = err instanceof ReceiptSaveError ? err.databaseError : null

      // Keep receipt content out of monitoring. Operational metadata is enough
      // to identify which persistence step failed and whether it partially ran.
      Sentry.withScope((scope) => {
        scope.setTag('operation', 'receipt_save')
        scope.setTag('save_phase', phase)
        scope.setTag('entry_mode', entryMode)
        if (databaseError?.code) scope.setTag('supabase_error_code', databaseError.code)
        scope.setContext('receipt_save', {
          selected_item_count: toSave.length,
          receipt_created: receiptCreated,
          saved_expense_count: savedExpenseCount,
          has_selected_image: Boolean(selectedFile),
          has_scan_metadata: Boolean(scanMeta),
        })
        Sentry.captureException(saveError)
      })
      console.error('[receipt-save] failed', {
        phase,
        message: saveError.message,
        code: databaseError?.code ?? null,
        details: databaseError?.details ?? null,
        hint: databaseError?.hint ?? null,
      })

      setError(saveError.message)
      setStage('review')
      requestAnimationFrame(() => {
        errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleTrainingChoice(enabled: boolean) {
    if (!trainingPromptReceiptId) return
    setTrainingChoiceSaving(true)
    setTrainingChoiceError(null)

    const { error: choiceError } = await supabase.rpc('set_receipt_training_choice', {
      p_enabled: enabled,
      p_choice_version: RECEIPT_TRAINING_CONSENT_VERSION,
      p_receipt_id: enabled ? trainingPromptReceiptId : null,
    })

    if (choiceError) {
      Sentry.captureException(new Error(`training choice save failed: ${choiceError.message}`))
      setTrainingChoiceError(t('trainingChoiceError'))
      setTrainingChoiceSaving(false)
      return
    }

    setTrainingPromptReceiptId(null)
    setTrainingChoiceSaving(false)
    router.refresh()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const totalSelected = items.filter((i) => i.include).reduce((sum, i) => sum + i.amount, 0)
  const currentQuality = scanQuality
    ? assessReceiptScanQuality(
        {
          storeName,
          receiptDateRaw: receiptDateEdited ? receiptDate : originalReceiptDateRawRef.current,
          receiptDate: receiptDateEdited ? receiptDate || null : originalDateRef.current || null,
          totalAmount: receiptTotal,
          items: items.map((item) => ({
            name: item.name,
            amount: item.amount,
            quantity: item.quantity ?? 0,
            unit: item.unit ?? '',
            unitPrice: item.unitPrice ?? null,
            discountAmount: item.discountAmount ?? null,
            originalPrice: item.originalPrice ?? null,
            include: item.include,
            lineIndex: item.lineIndex,
          })),
        },
        scanQualityContext
      )
    : null

  function qualityWarningReason(warning: ReceiptScanQualityWarning) {
    return t(`qualityWarning_${warning.code}`, warning.params)
  }

  function qualityWarningCard(warning: ReceiptScanQualityWarning) {
    return (
      <ScanQualityWarningCard
        key={warning.id}
        reason={qualityWarningReason(warning)}
        dismissed={Boolean(dismissedQualityWarnings[warning.id])}
        dismissLabel={t('qualityLooksCorrect')}
        dismissedLabel={t('qualityMarkedCorrect')}
        restoreLabel={t('qualityReviewAgain')}
        onDismiss={() =>
          setDismissedQualityWarnings((current) => ({ ...current, [warning.id]: true }))
        }
        onRestore={() =>
          setDismissedQualityWarnings((current) => ({ ...current, [warning.id]: false }))
        }
      />
    )
  }

  // ── STAGE: upload ─────────────────────────────────────────────────────────
  if (stage === 'upload') {
    // eslint-disable-next-line @next/next/no-img-element
    const receiptPreview = previewUrl ? (
      <img
        src={previewUrl}
        alt="Receipt preview"
        className="max-h-72 mx-auto rounded-lg object-contain"
      />
    ) : null

    if (!receiptScanningEnabled) {
      return (
        <div className="max-w-lg mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('title')}</h1>
          <p className="text-sm text-gray-500 mb-6">{t('description')}</p>
          <div className="card border border-indigo-200 bg-indigo-50 p-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-indigo-700" />
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {t('scanningDisabledTitle')}
                </h2>
                <p className="mt-1 text-sm leading-6 text-gray-600">{t('scanningDisabledBody')}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/privacy/consent?next=/scan"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                {t('enableScanning')}
              </Link>
              <button
                onClick={() => {
                  setReceiptTotal(null)
                  clearCorrectionSuggestionState()
                  setEntryMode('manual')
                  setItems([blankItem()])
                  setStage('review')
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                {t('enterManually')}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('title')}</h1>
        <p className="text-sm text-gray-500 mb-6">{t('description')}</p>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Drop zone — no capture so mobile shows gallery/files, not camera */}
        <div
          onClick={() => {
            if (fileRef.current) {
              fileRef.current.removeAttribute('capture')
              fileRef.current.click()
            }
          }}
          className="card p-8 border-2 border-dashed border-gray-300 hover:border-indigo-400
                     hover:bg-indigo-50/40 cursor-pointer transition text-center mb-4"
        >
          {previewUrl ? (
            receiptPreview
          ) : (
            <>
              <Upload className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium text-gray-700">{t('clickToUpload')}</p>
              <p className="text-xs text-gray-400 mt-1">{t('fileTypes')}</p>
            </>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="flex gap-3">
          <button
            onClick={() => {
              if (fileRef.current) {
                fileRef.current.setAttribute('capture', 'environment')
                fileRef.current.click()
              }
            }}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5
                       text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            <Camera className="h-4 w-4" />
            {t('camera')}
          </button>

          <button
            onClick={handleScan}
            disabled={!selectedFile}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600
                       px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700
                       disabled:opacity-40 transition"
          >
            {t('scanReceipt')}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={() => {
              compressedBlobRef.current = null
              setScanMeta(null)
              setReceiptTotal(null)
              clearCorrectionSuggestionState()
              setEntryMode('manual')
              setItems([blankItem()])
              setStage('review')
            }}
            className="text-sm text-indigo-600 hover:underline"
          >
            {t('skipScan')}
          </button>
        </div>
      </div>
    )
  }

  // ── STAGE: processing ─────────────────────────────────────────────────────
  if (stage === 'processing') {
    // One API call, not a multi-stage pipeline — a single spinner is honest
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <div
          className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"
          aria-hidden
        />
        <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('analysing')}</h2>
        <p className="text-sm text-gray-500">{t('processingHint')}</p>
      </div>
    )
  }

  // ── STAGE: done ───────────────────────────────────────────────────────────
  if (stage === 'done') {
    const saved = items.filter((i) => i.include && i.name.trim() && i.amount > 0)
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">{t('doneTitle')}</h2>
        <p className="text-sm text-gray-500 mb-2">
          {saved.length === 1
            ? t('doneItems', { count: saved.length, total: fmt(totalSelected) })
            : t('doneItemsPlural', { count: saved.length, total: fmt(totalSelected) })}
        </p>
        {uploadWarning && (
          <div className="mx-auto mt-3 flex max-w-sm items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-left text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            {uploadWarning}
          </div>
        )}
        {trainingPromptReceiptId && (
          <div className="mx-auto mt-6 max-w-md rounded-lg border border-indigo-200 bg-indigo-50 p-5 text-left">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-indigo-700" />
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{t('trainingChoiceTitle')}</h3>
                <p className="mt-1 text-sm leading-6 text-gray-600">{t('trainingChoiceBody')}</p>
                <Link
                  href="/privacy/consent"
                  className="mt-2 block text-xs text-gray-500 hover:text-gray-700"
                >
                  {t('trainingChoiceSettings')}
                </Link>
                <Link
                  href="/privacy"
                  target="_blank"
                  className="mt-2 inline-block text-xs font-medium text-indigo-700 underline hover:text-indigo-900"
                >
                  {t('trainingChoiceLearnMore')}
                </Link>
              </div>
            </div>
            {trainingChoiceError && (
              <p className="mt-3 text-sm text-red-700">{trainingChoiceError}</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void handleTrainingChoice(true)}
                disabled={trainingChoiceSaving}
                className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                {t('trainingChoiceAllow')}
              </button>
              <button
                type="button"
                onClick={() => void handleTrainingChoice(false)}
                disabled={trainingChoiceSaving}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                {t('trainingChoiceNotNow')}
              </button>
            </div>
          </div>
        )}
        <div className="flex gap-3 justify-center mt-6">
          <button
            onClick={() => {
              originalOcrItemsRef.current = [] // clear stale snapshot
              compressedBlobRef.current = null
              setScanMeta(null)
              setReceiptTotal(null)
              setStage('upload')
              setPreviewUrl(null)
              setSelectedFile(null)
              setItems([])
              setEntryMode('scan')
              setError(null)
              setUploadWarning(null)
              setTrainingPromptReceiptId(null)
              setTrainingChoiceError(null)
              clearCorrectionSuggestionState()
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('scanAnother')}
          </button>
          <button
            onClick={() => {
              window.location.href = '/expenses'
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {t('viewExpenses')}
          </button>
        </div>
      </div>
    )
  }

  // ── STAGE: review (+ saving) ──────────────────────────────────────────────
  const storeCorrectionSuggestion = correctionSuggestions.find(
    (suggestion) => suggestion.entityType === 'receipt'
  )
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {entryMode === 'manual' ? t('manualTitle') : t('reviewTitle')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {entryMode === 'manual' ? t('manualHint') : t('reviewHint')}
          </p>
        </div>
        <button
          onClick={() =>
            startTransition(() => {
              clearCorrectionSuggestionState()
              setItems([])
              setEntryMode('scan')
              setStage('upload')
            })
          }
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          {t('back')}
        </button>
      </div>

      {/* Store + date + total */}
      <div className="card p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">{t('store')}</label>
          <input
            type="text"
            value={storeName}
            onChange={(e) => {
              const value = e.target.value
              setStoreName(value)
              if (
                storeCorrectionSuggestion &&
                suggestionDecisions[storeCorrectionSuggestion.key] === 'accepted' &&
                value.trim().toLocaleLowerCase() !==
                  storeCorrectionSuggestion.suggestedValue.trim().toLocaleLowerCase()
              ) {
                setSuggestionDecisions((decisions) => ({
                  ...decisions,
                  [storeCorrectionSuggestion.key]: 'undone',
                }))
              }
            }}
            placeholder={t('storePlaceholder')}
            className="input-base text-sm"
            list="store-name-list"
            autoComplete="off"
          />
          <datalist id="store-name-list">
            {storeNames.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          {storeCorrectionSuggestion && correctionSuggestionCard(storeCorrectionSuggestion)}
          {currentQuality?.warnings
            .filter((warning) => warning.fieldName === 'store_name')
            .map(qualityWarningCard)}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">{tc('date')}</label>
          <input
            type="date"
            value={receiptDate}
            onChange={(e) => {
              setReceiptDate(e.target.value)
              setReceiptDateEdited(true)
            }}
            max={new Date().toISOString().slice(0, 10)}
            className={`input-base text-sm ${receiptDate > new Date().toISOString().slice(0, 10) ? 'border-amber-400 bg-amber-50' : ''}`}
          />
          {receiptDate > new Date().toISOString().slice(0, 10) && (
            <p className="mt-1 text-xs text-amber-700 flex items-center gap-1">
              <AlertCircle className="h-3 w-3 flex-shrink-0" />
              {t('futureDateWarning', { date: receiptDate })}
            </p>
          )}
          {currentQuality?.warnings
            .filter((warning) => warning.fieldName === 'receipt_date')
            .map(qualityWarningCard)}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            {t('receiptTotal')}
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={receiptTotalText}
            onChange={(event) => setReceiptTotalText(event.target.value)}
            onBlur={(event) => {
              const value = Number.parseFloat(event.target.value.replace(',', '.'))
              const nextValue = Number.isFinite(value) && value >= 0 ? value : null
              setReceiptTotal(nextValue)
              setReceiptTotalText(nextValue == null ? '' : nextValue.toFixed(2).replace('.', ','))
            }}
            className="input-base text-sm"
            placeholder={t('amountPlaceholder')}
          />
          {currentQuality?.warnings
            .filter((warning) => warning.fieldName === 'total_amount')
            .map(qualityWarningCard)}
        </div>
      </div>

      {error && (
        <div
          ref={errorRef}
          className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Item cards */}
      <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">
        {t('itemNameHeader')}
      </p>
      <div className="flex flex-col gap-2 mb-3">
        {items.map((item) => {
          const isOpen =
            discountOpen[item.id] ?? (item.discountAmount != null && item.discountAmount > 0)
          const mode = discountMode[item.id] ?? 'eur'
          const exactNameMatch = hasExactItemName(item.name, suggestions)
          const similarNameMatches = exactNameMatch
            ? []
            : findSimilarItemNames(item.name, suggestions, {
                canUseCanonicalBase:
                  item.quantity != null && item.unit != null && item.unit !== 'kpl',
              })
          const learnedSuggestion = correctionSuggestions.find(
            (suggestion) =>
              suggestion.entityType === 'item' && suggestion.lineIndex === item.lineIndex
          )
          // Compute the "other side" value for display
          const rawNum = parseFloat((discountText[item.id] ?? '').replace(',', '.'))
          const hasRaw = !isNaN(rawNum) && rawNum > 0
          const storedAmt =
            item.discountAmount != null && item.discountAmount > 0 ? item.discountAmount : null
          let computed: string | null = null
          if (isOpen) {
            if (hasRaw && item.amount > 0) {
              if (mode === 'pct') {
                const euros = (item.amount * rawNum) / 100
                computed = `− ${euros.toFixed(2).replace('.', ',')} €`
              } else {
                const pct = (rawNum / (item.amount + rawNum)) * 100
                computed = `= ${pct.toFixed(1).replace('.', ',')} %`
              }
            } else if (!hasRaw && storedAmt && item.amount > 0) {
              if (mode === 'pct') {
                const euros = storedAmt
                computed = `− ${euros.toFixed(2).replace('.', ',')} €`
              } else {
                const pct = (storedAmt / (item.amount + storedAmt)) * 100
                computed = `= ${pct.toFixed(1).replace('.', ',')} %`
              }
            }
          }
          return (
            <div
              key={item.id}
              className={`border border-surface-border rounded-xl bg-surface-card p-3 transition hover:border-indigo-200 hover:shadow-sm ${!item.include ? 'opacity-40' : ''}`}
            >
              {/* Row 1: checkbox (scan only) + name + amount badge + category pill + delete */}
              <div className="flex items-start gap-2">
                {entryMode === 'scan' && (
                  <input
                    type="checkbox"
                    checked={item.include}
                    onChange={(e) => updateItem(item.id, { include: e.target.checked })}
                    className="h-4 w-4 flex-shrink-0 rounded border-gray-300 text-indigo-600"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <ItemNameSuggestInput
                    value={item.name}
                    onChange={(val) => updateItem(item.id, { name: val })}
                    onPick={(s) => pickSuggestionForRow(item.id, s)}
                    suggestions={suggestions}
                    matches={similarNameMatches}
                    matchStatus={
                      exactNameMatch
                        ? 'exact'
                        : similarNameMatches.length > 0
                          ? 'similar'
                          : undefined
                    }
                    exactMatchLabel={t('exactSavedMatch')}
                    similarMatchLabel={t('suggestionAvailable')}
                    showPrice={false}
                    className="w-full border-none bg-transparent text-[15px] font-medium text-gray-800 placeholder-gray-300 outline-none p-0 focus:ring-0"
                    placeholder={t('itemNamePlaceholder')}
                    autoFocus={item.id === lastAddedId}
                  />
                  {learnedSuggestion && correctionSuggestionCard(learnedSuggestion)}
                </div>
                {/* Amount badge — inline editable */}
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`${t('amountHeader')}: ${item.name || t('itemNamePlaceholder')}`}
                  value={
                    amountText[item.id] ??
                    (item.amount === 0 ? '' : item.amount.toFixed(2).replace('.', ','))
                  }
                  onChange={(e) => setAmountText((p) => ({ ...p, [item.id]: e.target.value }))}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value.replace(',', '.'))
                    updateItem(item.id, { amount: isNaN(val) ? 0 : val })
                    setAmountText((p) => {
                      const n = { ...p }
                      delete n[item.id]
                      return n
                    })
                  }}
                  className="w-20 text-right text-sm font-semibold text-brand-600 bg-brand-50 rounded-lg px-2 py-1 border-none outline-none focus:bg-brand-100 transition"
                  placeholder="0,00"
                />
                {/* Category pill */}
                <select
                  value={item.categoryId ?? ''}
                  onChange={(e) => updateItem(item.id, { categoryId: e.target.value || null })}
                  className="text-xs text-gray-500 bg-gray-100 border-none rounded-full px-2.5 py-1.5 outline-none cursor-pointer max-w-[130px] truncate"
                >
                  <option value="">{t('noCategory')}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </option>
                  ))}
                </select>
                {/* Delete */}
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="flex-shrink-0 text-gray-300 hover:text-red-400 transition p-0.5"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Row 2: QTY + unit + spacer + discount toggle */}
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  {tc('qty')}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={
                    quantityText[item.id] ??
                    (item.quantity != null ? String(item.quantity).replace('.', ',') : '')
                  }
                  onChange={(e) => setQuantityText((p) => ({ ...p, [item.id]: e.target.value }))}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value.replace(',', '.'))
                    updateItem(item.id, { quantity: isNaN(val) ? undefined : val })
                    setQuantityText((p) => {
                      const n = { ...p }
                      delete n[item.id]
                      return n
                    })
                  }}
                  className="w-14 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 focus:border-indigo-400 outline-none"
                  placeholder="qty"
                />
                <select
                  value={item.unit ?? ''}
                  onChange={(e) => updateItem(item.id, { unit: e.target.value || undefined })}
                  className="rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-600 focus:border-indigo-400 outline-none cursor-pointer"
                >
                  <option value="">—</option>
                  <option value="kpl">kpl</option>
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="l">l</option>
                  <option value="ml">ml</option>
                  <option value="cl">cl</option>
                </select>
                <div className="flex-1" />
                {/* Training-label toggle — manual rows during a scan default to
                    "on receipt" (usually a line the model missed) */}
                {entryMode === 'scan' && item.source === 'manual' && (
                  <label className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 cursor-pointer select-none mr-1">
                    <input
                      type="checkbox"
                      checked={item.isOnReceipt}
                      onChange={(e) => updateItem(item.id, { isOnReceipt: e.target.checked })}
                      className="h-3 w-3 rounded border-gray-300 text-indigo-600"
                    />
                    {t('onReceipt')}
                  </label>
                )}
                {/* Discount toggle */}
                <button
                  type="button"
                  onClick={() => setDiscountOpen((p) => ({ ...p, [item.id]: !isOpen }))}
                  className={`flex items-center gap-1 text-xs rounded-full px-3 py-1 transition font-medium ${
                    isOpen
                      ? 'text-[#e67e00] border border-[#e67e00] bg-[#fff8f0]'
                      : 'text-gray-400 border border-dashed border-gray-300 hover:text-[#e67e00] hover:border-[#e67e00] hover:bg-[#fff8f0]'
                  }`}
                >
                  {isOpen ? '×' : '+'} {tc('discount')}
                </button>
              </div>

              {/* Row 3: Discount fields (shown when open) */}
              {isOpen && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {tc('discount')}
                  </span>
                  {/* € / % mode toggle */}
                  <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountMode((p) => ({ ...p, [item.id]: 'eur' }))
                        setDiscountText((p) => ({ ...p, [item.id]: '' }))
                      }}
                      className={`px-2.5 py-1 text-xs font-bold transition ${mode === 'eur' ? 'bg-brand-600 text-white' : 'text-gray-400 bg-white'}`}
                    >
                      €
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountMode((p) => ({ ...p, [item.id]: 'pct' }))
                        setDiscountText((p) => ({ ...p, [item.id]: '' }))
                      }}
                      className={`px-2.5 py-1 text-xs font-bold transition ${mode === 'pct' ? 'bg-brand-600 text-white' : 'text-gray-400 bg-white'}`}
                    >
                      %
                    </button>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={
                      discountText[item.id] ??
                      (storedAmt != null
                        ? mode === 'eur'
                          ? storedAmt.toFixed(2).replace('.', ',')
                          : item.originalPrice != null
                            ? ((storedAmt / item.originalPrice) * 100).toFixed(1).replace('.', ',')
                            : ''
                        : '')
                    }
                    onChange={(e) => setDiscountText((p) => ({ ...p, [item.id]: e.target.value }))}
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value.replace(',', '.'))
                      if (!isNaN(v) && v > 0) {
                        if (mode === 'eur') {
                          updateItem(item.id, { discountAmount: v, originalPrice: item.amount + v })
                        } else {
                          const a = (item.amount * v) / 100
                          updateItem(item.id, { discountAmount: a, originalPrice: item.amount + a })
                        }
                      } else {
                        updateItem(item.id, { discountAmount: undefined, originalPrice: undefined })
                      }
                      setDiscountText((p) => {
                        const n = { ...p }
                        delete n[item.id]
                        return n
                      })
                    }}
                    className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 focus:border-indigo-400 outline-none"
                    placeholder="0"
                  />
                  <span className="text-xs text-gray-400 font-semibold">
                    {mode === 'eur' ? '€' : '%'}
                  </span>
                  {computed && (
                    <span className="text-xs text-[#e67e00] bg-[#fff3e0] rounded-full px-2.5 py-0.5 font-semibold">
                      {computed}
                    </span>
                  )}
                </div>
              )}
              {currentQuality?.warnings
                .filter((warning) => warning.lineIndex === item.lineIndex)
                .map(qualityWarningCard)}
            </div>
          )
        })}
      </div>

      {/* Add item button */}
      <button
        type="button"
        onClick={addItem}
        className="w-full py-2.5 mb-4 border border-dashed border-brand-200 rounded-xl text-sm font-semibold text-brand-600 hover:bg-brand-50 transition"
      >
        + {t('addItem')}
      </button>

      {quickItems.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">
            {t('quickAdd')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {quickItems.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => addSuggestedItem(s)}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white
                           px-3 py-1.5 text-xs font-medium text-gray-700 transition
                           hover:border-brand-600 hover:text-brand-600 hover:bg-brand-50"
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-gray-400 text-[11px]">{fmt(s.lastPrice)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className="sticky bottom-6 flex items-center justify-between bg-white border border-gray-200
                      rounded-xl px-5 py-4 shadow-lg"
      >
        <div>
          <div className="text-xs text-gray-500">
            {t('itemsSelected', { count: items.filter((i) => i.include).length })}
          </div>
          <div className="text-lg font-bold text-gray-900">{fmt(totalSelected)}</div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold
                     text-white hover:bg-green-700 disabled:opacity-50 transition"
        >
          <Check className="h-4 w-4" />
          {saving ? t('saving') : t('saveToExpenses')}
        </button>
      </div>
    </div>
  )
}
