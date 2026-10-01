'use client'

import { useState } from 'react'
import { Trash2, MoveRight, Pencil, Repeat, Lock, ReceiptText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createClient, formatDate } from '@kotikassa/shared'
import * as Sentry from '@sentry/nextjs'
import PriceHistoryModal from './PriceHistoryModal'
import ReceiptDetailsModal from './ReceiptDetailsModal'
import { useFormatCurrency } from '@/lib/currency-context'

/** Returns a formatted qty+unit string, or null if not meaningful (e.g. "1 kpl"). */
function fmtQtyUnit(quantity: number | null, unit: string | null): string | null {
  if (quantity == null || unit == null) return null
  return `${String(quantity).replace('.', ',')} ${unit}`
}

export interface Expense {
  id: string
  name: string
  amount: number
  quantity: number | null
  unit: string | null
  original_price: number | null
  discount_amount: number | null
  expense_date: string
  category_id: string | null
  categories: { id?: string; name: string; icon: string; color: string } | null
  receipts?: { store_name: string | null } | null
  receipt_id: string | null
  recurring_expense_id: string | null
  people_transaction_id: string | null
}

export interface Category {
  id: string
  name: string
  icon: string
  color: string
}

interface Props {
  items: Expense[]
  categories: Category[]
  familyId: string
  /** Called with the updated item after a successful edit. */
  onUpdate: (updated: Expense) => void
  onReceiptStoreUpdate?: (receiptId: string, previousName: string | null, nextName: string) => void
  /** Called with the deleted item's id after a successful delete. */
  onRemove: (id: string) => void
  /** If provided, shows the move-to-category button and calls this on move. */
  onMove?: (expenseId: string, newCategoryId: string, updatedExpense: Expense) => void
  /** Compact mode hides move-to-category button regardless of onMove. */
  compact?: boolean
}

