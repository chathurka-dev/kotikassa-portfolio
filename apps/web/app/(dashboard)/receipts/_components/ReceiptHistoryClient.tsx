'use client'

import { useMemo, useState } from 'react'
import { ImageIcon, ReceiptText, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { formatDate } from '@kotikassa/shared'
import { useFormatCurrency } from '@/lib/currency-context'
import ReceiptDetailsModal from '../../_components/ReceiptDetailsModal'

export interface ReceiptHistoryEntry {
  id: string
  store_name: string | null
  receipt_date: string | null
  total_amount: number | null
  image_url: string | null
  created_at: string
  itemCount: number
}

interface Props {
  initialReceipts: ReceiptHistoryEntry[]
  familyId: string
  loadFailed: boolean
}

type ImageFilter = 'all' | 'withImage' | 'missingImage'

export default function ReceiptHistoryClient({ initialReceipts, familyId, loadFailed }: Props) {
  const t = useTranslations('receipts')
  const fmt = useFormatCurrency()
  const [receipts, setReceipts] = useState(initialReceipts)
  const [query, setQuery] = useState('')
  const [imageFilter, setImageFilter] = useState<ImageFilter>('all')
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null)

  const visibleReceipts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return receipts.filter((receipt) => {
      if (imageFilter === 'withImage' && !receipt.image_url) return false
      if (imageFilter === 'missingImage' && receipt.image_url) return false
      if (!normalizedQuery) return true
      return (receipt.store_name ?? '').toLocaleLowerCase().includes(normalizedQuery)
    })
  }, [imageFilter, query, receipts])

  function handleStoreNameUpdated(
    receiptId: string,
    _previousName: string | null,
    nextName: string
  ) {
    setReceipts((current) =>
      current.map((receipt) =>
        receipt.id === receiptId ? { ...receipt, store_name: nextName } : receipt
      )
    )
  }

  function handleReceiptDeleted(deletedId: string) {
    setReceipts((current) => current.filter((r) => r.id !== deletedId))
    setSelectedReceiptId(null)
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{t('searchLabel')}</span>
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchPlaceholder')}
            className="input-base w-full pl-9"
          />
        </label>
        <select
          value={imageFilter}
          onChange={(event) => setImageFilter(event.target.value as ImageFilter)}
          aria-label={t('imageFilterLabel')}
          className="input-base sm:w-48"
        >
          <option value="all">{t('allReceipts')}</option>
          <option value="withImage">{t('withImage')}</option>
          <option value="missingImage">{t('missingImage')}</option>
        </select>
      </div>

      {loadFailed ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {t('loadError')}
        </div>
      ) : visibleReceipts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
          <ReceiptText className="mx-auto h-9 w-9 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-700">
            {receipts.length === 0 ? t('empty') : t('noMatches')}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleReceipts.map((receipt) => (
            <button
              key={receipt.id}
              type="button"
              onClick={() => setSelectedReceiptId(receipt.id)}
              className="group rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                  <ReceiptText className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate font-semibold text-gray-900">
                      {receipt.store_name || t('unknownStore')}
                    </p>
                    <p className="shrink-0 font-semibold text-gray-900">
                      {receipt.total_amount == null ? '—' : fmt(receipt.total_amount)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {receipt.receipt_date ? formatDate(receipt.receipt_date) : t('unknownDate')}
                    {' · '}
                    {t('itemCount', { count: receipt.itemCount })}
                  </p>
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                    <ImageIcon className="h-3.5 w-3.5" />
                    {receipt.image_url ? t('imageSaved') : t('imageMissing')}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedReceiptId && (
        <ReceiptDetailsModal
          receiptId={selectedReceiptId}
          familyId={familyId}
          onClose={() => setSelectedReceiptId(null)}
          onStoreNameUpdated={handleStoreNameUpdated}
          onDeleted={handleReceiptDeleted}
        />
      )}
    </div>
  )
}
