'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Pause, Play, X } from 'lucide-react'
import { createClient, type RecurringExpense } from '@kotikassa/shared'
import { revalidateAfterRecurringChange } from '@/app/actions/revalidate'
import { useFormatCurrency } from '@/lib/currency-context'

interface Category { id: string; name: string; icon: string; color: string }

interface Props {
  initialRecurring: RecurringExpense[]
  categories: Category[]
  familyId: string
  userId: string
}

const EMPTY_FORM = {
  name: '',
  amount: '',
  category_id: '',
  day_of_month: '1',
  notes: '',
}

export default function RecurringClient({ initialRecurring, categories, familyId, userId }: Props) {
  const fmt = useFormatCurrency()
  const t = useTranslations('recurring')
  const tc = useTranslations('common')

  const supabase = createClient()
  const router = useRouter()
  const [items, setItems] = useState<RecurringExpense[]>(initialRecurring)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setError(null)
    setShowAdd(true)
  }

  function openEdit(item: RecurringExpense) {
    setForm({
      name: item.name,
      amount: String(item.amount).replace('.', ','),
      category_id: item.category_id ?? '',
      day_of_month: String(item.day_of_month ?? 1),
      notes: item.notes ?? '',
    })
    setEditingId(item.id)
    setError(null)
    setShowAdd(true)
  }

  function closeForm() {
    setShowAdd(false)
    setEditingId(null)
    setError(null)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const parsedAmount = parseFloat(form.amount.replace(',', '.'))
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      setError(t('saveError'))
      return
    }
    const day = Math.max(1, Math.min(28, parseInt(form.day_of_month) || 1))
    setSaving(true)

    const payload = {
      family_id: familyId,
      created_by: userId,
      name: form.name.trim(),
      amount: parsedAmount,
      category_id: form.category_id || null,
      day_of_month: day,
      notes: form.notes.trim() || null,
      recurrence_type: 'monthly' as const,
    }

    if (editingId) {
      const { data, error: err } = await supabase
        .from('recurring_expenses')
        .update(payload)
        .eq('id', editingId)
        .select()
        .single()
      if (err || !data) { setError(t('saveError')); setSaving(false); return }
      setItems(prev => prev.map(i => i.id === editingId ? (data as RecurringExpense) : i))
    } else {
      const { data, error: err } = await supabase
        .from('recurring_expenses')
        .insert({ ...payload, active: true })
        .select()
        .single()
      if (err || !data) { setError(t('saveError')); setSaving(false); return }
      setItems(prev => [data as RecurringExpense, ...prev])
    }

    setSaving(false)
    closeForm()
    await revalidateAfterRecurringChange()
    router.refresh()
  }

  async function handleToggleActive(item: RecurringExpense) {
    const { data } = await supabase
      .from('recurring_expenses')
      .update({ active: !item.active })
      .eq('id', item.id)
      .select()
      .single()
    if (data) {
      setItems(prev => prev.map(i => i.id === item.id ? (data as RecurringExpense) : i))
      await revalidateAfterRecurringChange()
      router.refresh()
    }
  }

  async function handleDelete(item: RecurringExpense) {
    if (!confirm(t('deleteTemplateConfirm'))) return
    const { error: err } = await supabase
      .from('recurring_expenses')
      .delete()
      .eq('id', item.id)
    if (err) { alert(t('deleteError')); return }
    setItems(prev => prev.filter(i => i.id !== item.id))
    await revalidateAfterRecurringChange()
    router.refresh()
  }

  const active = items.filter(i => i.active)
  const paused = items.filter(i => !i.active)
  const activeTotal = active.reduce((s, i) => s + i.amount, 0)

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {active.length > 0
              ? <><span className="font-medium text-gray-700">{fmt(activeTotal)}</span> / month · {active.length} active</>
              : t('noItems')}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm
                     font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
        >
          <Plus className="h-4 w-4" />
          {t('addNew')}
        </button>
      </div>

      {/* Add / Edit form */}
      {showAdd && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">
              {editingId ? t('editTemplate') : t('newTemplate')}
            </h3>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 transition">
              <X className="h-4 w-4" />
            </button>
          </div>

          {error && (
            <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Name */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('name')}</label>
              <input
                type="text"
                required
                autoFocus
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t('namePlaceholder')}
                className="input-base"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('amount')}</label>
              <input
                type="text"
                required
                inputMode="decimal"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0,00"
                className="input-base"
              />
            </div>

            {/* Day of month */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('dayOfMonth')}</label>
              <input
                type="number"
                min={1}
                max={28}
                required
                value={form.day_of_month}
                onChange={e => setForm(f => ({ ...f, day_of_month: e.target.value }))}
                className="input-base"
              />
              <p className="mt-1 text-xs text-gray-400">
                {t('dayOfMonthHint', { day: form.day_of_month || 1 })}
              </p>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{tc('category')}</label>
              <select
                value={form.category_id}
                onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                className="input-base"
              >
                <option value="">— Uncategorized —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('notes')}</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder={t('notesPlaceholder')}
                className="input-base"
              />
            </div>

            <div className="sm:col-span-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={closeForm}
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
                {saving ? t('saving') : tc('save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && !showAdd && (
        <div className="card p-12 text-center">
          <div className="text-3xl mb-3">🔁</div>
          <p className="text-sm text-gray-500 mb-3">{t('noItems')}</p>
          <button
            onClick={openAdd}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            {t('addFirst')}
          </button>
        </div>
      )}

      {/* Active templates */}
      {active.length > 0 && (
        <div className="card divide-y divide-gray-100 mb-4">
          {active.map(item => (
            <RecurringRow
              key={item.id}
              item={item}
              categories={categories}
              t={t}
              onEdit={() => openEdit(item)}
              onToggle={() => handleToggleActive(item)}
              onDelete={() => handleDelete(item)}
            />
          ))}
        </div>
      )}

      {/* Paused templates */}
      {paused.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2 px-1">
            {t('paused')}
          </h2>
          <div className="card divide-y divide-gray-100 opacity-60">
            {paused.map(item => (
              <RecurringRow
                key={item.id}
                item={item}
                categories={categories}
                t={t}
                onEdit={() => openEdit(item)}
                onToggle={() => handleToggleActive(item)}
                onDelete={() => handleDelete(item)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RecurringRow({
  item, categories, t, onEdit, onToggle, onDelete,
}: {
  item: RecurringExpense
  categories: Category[]
  t: ReturnType<typeof useTranslations>
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const fmt = useFormatCurrency()
  const cat = categories.find(c => c.id === item.category_id)

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <span className="text-xl flex-shrink-0">{cat?.icon ?? '🔁'}</span>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
        <div className="text-xs text-gray-400">
          {cat?.name ?? 'Uncategorized'}
          {' · '}
          {t('dayLabel', { day: item.day_of_month ?? 1 })}
          {item.notes && <span> · {item.notes}</span>}
        </div>
      </div>

      <div className="flex-shrink-0 text-right mr-2">
        <div className="text-sm font-semibold text-gray-900">{fmt(item.amount)}</div>
        <div className="text-xs text-gray-400">{t('perMonth')}</div>
      </div>

      <button
        onClick={onEdit}
        title={t('editTemplate')}
        className="text-gray-300 hover:text-indigo-500 transition p-1"
      >
        <Pencil className="h-4 w-4" />
      </button>

      <button
        onClick={onToggle}
        title={item.active ? t('pause') : t('resume')}
        className="text-gray-300 hover:text-amber-500 transition p-1"
      >
        {item.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>

      <button
        onClick={onDelete}
        title={t('deleteTemplate')}
        className="text-gray-300 hover:text-red-500 transition p-1"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