export default function ExpenseList({ items, categories, familyId, onUpdate, onReceiptStoreUpdate, onRemove, onMove, compact = false }: Props) {
  const fmt = useFormatCurrency()
  const t = useTranslations('expenses')
  const tc = useTranslations('common')
  const tr = useTranslations('recurring')
  const supabase = createClient()

  // Edit modal state
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [editName, setEditName] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editQuantity, setEditQuantity] = useState('')
  const [editUnit, setEditUnit] = useState('kpl')
  const [editCategoryId, setEditCategoryId] = useState('')
  const [editDiscountAmt, setEditDiscountAmt] = useState('')
  const [editDiscountPct, setEditDiscountPct] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Move-to-category state
  const [movingId, setMovingId] = useState<string | null>(null)

  // Price history state
  const [priceHistoryItem, setPriceHistoryItem] = useState<string | null>(null)
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null)

  function openEdit(expense: Expense) {
    setEditingExpense(expense)
    setEditName(expense.name)
    setEditAmount(String(expense.amount).replace('.', ','))
    setEditDate(expense.expense_date)
    setEditQuantity(expense.quantity != null ? String(expense.quantity).replace('.', ',') : '')
    setEditUnit(expense.unit ?? 'kpl')
    setEditCategoryId(expense.category_id ?? '')
    if (expense.discount_amount != null && expense.discount_amount > 0) {
      setEditDiscountAmt(String(expense.discount_amount).replace('.', ','))
      const pct = expense.original_price
        ? (expense.discount_amount / expense.original_price * 100).toFixed(1).replace('.', ',')
        : ''
      setEditDiscountPct(pct)
    } else {
      setEditDiscountAmt('')
      setEditDiscountPct('')
    }
    setEditError(null)
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editingExpense) return
    setEditError(null)
    setEditSaving(true)

    const parsedAmount = parseFloat(editAmount.replace(',', '.'))
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setEditError(t('invalidAmount'))
      setEditSaving(false)
      return
    }
    const parsedQty = editQuantity ? parseFloat(editQuantity.replace(',', '.')) : null
    const parsedDiscount = editDiscountAmt ? parseFloat(editDiscountAmt.replace(',', '.')) : null
    const hasDiscount = parsedDiscount != null && !isNaN(parsedDiscount) && parsedDiscount > 0
    const normalizedQuantity = parsedQty && !isNaN(parsedQty) ? parsedQty : null
    const normalizedDiscount = hasDiscount ? parsedDiscount : null
    const originalPrice = hasDiscount
      ? Math.round((parsedAmount + parsedDiscount!) * 100) / 100
      : null
    const { data, error: updateError } = await supabase
      .from('expense_items')
      .update({
        name: editName.trim(),
        amount: parsedAmount,
        quantity: normalizedQuantity,
        unit: normalizedQuantity ? editUnit : null,
        discount_amount: normalizedDiscount,
        original_price: originalPrice,
        expense_date: editDate,
        category_id: editCategoryId || null,
      })
      .eq('id', editingExpense.id)
      .eq('family_id', familyId)
      .select('*, categories(id, name, icon, color), receipts(store_name)')
      .single()

    if (updateError || !data) {
      if (updateError) {
        Sentry.captureException(
          new Error(`Expense update failed: ${updateError.message} (code: ${updateError.code}, details: ${updateError.details})`)
        )
      }
      const detail = updateError ? ` (${updateError.code}: ${updateError.message})` : ''
      setEditError(t('editSaveError') + detail)
      setEditSaving(false)
      return
    }

    onUpdate(data as Expense)
    setEditingExpense(null)
    setEditSaving(false)
  }

  async function handleDelete(expense: Expense) {
    const confirmKey = expense.recurring_expense_id ? 'deleteRecurringConfirm' : 'deleteConfirm'
    if (!confirm(t(confirmKey))) return
    const { error } = await supabase.from('expense_items').delete().eq('id', expense.id)
    if (error) return
    onRemove(expense.id)
  }

  async function handleMove(expenseId: string, newCategoryId: string) {
    const { data, error: moveError } = await supabase
      .from('expense_items')
      .update({ category_id: newCategoryId })
      .eq('id', expenseId)
      .select('*, categories(id, name, icon, color), receipts(store_name)')
      .single()
    setMovingId(null)
    if (moveError) {
      console.error('[handleMove] update failed:', moveError)
      Sentry.captureException(new Error(`Expense move failed: ${moveError.message} (code: ${moveError.code})`))
    }
    if (data && onMove) onMove(expenseId, newCategoryId, data as Expense)
  }

  return (
    <>
      <div className="divide-y divide-gray-100">
        {items.map((expense) => {
          const qtyLabel = fmtQtyUnit(expense.quantity, expense.unit)
          return (
            <div key={expense.id} className="flex items-center gap-3 px-5 py-3">
              <span className="text-xl flex-shrink-0">{expense.categories?.icon ?? '\u{1F4E6}'}</span>
              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setPriceHistoryItem(expense.name)}
                  className="text-sm font-medium text-gray-900 truncate hover:text-indigo-600 transition text-left w-full"
                  title="View price history"
                >
                  {expense.name}
                </button>
                <div className="text-xs text-gray-400">
                  {expense.categories?.name ?? t('noCategory')}
                  {qtyLabel && <span className="sm:hidden"> &middot; {qtyLabel}</span>}
                  {' · '}{formatDate(expense.expense_date)}
                </div>
              </div>
              <div className="hidden sm:block w-16 text-right text-xs text-gray-400 flex-shrink-0">
                {qtyLabel}
              </div>
              <div className="flex flex-col items-end flex-shrink-0">
                <span className="text-sm font-semibold text-gray-900">
                  {fmt(expense.amount)}
                </span>
                {expense.discount_amount != null && (
                  <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 rounded-full px-1.5 py-0.5 mt-0.5 whitespace-nowrap">
                    {t('saved', { amount: fmt(expense.discount_amount) })}
                  </span>
                )}
                {expense.recurring_expense_id != null && (
                  <span className="flex items-center gap-0.5 text-[10px] font-medium text-indigo-500 bg-indigo-50 rounded-full px-1.5 py-0.5 mt-0.5 whitespace-nowrap">
                    <Repeat className="h-2.5 w-2.5" />
                    {tr('badge')}
                  </span>
                )}
              </div>

              {!compact && onMove && (
                movingId === expense.id ? (
                  <div className="flex items-center gap-1">
                    <select
                      className="text-xs border border-gray-300 rounded px-2 py-1"
                      defaultValue={expense.category_id ?? ''}
                      onChange={(e) => handleMove(expense.id, e.target.value)}
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon} {cat.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setMovingId(null)}
                      className="text-xs text-gray-400 hover:text-gray-600 px-1"
                    >
                      &times;
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setMovingId(expense.id)}
                    title={t('moveToCategory')}
                    className="text-gray-300 hover:text-indigo-500 transition p-1"
                  >
                    <MoveRight className="h-4 w-4" />
                  </button>
                )
              )}

              {expense.receipt_id && (
                <button
                  type="button"
                  onClick={() => setSelectedReceiptId(expense.receipt_id)}
                  title={t('viewReceipt')}
                  className="p-1 text-gray-300 transition hover:text-indigo-500"
                >
                  <ReceiptText className="h-4 w-4" />
                </button>
              )}

              {expense.people_transaction_id ? (
                <span
                  title={t('lockedByPeople')}
                  className="text-gray-300 p-1 cursor-default"
                >
                  <Lock className="h-4 w-4" />
                </span>
              ) : (
                <>
                  <button
                    onClick={() => openEdit(expense)}
                    title={tc('edit')}
                    className="text-gray-300 hover:text-indigo-500 transition p-1"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => handleDelete(expense)}
                    title={tc('delete')}
                    className="text-gray-300 hover:text-red-500 transition p-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>

      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setEditingExpense(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('editExpense')}</h3>
            {editError && (
              <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
                {editError}
              </div>
            )}
            <form onSubmit={handleEditSave} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('itemName')}</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="input-base"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('amountLabel')}</label>
                <input
                  type="text"
                  required
                  inputMode="decimal"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="input-base"
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{tc('date')}</label>
                <input
                  type="date"
                  required
                  value={editDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="input-base"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">{tc('category')}</label>
                <select
                  value={editCategoryId}
                  onChange={(e) => setEditCategoryId(e.target.value)}
                  className="input-base"
                >
                  <option value="">{t('uncategorized')}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('quantityLabel')}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(e.target.value)}
                  className="input-base"
                  placeholder={t('quantityPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('unitLabel')}</label>
                <select
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value)}
                  className="input-base"
                >
                  {(['kpl', 'kg', 'g', 'l', 'ml', 'cl'] as const).map((u) => (
                    <option key={u} value={u}>{t(`units.${u}`)}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('discountLabel')}</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={editDiscountAmt}
                      onChange={(e) => {
                        const v = e.target.value
                        setEditDiscountAmt(v)
                        const a = parseFloat(v.replace(',', '.'))
                        const paid = parseFloat(editAmount.replace(',', '.'))
                        if (!isNaN(a) && a > 0 && !isNaN(paid) && paid > 0)
                          setEditDiscountPct((a / (paid + a) * 100).toFixed(1).replace('.', ','))
                        else setEditDiscountPct('')
                      }}
                      className="input-base pr-6"
                      placeholder="0,00"
                      inputMode="decimal"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">&euro;</span>
                  </div>
                  <div className="relative w-24">
                    <input
                      type="text"
                      value={editDiscountPct}
                      onChange={(e) => {
                        const v = e.target.value
                        setEditDiscountPct(v)
                        const p = parseFloat(v.replace(',', '.'))
                        const paid = parseFloat(editAmount.replace(',', '.'))
                        if (!isNaN(p) && p > 0 && p < 100 && !isNaN(paid) && paid > 0)
                          setEditDiscountAmt((paid * p / (100 - p)).toFixed(2).replace('.', ','))
                        else setEditDiscountAmt('')
                      }}
                      className="input-base pr-6"
                      placeholder="0,0"
                      inputMode="decimal"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                  </div>
                </div>
                {editDiscountAmt && (() => {
                  const a = parseFloat(editDiscountAmt.replace(',', '.'))
                  const paid = parseFloat(editAmount.replace(',', '.'))
                  if (!isNaN(a) && a > 0 && !isNaN(paid) && paid > 0)
                    return <p className="mt-1 text-xs text-gray-400">{t('originalPriceNote', { price: (paid + a).toFixed(2).replace('.', ',') + ' €' })}</p>
                  return null
                })()}
              </div>
              <div className="sm:col-span-2 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingExpense(null)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  {tc('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {editSaving ? t('saving') : tc('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {priceHistoryItem && (
        <PriceHistoryModal
          itemName={priceHistoryItem}
          familyId={familyId}
          onClose={() => setPriceHistoryItem(null)}
        />
      )}

      {selectedReceiptId && (
        <ReceiptDetailsModal
          receiptId={selectedReceiptId}
          familyId={familyId}
          onClose={() => setSelectedReceiptId(null)}
          onStoreNameUpdated={(receiptId, previousName, nextName) =>
            onReceiptStoreUpdate?.(receiptId, previousName, nextName)
          }
        />
      )}
    </>
  )
}
