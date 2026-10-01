'use client'

import { useMemo, useState } from 'react'
import { Check, Copy, Pencil, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createClient } from '@kotikassa/shared'
import { useFormatCurrency } from '@/lib/currency-context'
import DashboardMonthNav from '../../_components/DashboardMonthNav'

interface Category {
  id: string
  name: string
  icon: string
  color: string
}

interface Props {
  categories: Category[]
  budgets: Record<string, number>
  previousBudgets: Record<string, number>
  spending: Record<string, number>
  familyId: string
  periodStart: string
  monthLabel: string
  currentMonth: string
  isCurrentMonth: boolean
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const clampedPct = Math.min(pct, 100)
  const barColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : color
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${clampedPct}%`, backgroundColor: barColor }}
      />
    </div>
  )
}

export default function BudgetsClient({
  categories,
  budgets: initialBudgets,
  previousBudgets,
  spending,
  familyId,
  periodStart,
  monthLabel,
  currentMonth,
  isCurrentMonth,
}: Props) {
  const fmt = useFormatCurrency()
  const t = useTranslations('budgets')
  const supabase = useMemo(() => createClient(), [])
  const [budgets, setBudgets] = useState(initialBudgets)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [copying, setCopying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const withBudget = categories.filter((category) => budgets[category.id] != null)
  const totalBudget = withBudget.reduce((sum, category) => sum + (budgets[category.id] ?? 0), 0)
  const totalSpent = withBudget.reduce((sum, category) => sum + (spending[category.id] ?? 0), 0)
  const overBudget = withBudget.filter((category) => (spending[category.id] ?? 0) > (budgets[category.id] ?? 0))
  const copyableEntries = Object.entries(previousBudgets).filter(([categoryId]) => budgets[categoryId] == null)

  function startEdit(categoryId: string) {
    const current = budgets[categoryId]
    setEditingId(categoryId)
    setEditAmount(current == null ? '' : String(current).replace('.', ','))
    setError(null)
    setNotice(null)
  }

  async function saveBudget(categoryId: string) {
    if (saving) return
    setSaving(true)
    setError(null)
    setNotice(null)
    const raw = editAmount.trim().replace(',', '.')

    if (!raw) {
      const { error: deleteError } = await supabase
        .from('budgets')
        .delete()
        .eq('family_id', familyId)
        .eq('category_id', categoryId)
        .eq('month', periodStart)
      if (deleteError) {
        setError(t('saveError'))
        setSaving(false)
        return
      }
      setBudgets((current) => {
        const next = { ...current }
        delete next[categoryId]
        return next
      })
      setEditingId(null)
      setSaving(false)
      return
    }

    const amount = Number(raw)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t('invalidAmount'))
      setSaving(false)
      return
    }

    const { error: upsertError } = await supabase.from('budgets').upsert(
      { family_id: familyId, category_id: categoryId, month: periodStart, amount },
      { onConflict: 'family_id,category_id,month' },
    )
    if (upsertError) {
      setError(t('saveError'))
      setSaving(false)
      return
    }

    setBudgets((current) => ({ ...current, [categoryId]: amount }))
    setEditingId(null)
    setSaving(false)
  }

  async function copyPreviousPeriod() {
    if (copying || copyableEntries.length === 0) return
    setCopying(true)
    setError(null)
    setNotice(null)
    const rows = copyableEntries.map(([categoryId, amount]) => ({
      family_id: familyId,
      category_id: categoryId,
      month: periodStart,
      amount,
    }))
    const { error: copyError } = await supabase.from('budgets').upsert(rows, {
      onConflict: 'family_id,category_id,month',
    })
    if (copyError) {
      setError(t('copyError'))
      setCopying(false)
      return
    }

    setBudgets((current) => ({ ...previousBudgets, ...current }))
    setNotice(t('copiedPrevious', { count: rows.length }))
    setCopying(false)
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="mt-1 text-xs text-gray-500">{t('periodStart', { date: periodStart })}</p>
        </div>
        <DashboardMonthNav
          monthLabel={monthLabel}
          currentMonth={currentMonth}
          isCurrentMonth={isCurrentMonth}
          basePath="/budgets"
        />
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-600">{t('editHint')}</p>
        <button
          type="button"
          onClick={copyPreviousPeriod}
          disabled={copying || copyableEntries.length === 0}
          className="flex items-center gap-2 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Copy className="h-4 w-4" />
          {copying ? t('copying') : t('copyPrevious')}
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{notice}</div>}

      {withBudget.length > 0 && (
        <div className="card mb-5 p-5">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{t('totalBudget')}</p>
              <p className="text-2xl font-bold text-gray-900">{fmt(totalSpent)}</p>
              <p className="text-sm text-gray-400">{t('of')} {fmt(totalBudget)}</p>
            </div>
            {overBudget.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-right">
                <p className="text-xs font-semibold text-red-600">{t('overLimitCount', { count: overBudget.length })}</p>
                <p className="text-xs text-red-400">{overBudget.map((category) => category.name).join(', ')}</p>
              </div>
            )}
          </div>
          <ProgressBar pct={(totalSpent / totalBudget) * 100} color="#4f46e5" />
          <p className="mt-1.5 text-right text-xs text-gray-400">
            {t('remainingAmount', { amount: fmt(Math.max(0, totalBudget - totalSpent)) })}
          </p>
        </div>
      )}

      {withBudget.length === 0 && (
        <div className="card mb-5 p-6 text-center text-sm text-gray-400">
          <p className="mb-1 font-medium text-gray-600">{t('noBudgets')}</p>
          <p>{t('noBudgetsHint')}</p>
        </div>
      )}

      <div className="card divide-y divide-gray-100">
        {categories.map((category) => {
          const limit = budgets[category.id]
          const spent = spending[category.id] ?? 0
          const pct = limit == null ? 0 : (spent / limit) * 100
          const remaining = limit == null ? 0 : limit - spent
          const statusColor = pct >= 100 ? 'text-red-600' : pct >= 80 ? 'text-amber-600' : 'text-green-600'
          const bgColor = pct >= 100 ? 'bg-red-50' : pct >= 80 ? 'bg-amber-50' : 'bg-green-50'
          const isEditing = editingId === category.id

          return (
            <div key={category.id} className="px-4 py-4 sm:px-5">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-base"
                  style={{ backgroundColor: `${category.color}22`, border: `2px solid ${category.color}44` }}
                >
                  {category.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-900">{category.name}</div>
                  <div className="text-xs text-gray-400">
                    {limit == null ? t('spentWithoutLimit', { amount: fmt(spent) }) : `${fmt(spent)} / ${fmt(limit)}`}
                  </div>
                </div>

                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <div className="relative">
                      <input
                        type="text"
                        value={editAmount}
                        onChange={(event) => setEditAmount(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void saveBudget(category.id)
                          if (event.key === 'Escape') setEditingId(null)
                        }}
                        className="input-base w-24 py-1.5 pr-6 text-sm"
                        placeholder="0,00"
                        inputMode="decimal"
                        autoFocus
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
                    </div>
                    <button type="button" onClick={() => void saveBudget(category.id)} disabled={saving} className="rounded p-1.5 text-green-600 hover:bg-green-50 disabled:opacity-40">
                      <Check className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(category.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-500 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600"
                  >
                    {limit == null ? t('setLimit') : fmt(limit)}
                    <Pencil className="h-3 w-3" />
                  </button>
                )}

                {limit != null && !isEditing && (
                  <div className={`hidden rounded-lg px-2.5 py-1 text-right sm:block ${bgColor}`}>
                    <div className={`text-sm font-bold ${statusColor}`}>{Math.round(pct)}%</div>
                    <div className={`text-[10px] font-medium ${statusColor}`}>
                      {remaining >= 0
                        ? t('left', { amount: fmt(remaining) })
                        : t('over', { amount: fmt(Math.abs(remaining)) })}
                    </div>
                  </div>
                )}
              </div>
              {limit != null && <div className="mt-3"><ProgressBar pct={pct} color={category.color} /></div>}
            </div>
          )
        })}
      </div>
      {editingId && <p className="mt-2 text-xs text-gray-400">{t('clearToRemove')}</p>}
    </div>
  )
}
