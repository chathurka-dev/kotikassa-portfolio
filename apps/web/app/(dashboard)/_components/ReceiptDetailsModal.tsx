'use client'

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from 'react'
import { ReceiptText, Trash2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Sentry from '@sentry/nextjs'
import { createClient, formatDate } from '@kotikassa/shared'
import { useFormatCurrency } from '@/lib/currency-context'
import ReceiptImageRecovery, { type RecoveryReceiptItem } from './ReceiptImageRecovery'

interface ReceiptDetails {
  id: string
  store_name: string | null
  receipt_date: string | null
  total_amount: number | null
  image_url: string | null
}

type ReceiptItem = RecoveryReceiptItem

interface DeleteReceiptResult {
  deleted: boolean
  image_path?: string | null
  deleted_item_count?: number
  reason?: 'people_locked'
  locked_count?: number
}

type ReceiptItemRow = Omit<ReceiptItem, 'categories'> & {
  categories: { name: string; icon: string } | Array<{ name: string; icon: string }> | null
}

interface Props {
  receiptId: string
  familyId: string
  onClose: () => void
  onStoreNameUpdated: (receiptId: string, previousName: string | null, nextName: string) => void
  onDeleted?: (receiptId: string) => void
}

function quantityLabel(quantity: number | null, unit: string | null): string | null {
  if (quantity == null || !unit) return null
  return `${String(quantity).replace('.', ',')} ${unit}`
}

export default function ReceiptDetailsModal({
  receiptId,
  familyId,
  onClose,
  onStoreNameUpdated,
  onDeleted,
}: Props) {
  const t = useTranslations('expenses')
  const tc = useTranslations('common')
  const fmt = useFormatCurrency()
  const supabase = useMemo(() => createClient(), [])
  const [receipt, setReceipt] = useState<ReceiptDetails | null>(null)
  const [items, setItems] = useState<ReceiptItem[]>([])
  const [storeSuggestions, setStoreSuggestions] = useState<string[]>([])
  const [storeName, setStoreName] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadReceipt() {
      setLoading(true)
      setLoadError(null)
      setSaveError(null)
      setReceipt(null)
      setItems([])
      setImageUrl(null)

      const [
        { data: receiptData, error: receiptError },
        { data: itemData, error: itemError },
        { data: storeData },
      ] = await Promise.all([
        supabase
          .from('receipts')
          .select('id, store_name, receipt_date, total_amount, image_url')
          .eq('id', receiptId)
          .eq('family_id', familyId)
          .single(),
        supabase
          .from('expense_items')
          .select(
            'id, name, amount, quantity, unit, discount_amount, original_price, receipt_line_index, categories(name, icon)'
          )
          .eq('receipt_id', receiptId)
          .eq('family_id', familyId)
          .order('receipt_line_index', { ascending: true, nullsFirst: false }),
        supabase
          .from('receipts')
          .select('store_name')
          .eq('family_id', familyId)
          .not('store_name', 'is', null)
          .order('store_name'),
      ])

      if (cancelled) return
      if (receiptError || itemError || !receiptData) {
        const error = receiptError ?? itemError
        if (error) Sentry.captureException(error)
        setLoadError(t('receiptLoadError'))
        setLoading(false)
        return
      }

      const loadedReceipt = receiptData as ReceiptDetails
      setReceipt(loadedReceipt)
      const loadedItems = ((itemData ?? []) as unknown as ReceiptItemRow[]).map((item) => ({
        ...item,
        categories: Array.isArray(item.categories) ? (item.categories[0] ?? null) : item.categories,
      }))
      setItems(loadedItems)
      setStoreName(loadedReceipt.store_name ?? '')
      const suggestions = (storeData ?? [])
        .map((row) => row.store_name)
        .filter((name): name is string => !!name?.trim())
      setStoreSuggestions([...new Set(suggestions)])

      if (loadedReceipt.image_url) {
        const { data: signedData, error: signedError } = await supabase.storage
          .from('receipts')
          .createSignedUrl(loadedReceipt.image_url, 600)
        if (!cancelled && !signedError) setImageUrl(signedData.signedUrl)
        if (signedError) Sentry.captureException(signedError)
      }

      if (!cancelled) setLoading(false)
    }

    void loadReceipt()
    return () => {
      cancelled = true
    }
  }, [familyId, receiptId, supabase, t])

  const itemsTotal = useMemo(() => items.reduce((sum, item) => sum + item.amount, 0), [items])

  async function handleStoreSave(event: React.FormEvent) {
    event.preventDefault()
    if (!receipt) return
    const nextName = storeName.trim()
    if (!nextName) {
      setSaveError(t('receiptStoreRequired'))
      return
    }
    if (nextName === (receipt.store_name ?? '')) return

    setSaving(true)
    setSaveError(null)
    const previousName = receipt.store_name
    const { data, error } = await supabase
      .from('receipts')
      .update({ store_name: nextName })
      .eq('id', receiptId)
      .eq('family_id', familyId)
      .select('id, store_name, receipt_date, total_amount, image_url')
      .single()

    if (error || !data) {
      if (error) Sentry.captureException(error)
      setSaveError(t('receiptStoreSaveError'))
      setSaving(false)
      return
    }

    setReceipt(data as ReceiptDetails)
    setStoreName(nextName)
    setStoreSuggestions((prev) => [...new Set([...prev, nextName])].sort())
    onStoreNameUpdated(receiptId, previousName, nextName)
    setSaving(false)
  }

  function handleImageAttached(
    path: string,
    signedUrl: string,
    totalAmount: number | null,
    refreshedItems: RecoveryReceiptItem[]
  ) {
    setReceipt((current) =>
      current ? { ...current, image_url: path, total_amount: totalAmount } : current
    )
    setItems(refreshedItems)
    setImageUrl(signedUrl)
  }

  async function handleDelete() {
    if (!receipt || deleting) return

    setDeleting(true)
    setDeleteError(null)

    // Check for people-locked items first — don't show confirm if blocked
    const { count: lockedCount, error: lockCheckError } = await supabase
      .from('expense_items')
      .select('id', { count: 'exact', head: true })
      .eq('receipt_id', receiptId)
      .eq('family_id', familyId)
      .not('people_transaction_id', 'is', null)

    if (lockCheckError) {
      setDeleteError(t('deleteReceiptError'))
      setDeleting(false)
      return
    }
    if ((lockedCount ?? 0) > 0) {
      setDeleteError(t('deleteReceiptLockedByPeople', { count: lockedCount }))
      setDeleting(false)
      return
    }

    if (!confirm(t('deleteReceiptConfirm', { count: items.length }))) {
      setDeleting(false)
      return
    }

    const { data, error: deleteReceiptError } = await supabase.rpc('delete_receipt', {
      p_receipt_id: receiptId,
    })
    const result = data as DeleteReceiptResult | null

    if (deleteReceiptError || !result) {
      if (deleteReceiptError) Sentry.captureException(deleteReceiptError)
      setDeleteError(t('deleteReceiptError'))
      setDeleting(false)
      return
    }

    if (!result.deleted) {
      setDeleteError(
        result.reason === 'people_locked'
          ? t('deleteReceiptLockedByPeople', { count: result.locked_count ?? 1 })
          : t('deleteReceiptError')
      )
      setDeleting(false)
      return
    }

    // Database deletion has committed. Storage cleanup is best-effort: an
    // orphaned private object is safer than deleting the image before a failed
    // database transaction and leaving a visible receipt with missing data.
    if (result.image_path) {
      const { error: storageError } = await supabase.storage
        .from('receipts')
        .remove([result.image_path])
      if (storageError) Sentry.captureException(storageError)
    }

    onDeleted?.(receiptId)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={deleting ? undefined : onClose} />
      <div className="relative flex max-h-[92dvh] w-full flex-col bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <ReceiptText className="h-5 w-5 text-indigo-600" />
          <h2 className="flex-1 text-base font-semibold text-gray-900">{t('receiptDetails')}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            title={tc('cancel')}
            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          {loading ? (
            <div className="py-14 text-center text-sm text-gray-400">{t('loadingReceipt')}</div>
          ) : loadError || !receipt ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {loadError ?? t('receiptLoadError')}
            </div>
          ) : (
            <div className="space-y-5">
              {imageUrl ? (
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                  <img
                    src={imageUrl}
                    alt={t('receiptImageAlt')}
                    className="max-h-80 w-full object-contain"
                  />
                </div>
              ) : (
                <ReceiptImageRecovery
                  familyId={familyId}
                  receipt={receipt}
                  items={items}
                  onAttached={handleImageAttached}
                />
              )}

              <form onSubmit={handleStoreSave} className="rounded-xl border border-gray-200 p-4">
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  {t('storeNameLabel')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    list={`receipt-store-options-${receiptId}`}
                    value={storeName}
                    onChange={(event) => setStoreName(event.target.value)}
                    className="input-base min-w-0 flex-1"
                  />
                  <datalist id={`receipt-store-options-${receiptId}`}>
                    {storeSuggestions.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  <button
                    type="submit"
                    disabled={
                      saving || !storeName.trim() || storeName.trim() === (receipt.store_name ?? '')
                    }
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saving ? t('saving') : tc('save')}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-gray-400">
                  {t('receiptStoreHint', { count: items.length })}
                </p>
                {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
              </form>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-gray-400">{tc('date')}</p>
                  <p className="mt-1 text-sm font-semibold text-gray-800">
                    {receipt.receipt_date ? formatDate(receipt.receipt_date) : '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-gray-400">{t('receiptTotal')}</p>
                  <p className="mt-1 text-sm font-semibold text-gray-800">
                    {receipt.total_amount == null ? '—' : fmt(receipt.total_amount)}
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">{t('receiptItems')}</h3>
                  <span className="text-xs font-semibold text-gray-500">
                    {t('receiptItemsTotal', { amount: fmt(itemsTotal) })}
                  </span>
                </div>
                {items.length === 0 ? (
                  <div className="rounded-xl border border-gray-200 py-8 text-center text-sm text-gray-400">
                    {t('noReceiptItems')}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                    {items.map((item) => {
                      const qty = quantityLabel(item.quantity, item.unit)
                      return (
                        <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                          <span className="text-lg">{item.categories?.icon ?? '📦'}</span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900">
                              {item.name}
                            </p>
                            <p className="text-xs text-gray-400">
                              {item.categories?.name ?? t('noCategory')}
                              {qty ? ` · ${qty}` : ''}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-900">
                              {fmt(item.amount)}
                            </p>
                            {item.discount_amount != null && item.discount_amount > 0 && (
                              <p className="text-[10px] text-emerald-600">
                                {t('saved', { amount: fmt(item.discount_amount) })}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-4">
                {deleteError && (
                  <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {deleteError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? t('deletingReceipt') : t('deleteReceipt')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
