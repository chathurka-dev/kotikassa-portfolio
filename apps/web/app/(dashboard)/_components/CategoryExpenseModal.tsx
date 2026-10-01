'use client'

import { useEffect, useState, useMemo } from 'react'
import { X, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createClient, periodRange } from '@kotikassa/shared'
import ExpenseList, { type Expense, type Category } from './ExpenseList'
import { useFormatCurrency } from '@/lib/currency-context'

interface Props {
  /** null means "Uncategorized" expenses */
  categoryId: string | null
  categoryName: string
  categoryIcon: string
  /** YYYY-MM */
  month: string
  /** Family's budget period start day (1-28); see ADR-014 */
  budgetStartDay: number
  familyId: string
  onClose: () => void
}

export default function CategoryExpenseModal({ categoryId,
  categoryName,
  categoryIcon,
  month,
  budgetStartDay,
  familyId,
  onClose,
}: Props) {
  const fmt = useFormatCurrency()
  const t = useTranslations('categoryModal')
  const te = useTranslations('expenses')
  const supabase = createClient()

  const [items, setItems] = useState<Expense[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'name'>('date')

  const { from, to } = periodRange(`${month}-01`, budgetStartDay)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function load() {
      const query = supabase
        .from('expense_items')
        .select('*, categories(id, name, icon, color), receipts(store_name)')
        .eq('family_id', familyId)
        .gte('expense_date', from)
        .lte('expense_date', to)
        .order('expense_date', { ascending: false })

      if (categoryId === null) {
        query.is('category_id', null)
      } else {
        query.eq('category_id', categoryId)
      }

      const [{ data: expensesRaw }, { data: catsRaw }] = await Promise.all([
        query,
        supabase
          .from('categories')
          .select('id, name, icon, color')
          .eq('family_id', familyId)
          .order('sort_order'),
      ])

      if (!cancelled) {
        setItems((expensesRaw ?? []) as Expense[])
        setCategories((catsRaw ?? []) as Category[])
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, month, familyId])

  const displayed = useMemo(() => {
    let list = [...items]
    const q = searchQuery.trim().toLowerCase()
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q))
    if (sortBy === 'amount') list.sort((a, b) => b.amount - a.amount)
    else if (sortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'fi'))
    return list
  }, [items, searchQuery, sortBy])

  const total = displayed.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <span className="text-2xl">{categoryIcon}</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">{categoryName}</h2>
            {!loading && (
              <p className="text-xs text-gray-400">
                {t('total')}: <span className="font-semibold text-gray-700">{fmt(total)}</span>
                {displayed.length !== items.length && (
                  <span className="ml-1 text-gray-300">({displayed.length}/{items.length})</span>
                )}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition p-1 -mr-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filter bar */}
        {!loading && items.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={te('searchPlaceholder')}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-7 text-xs
                           placeholder:text-gray-400 focus:border-indigo-300 focus:bg-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
              {(['date', 'amount', 'name'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    sortBy === s
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {te(`sort${s.charAt(0).toUpperCase()}${s.slice(1)}` as 'sortDate' | 'sortAmount' | 'sortName')}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">
              {t('loading')}
            </div>
          ) : displayed.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-400">
              {searchQuery ? te('noMatchingExpenses') : t('noExpenses')}
            </div>
          ) : (
            <ExpenseList
              items={displayed}
              categories={categories}
              familyId={familyId}
              compact
              onUpdate={(updated) =>
                setItems((prev) => prev.map((expense) => expense.id === updated.id ? updated : expense))
              }
              onReceiptStoreUpdate={(receiptId, _previousName, nextName) =>
                setItems((prev) => prev.map((expense) =>
                  expense.receipt_id === receiptId
                    ? { ...expense, receipts: { store_name: nextName } }
                    : expense
                ))
              }
              onRemove={(id) =>
                setItems((prev) => prev.filter((e) => e.id !== id))
              }
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-3 flex-shrink-0">
          <a
            href={`/expenses?month=${month}`}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition"
          >
            {t('viewAllInExpenses')} &rarr;
          </a>
        </div>

      </div>
    </div>
  )
}
