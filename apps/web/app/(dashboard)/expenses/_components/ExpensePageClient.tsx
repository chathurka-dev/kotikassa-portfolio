'use client'

import { useState, useMemo, useRef } from 'react'
import { Plus, X, Search, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { createClient, formatDate, today, periodRange, currentPeriodStart, getISOWeeksInRange, type ISOWeek, type ResolvedPreferences } from '@kotikassa/shared'
import { usePreferences } from '@/hooks/usePreferences'
import ItemNameSuggestInput, { type ItemSuggestion } from '../../_components/ItemNameSuggestInput'
import ExpenseList, { type Expense, type Category } from '../../_components/ExpenseList'
import { useFormatCurrency } from '@/lib/currency-context'

interface Props {
  initialExpenses: Expense[]
  categories: Category[]
  familyId: string
  userId: string
  monthLabel: string
  currentMonth: string
  suggestions: ItemSuggestion[]
  preferences: ResolvedPreferences
}

export default function ExpensePageClient({ initialExpenses,
  categories,
  familyId,
  userId,
  monthLabel,
  currentMonth,
  suggestions,
  preferences: initialPreferences,
}: Props) {
  const fmt = useFormatCurrency()
  const t = useTranslations('expenses')
  const tc = useTranslations('common')
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses)
  const [showAdd, setShowAdd] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('kpl')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [date, setDate] = useState(today())
  const [discountAmt, setDiscountAmt] = useState('')
  const [discountPct, setDiscountPct] = useState('')
  const [showQty, setShowQty] = useState(false)
  const [showDiscount, setShowDiscount] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestedCategory, setSuggestedCategory] = useState<Category | null>(null)

  const supabase = createClient()
  const router = useRouter()

  // Live preferences
  const { prefs: preferences } = usePreferences(userId, initialPreferences)
  const { budgetStartDay } = preferences

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedStore, setSelectedStore] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'name'>('date')
  const [selectedWeek, setSelectedWeek] = useState<ISOWeek | null>(null)
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')
  const dateInputRef = useRef<HTMLInputElement>(null)

  const [curYear, curMon] = currentMonth.split('-').map(Number) as [number, number]
  // The actual budget-period range for the anchor month this page was loaded with —
  // used for the week filter, the current-period check, and the post-add refetch,
  // all of which must track the period (not the calendar month) once startDay > 1.
  const { from: periodFrom, to: periodTo } = useMemo(
    () => periodRange(`${currentMonth}-01`, budgetStartDay),
    [currentMonth, budgetStartDay]
  )
  const isCurrentMonth = `${currentMonth}-01` === currentPeriodStart(budgetStartDay)

  function navigateMonth(delta: number) {
    const d = new Date(curYear, curMon - 1 + delta, 1)
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    setSearchQuery('')
    setSelectedCategories(new Set())
    setSelectedDate('')
    setSelectedStore('')
    setSelectedWeek(null)
    setViewMode('month')
    setSortBy('date')
    router.push(`/expenses?month=${newMonth}`)
  }

  function switchToMonth() {
    setViewMode('month')
    setSelectedWeek(null)
  }

  function switchToWeek(weeks: ISOWeek[]) {
    setViewMode('week')
    const todayStr = today()
    const thisWeek = weeks.find(w => todayStr >= w.start && todayStr <= w.end)
    setSelectedWeek((prev) => prev ?? thisWeek ?? weeks[0] ?? null)
  }

  function navigateWeek(delta: number, weeks: ISOWeek[]) {
    const idx = weeks.findIndex(w => w.week === selectedWeek?.week && w.isoYear === selectedWeek?.isoYear)
    if (idx === -1) return
    const next = weeks[idx + delta]
    if (next) setSelectedWeek(next)
  }

  function clearFilters() {
    setSearchQuery('')
    setSelectedCategories(new Set())
    setSelectedDate('')
    setSelectedStore('')
    setSelectedWeek(null)
    setViewMode('month')
    setSortBy('date')
  }

  const displayed = useMemo(() => {
    let list = [...expenses]
    const q = searchQuery.trim().toLowerCase()
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q))
    if (selectedWeek) {
      list = list.filter((e) => e.expense_date >= selectedWeek.start && e.expense_date <= selectedWeek.end)
    } else {
      if (selectedDate) list = list.filter((e) => e.expense_date === selectedDate)
    }
    if (selectedCategories.size > 0)
      list = list.filter((e) => e.category_id !== null && selectedCategories.has(e.category_id!))
    if (selectedStore) list = list.filter((e) => e.receipts?.store_name === selectedStore)
    if (sortBy === 'amount') list.sort((a, b) => b.amount - a.amount)
    else if (sortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'fi'))
    return list
  }, [expenses, searchQuery, selectedCategories, selectedDate, selectedStore, sortBy, selectedWeek])

  const anyFilterActive =
    !!searchQuery.trim() || selectedCategories.size > 0 || !!selectedDate ||
    !!selectedStore || sortBy !== 'date' || viewMode === 'week'
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0)
  const filteredTotal = displayed.reduce((sum, e) => sum + e.amount, 0)
  const filteredSaved = displayed.reduce((sum, e) => sum + (e.discount_amount ?? 0), 0)

  const uniqueStores = useMemo(() => {
    const names = expenses
      .map((e) => e.receipts?.store_name)
      .filter((name): name is string => !!name?.trim())
    return [...new Set(names)].sort((a, b) => a.localeCompare(b))
  }, [expenses])

  const monthWeeks = useMemo(() => getISOWeeksInRange(periodFrom, periodTo), [periodFrom, periodTo])
  const selectedWeekIdx = selectedWeek
    ? monthWeeks.findIndex(w => w.week === selectedWeek.week && w.isoYear === selectedWeek.isoYear)
    : -1

  const dateFilteredExpenses = expenses.filter((e) => {
    if (selectedWeek) return e.expense_date >= selectedWeek.start && e.expense_date <= selectedWeek.end
    if (selectedDate && e.expense_date !== selectedDate) return false
    if (selectedStore && e.receipts?.store_name !== selectedStore) return false
    return true
  })
  const sortedCategories = [...categories].sort((a, b) => {
    const aAmt = dateFilteredExpenses.filter((e) => e.category_id === a.id).reduce((s, e) => s + e.amount, 0)
    const bAmt = dateFilteredExpenses.filter((e) => e.category_id === b.id).reduce((s, e) => s + e.amount, 0)
    return bAmt - aAmt
  })

  const quickItems = suggestions.slice(0, 24)

  function applySuggestion(s: ItemSuggestion) {
    setName(s.name)
    setAmount(s.lastPrice.toFixed(2).replace('.', ','))
    if (s.categoryId && categories.some((c) => c.id === s.categoryId)) {
      setCategoryId(s.categoryId)
    }
    setSuggestedCategory(null)
  }

  function handleNameChange(val: string) {
    setName(val)
    const query = val.trim().toLowerCase()
    if (!query) { setSuggestedCategory(null); return }

    const exact = suggestions.find((s) => s.name.toLowerCase() === query)
    if (exact?.categoryId && categories.some((c) => c.id === exact.categoryId)) {
      setCategoryId(exact.categoryId)
      setSuggestedCategory(null)
      return
    }

    const fuzzy = suggestions
      .filter((s) => s.categoryId && categories.some((c) => c.id === s.categoryId))
      .filter((s) => {
        const sn = s.name.toLowerCase()
        return sn !== query && (sn.includes(query) || query.includes(sn))
      })
      .sort((a, b) => b.count - a.count)[0]

    if (fuzzy?.categoryId) {
      const cat = categories.find((c) => c.id === fuzzy.categoryId)
      setSuggestedCategory(cat ?? null)
    } else {
      setSuggestedCategory(null)
    }
  }

  function handleExpenseUpdate(updated: Expense) {
    setExpenses((prev) => prev.map((expense) => expense.id === updated.id ? updated : expense))
  }

  function handleReceiptStoreUpdate(receiptId: string, previousName: string | null, nextName: string) {
    setExpenses((prev) => prev.map((expense) =>
      expense.receipt_id === receiptId
        ? { ...expense, receipts: { store_name: nextName } }
        : expense
    ))
    setSelectedStore((current) => current === previousName ? nextName : current)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const parsedAmount = parseFloat(amount.replace(',', '.'))
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError(t('invalidAmount'))
      setSaving(false)
      return
    }

    const parsedQty = quantity ? parseFloat(quantity.replace(',', '.')) : null
    const parsedDiscount = discountAmt ? parseFloat(discountAmt.replace(',', '.')) : null
    const hasDiscount = parsedDiscount != null && !isNaN(parsedDiscount) && parsedDiscount > 0

    const { error: insertError } = await supabase
      .from('expense_items')
      .insert({
        family_id: familyId,
        name: name.trim(),
        amount: parsedAmount,
        quantity: parsedQty && !isNaN(parsedQty) ? parsedQty : null,
        unit: parsedQty && !isNaN(parsedQty) ? unit : null,
        discount_amount: hasDiscount ? parsedDiscount : null,
        original_price: hasDiscount ? Math.round((parsedAmount + parsedDiscount!) * 100) / 100 : null,
        expense_date: date,
        category_id: categoryId || null,
        is_manual: true,
      })

    if (insertError) {
      console.error('[handleAdd] insert failed:', insertError)
      setError(insertError.message)
      setSaving(false)
      return
    }

    const { data: fresh, error: fetchErr } = await supabase
      .from('expense_items')
      .select('*, categories(id, name, icon, color), receipts(store_name)')
      .eq('family_id', familyId)
      .gte('expense_date', periodFrom)
      .lte('expense_date', periodTo)
      .order('expense_date', { ascending: false })

    if (!fetchErr && fresh) {
      setExpenses(fresh as Expense[])
    }

    setName('')
    setAmount('')
    setQuantity('')
    setUnit('kpl')
    setDiscountAmt('')
    setDiscountPct('')
    setDate(today())
    setSuggestedCategory(null)
    setShowAdd(false)
    setSaving(false)
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {viewMode === 'week' && selectedWeek ? (
              <>
                <span className="font-semibold text-indigo-600">W{selectedWeek.week}</span>
                {' · '}{monthLabel}
                {' · '}<span className="font-medium text-gray-700">{fmt(filteredTotal)}</span>
              </>
            ) : anyFilterActive ? (
              <><span className="font-medium text-gray-700">{fmt(filteredTotal)}</span>
              {' / '}{fmt(totalSpent)} &middot; {monthLabel}</>
            ) : (
              <>{monthLabel} &middot; <span className="font-medium text-gray-700">{fmt(totalSpent)} total</span></>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold
                     text-white shadow-sm hover:bg-indigo-700 transition"
        >
          <Plus className="h-4 w-4" />
          {t('addExpense')}
        </button>
      </div>

      {/* Add expense form */}
      {showAdd && (
        <div className="card p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('newExpense')}</h3>
          {error && (
            <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}

          {quickItems.length > 0 && (
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                {t('quickAdd')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {quickItems.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => applySuggestion(s)}
                    title={fmt(s.lastPrice)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50
                               px-3 py-1.5 text-xs font-medium text-gray-700 transition
                               hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    <span>{s.name}</span>
                    <span className="text-gray-400">{fmt(s.lastPrice)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('itemName')}</label>
              <ItemNameSuggestInput
                value={name}
                onChange={handleNameChange}
                onPick={applySuggestion}
                suggestions={suggestions}
                placeholder={t('itemNamePlaceholder')}
                required
                autoFocus
              />
              {suggestedCategory && (
                <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-500">
                  <span>Suggested category:</span>
                  <button
                    type="button"
                    onClick={() => { setCategoryId(suggestedCategory.id); setSuggestedCategory(null) }}
                    className="flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200
                               px-2.5 py-0.5 text-indigo-700 font-medium hover:bg-indigo-100 transition"
                  >
                    {suggestedCategory.icon} {suggestedCategory.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuggestedCategory(null)}
                    className="text-gray-300 hover:text-gray-500 transition"
                    aria-label="Dismiss suggestion"
                  >
                    &times;
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('amountLabel')}</label>
              <input
                type="text"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input-base"
                placeholder={t('amountPlaceholder')}
                inputMode="decimal"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{tc('date')}</label>
              <input
                type="date"
                required
                value={date}
                max={today()}
                onChange={(e) => setDate(e.target.value)}
                className="input-base"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">{tc('category')}</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
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

            <div className="col-span-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowQty(v => !v)}
                className={`flex items-center gap-1 text-xs rounded-full px-3 py-1 transition font-medium ${
                  showQty
                    ? 'text-indigo-600 border border-indigo-400 bg-indigo-50'
                    : 'text-gray-400 border border-dashed border-gray-300 hover:text-indigo-500 hover:border-indigo-400 hover:bg-indigo-50'
                }`}
              >
                {showQty ? '\xd7' : '+'} {t('quantityLabel')}
              </button>
              <button
                type="button"
                onClick={() => setShowDiscount(v => !v)}
                className={`flex items-center gap-1 text-xs rounded-full px-3 py-1 transition font-medium ${
                  showDiscount
                    ? 'text-[#e67e00] border border-[#e67e00] bg-[#fff8f0]'
                    : 'text-gray-400 border border-dashed border-gray-300 hover:text-[#e67e00] hover:border-[#e67e00] hover:bg-[#fff8f0]'
                }`}
              >
                {showDiscount ? '\xd7' : '+'} {t('discountLabel')}
              </button>
            </div>

            {showQty && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('quantityLabel')}</label>
                  <input
                    type="text"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="input-base"
                    placeholder={t('quantityPlaceholder')}
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('unitLabel')}</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="input-base"
                  >
                    {(['kpl', 'kg', 'g', 'l', 'ml', 'cl'] as const).map((u) => (
                      <option key={u} value={u}>{t(`units.${u}`)}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {showDiscount && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('discountLabel')}</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={discountAmt}
                      onChange={(e) => {
                        const v = e.target.value
                        setDiscountAmt(v)
                        const a = parseFloat(v.replace(',', '.'))
                        const paid = parseFloat(amount.replace(',', '.'))
                        if (!isNaN(a) && a > 0 && !isNaN(paid) && paid > 0)
                          setDiscountPct((a / (paid + a) * 100).toFixed(1).replace('.', ','))
                        else setDiscountPct('')
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
                      value={discountPct}
                      onChange={(e) => {
                        const v = e.target.value
                        setDiscountPct(v)
                        const p = parseFloat(v.replace(',', '.'))
                        const paid = parseFloat(amount.replace(',', '.'))
                        if (!isNaN(p) && p > 0 && p < 100 && !isNaN(paid) && paid > 0)
                          setDiscountAmt((paid * p / (100 - p)).toFixed(2).replace('.', ','))
                        else setDiscountAmt('')
                      }}
                      className="input-base pr-6"
                      placeholder="0,0"
                      inputMode="decimal"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                  </div>
                </div>
                {(discountAmt || discountPct) && (() => {
                  const a = parseFloat(discountAmt.replace(',', '.'))
                  const paid = parseFloat(amount.replace(',', '.'))
                  if (!isNaN(a) && a > 0 && !isNaN(paid) && paid > 0)
                    return <p className="mt-1 text-xs text-gray-400">{t('originalPriceNote', { price: (paid + a).toFixed(2).replace('.', ',') + ' €' })}</p>
                  return null
                })()}
              </div>
            )}
            <div className="col-span-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowAdd(false); setError(null); setShowQty(false); setShowDiscount(false) }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600
                           hover:bg-gray-50 transition"
              >
                {tc('cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white
                           hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {saving ? t('saving') : t('save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter bar */}
      <div className="card p-4 mb-4 space-y-3">

        {/* Row 1: Period navigation + search */}
        <div className="flex items-center gap-2 flex-wrap">
          {preferences.showWeekFilter && (
            <div className="flex items-center bg-gray-100 rounded-xl p-1 flex-shrink-0">
              <button
                onClick={switchToMonth}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  viewMode === 'month' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t('viewMonth')}
              </button>
              <button
                onClick={() => switchToWeek(monthWeeks)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  viewMode === 'week' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t('viewWeek')}
              </button>
            </div>
          )}

          <div className="flex items-center flex-shrink-0">
            <button
              onClick={() => viewMode === 'week' ? navigateWeek(-1, monthWeeks) : navigateMonth(-1)}
              disabled={viewMode === 'week' && selectedWeekIdx <= 0}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700
                         disabled:opacity-25 disabled:cursor-not-allowed transition"
              aria-label={viewMode === 'week' ? t('prevWeek') : t('prevMonth')}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-bold text-gray-800 px-1.5 min-w-[90px] text-center select-none">
              {viewMode === 'week' && selectedWeek ? `W${selectedWeek.week}` : monthLabel}
            </span>
            <button
              onClick={() => viewMode === 'week' ? navigateWeek(1, monthWeeks) : navigateMonth(1)}
              disabled={viewMode === 'week'
                ? selectedWeekIdx >= monthWeeks.length - 1
                : isCurrentMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700
                         disabled:opacity-25 disabled:cursor-not-allowed transition"
              aria-label={viewMode === 'week' ? t('nextWeek') : t('nextMonth')}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className={`relative flex-1 ${preferences.showWeekFilter ? 'min-w-full sm:min-w-0' : ''}`}>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-8 text-sm
                         placeholder:text-gray-400 focus:border-indigo-300 focus:bg-white
                         focus:outline-none focus:ring-2 focus:ring-indigo-100 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5
                           text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Category chips */}
        <div className="relative">
          <div
            className="flex items-center gap-1.5 overflow-x-auto"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
          >
            <button
              onClick={() => setSelectedCategories(new Set())}
              className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                selectedCategories.size === 0
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('allCategories')}
            </button>
            {sortedCategories.map((cat) => {
              const catTotal = dateFilteredExpenses
                .filter((e) => e.category_id === cat.id)
                .reduce((s, e) => s + e.amount, 0)
              const isActive = selectedCategories.has(cat.id)
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategories((prev) => {
                    const next = new Set(prev)
                    if (next.has(cat.id)) next.delete(cat.id)
                    else next.add(cat.id)
                    return next
                  })}
                  className={`flex-shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5
                              text-xs font-semibold transition ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                  {catTotal > 0 && (
                    <span className={`font-normal ${isActive ? 'text-indigo-200' : 'text-gray-400'}`}>
                      {fmt(catTotal)}
                    </span>
                  )}
                </button>
              )
            })}
            <div className="flex-shrink-0 w-6" />
          </div>
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10
                          bg-gradient-to-l from-white to-transparent" />
        </div>

        {/* Row 3: Sort toggles + store + date button */}
        <div className="flex items-center gap-2 border-t border-gray-100 pt-3 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 flex-shrink-0">
            {(['date', 'amount', 'name'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  sortBy === s
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t(`sort${s.charAt(0).toUpperCase()}${s.slice(1)}` as 'sortDate' | 'sortAmount' | 'sortName')}
              </button>
            ))}
          </div>

          {preferences.showStoreFilter && uniqueStores.length >= 2 && (
            <div className="relative flex-shrink-0">
              <select
                value={selectedStore}
                onChange={(e) => setSelectedStore(e.target.value)}
                className={`appearance-none rounded-xl border pl-3 pr-7 py-1.5 text-xs font-semibold
                            focus:outline-none focus:border-indigo-300 transition cursor-pointer ${
                  selectedStore
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <option value="">{t('allStores')}</option>
                {uniqueStores.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 4.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
          )}

          <div className="flex-1" />

          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                if (selectedDate) return
                try { dateInputRef.current?.showPicker() } catch { dateInputRef.current?.click() }
              }}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold
                          transition select-none ${
                selectedDate
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
              <span
                onClick={selectedDate ? undefined : () => {
                  try { dateInputRef.current?.showPicker() } catch { dateInputRef.current?.click() }
                }}
              >
                {selectedDate ? formatDate(selectedDate) : t('anyDate')}
              </span>
              {selectedDate && (
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); setSelectedDate('') }}
                  className="ml-0.5 text-indigo-400 hover:text-indigo-700 transition cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </span>
              )}
            </button>
            <input
              ref={dateInputRef}
              type="date"
              aria-label={t('anyDate')}
              value={selectedDate}
              min={periodFrom}
              onChange={(e) => { setSelectedDate(e.target.value); switchToMonth() }}
              className="pointer-events-none absolute inset-0 opacity-0"
              tabIndex={-1}
            />
          </div>
        </div>

        {anyFilterActive && (
          <div className="flex items-center justify-between border-t border-gray-100 pt-2.5">
            <span className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
              <span>
                <span className="font-semibold text-gray-700">{displayed.length}</span>
                {' / '}{expenses.length} {t('itemsShown')}
              </span>
              <span className="text-gray-300">&middot;</span>
              <span className="font-semibold text-gray-700">{fmt(filteredTotal)}</span>
              {filteredSaved > 0 && (
                <>
                  <span className="text-gray-300">&middot;</span>
                  <span className="font-semibold text-emerald-600">{t('savedTotal', { amount: fmt(filteredSaved) })}</span>
                </>
              )}
            </span>
            <button
              onClick={clearFilters}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition"
            >
              {t('clearFilters')}
            </button>
          </div>
        )}
      </div>

      {/* Expense list */}
      {displayed.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-3xl mb-3">{anyFilterActive ? '\u{1F50D}' : '\u{1F9FE}'}</div>
          <p className="text-sm text-gray-500">
            {anyFilterActive ? t('noMatchingExpenses') : t('noExpenses')}
          </p>
          {anyFilterActive ? (
            <button
              onClick={clearFilters}
              className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              {t('clearFilters')}
            </button>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              {t('addFirst')}
            </button>
          )}
        </div>
      ) : (
        <div className="card">
          <ExpenseList
            items={displayed}
            categories={categories}
            familyId={familyId}
            onUpdate={handleExpenseUpdate}
            onReceiptStoreUpdate={handleReceiptStoreUpdate}
            onRemove={(id) => setExpenses((prev) => prev.filter((e) => e.id !== id))}
            onMove={(_expenseId, _catId, updatedExpense) =>
              setExpenses((prev) => prev.map((e) => e.id === updatedExpense.id ? updatedExpense : e))
            }
          />
        </div>
      )}
    </div>
  )
}
