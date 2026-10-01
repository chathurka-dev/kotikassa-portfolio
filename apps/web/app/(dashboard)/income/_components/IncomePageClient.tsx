'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, X, Check, Pencil, Lock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createClient, formatDate } from '@kotikassa/shared'
import { useFormatCurrency } from '@/lib/currency-context'
import DashboardMonthNav from '../../_components/DashboardMonthNav'
import * as Sentry from '@sentry/nextjs'

interface IncomeEntry {
  id: string
  source: string
  description: string
  amount: number
  income_date: string
  is_recurring: boolean
  recurrence_interval: string | null
  people_transaction_id: string | null
}

interface CustomSource {
  id: string
  name: string
}

interface Props {
  initialEntries: IncomeEntry[]
  initialCustomSources: CustomSource[]
  familyId: string
  userId: string
  monthLabel: string
  currentMonth: string    // YYYY-MM
  isCurrentMonth: boolean
}

const PRESET_SOURCES = ['salary', 'freelance', 'benefit', 'rental'] as const
const SOURCE_ICONS: Record<string, string> = {
  salary:    '💼',
  freelance: '💻',
  benefit:   '🏛️',
  rental:    '🏠',
}

function sourceLabel(source: string, t: (k: string) => string): string {
  if (source in SOURCE_ICONS) return `${SOURCE_ICONS[source]} ${t(`sources.${source}`)}`
  return source
}

// ── Pill-based source picker ─────────────────────────────────────────────────
function SourcePicker({
  value, onChange, customSources, onAddSource, onRenameSource, onDeleteSource, t,
}: {
  value: string
  onChange: (v: string) => void
  customSources: CustomSource[]
  onAddSource: (name: string) => Promise<boolean>
  onRenameSource: (id: string, name: string) => Promise<boolean>
  onDeleteSource: (id: string, name: string) => void
  t: (k: string) => string
}) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (adding) addInputRef.current?.focus() }, [adding])
  useEffect(() => { if (renamingId) renameInputRef.current?.focus() }, [renamingId])

  async function commitAdd() {
    const name = newName.trim()
    if (!name || !(await onAddSource(name))) return
    onChange(name)
    setAdding(false); setNewName('')
  }

  async function commitRename() {
    const name = renameValue.trim()
    if (name && renamingId) {
      const old = customSources.find(s => s.id === renamingId)?.name
      if (!(await onRenameSource(renamingId, name))) return
      if (value === old) onChange(name)
    }
    setRenamingId(null); setRenameValue('')
  }

  const pillBase = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition cursor-pointer border'
  const activePill = 'bg-indigo-600 text-white border-indigo-600'
  const inactivePill = 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'

  return (
    <div className="flex flex-wrap gap-2">
      {/* Preset sources */}
      {PRESET_SOURCES.map((val) => (
        <button key={val} type="button" onClick={() => onChange(val)}
          className={`${pillBase} ${value === val ? activePill : inactivePill}`}>
          {SOURCE_ICONS[val]} {t(`sources.${val}`)}
        </button>
      ))}

      {/* Custom sources */}
      {customSources.map((s) => (
        renamingId === s.id ? (
          <span key={s.id} className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-50 px-2 py-1">
            <input ref={renameInputRef} value={renameValue} maxLength={120} onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitRename() } if (e.key === 'Escape') { setRenamingId(null) } }}
              className="w-20 bg-transparent text-sm text-indigo-700 outline-none" />
            <button type="button" onClick={commitRename} className="text-indigo-500 hover:text-indigo-700"><Check className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => setRenamingId(null)} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
          </span>
        ) : (
          <span key={s.id} className={`${pillBase} ${value === s.name ? activePill : inactivePill} group/pill`}>
            <span onClick={() => onChange(s.name)}>{s.name}</span>
            <span className="flex items-center gap-0.5 ml-0.5">
              <button type="button" onClick={() => { setRenamingId(s.id); setRenameValue(s.name) }}
                className={`rounded p-0.5 transition ${value === s.name ? 'text-indigo-200 hover:text-white hover:bg-indigo-500' : 'text-gray-300 hover:text-indigo-500'}`}
                title={t('renameSource')}>
                <Pencil className="h-3 w-3" />
              </button>
              <button type="button" onClick={() => onDeleteSource(s.id, s.name)}
                className={`rounded p-0.5 transition ${value === s.name ? 'text-indigo-200 hover:text-white hover:bg-indigo-500' : 'text-gray-300 hover:text-red-500'}`}
                title={t('deleteSource')}>
                <X className="h-3 w-3" />
              </button>
            </span>
          </span>
        )
      ))}

      {/* Add new */}
      {adding ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-50 px-2 py-1">
          <input ref={addInputRef} value={newName} maxLength={120} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitAdd() } if (e.key === 'Escape') { setAdding(false); setNewName('') } }}
            placeholder={t('newSourcePlaceholder')} className="w-28 bg-transparent text-sm text-indigo-700 outline-none placeholder-indigo-300" />
          <button type="button" onClick={commitAdd} disabled={!newName.trim()} className="text-indigo-500 hover:text-indigo-700 disabled:opacity-40"><Check className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => { setAdding(false); setNewName('') }} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
        </span>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className={`${pillBase} border-dashed border-gray-300 text-gray-400 hover:border-indigo-400 hover:text-indigo-500`}>
          <Plus className="h-3.5 w-3.5" /> {t('addNewSource')}
        </button>
      )}
    </div>
  )
}

export default function IncomePageClient({ initialEntries, initialCustomSources, familyId, userId, monthLabel, currentMonth, isCurrentMonth }: Props) {
  const fmt = useFormatCurrency()
  const t = useTranslations('income')
  const tc = useTranslations('common')
  const [entries, setEntries] = useState<IncomeEntry[]>(initialEntries)
  const [customSources, setCustomSources] = useState<CustomSource[]>(initialCustomSources)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [source, setSource] = useState('salary')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [incomeDate, setIncomeDate] = useState(new Date().toISOString().slice(0, 10))
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceInterval, setRecurrenceInterval] = useState('monthly')

  const [editSource, setEditSource] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editIsRecurring, setEditIsRecurring] = useState(false)
  const [editInterval, setEditInterval] = useState('monthly')
  const [editSaving, setEditSaving] = useState(false)

  const supabase = createClient()
  const totalIncome = entries.reduce((sum, e) => sum + e.amount, 0)

  function resetForm() {
    setSource('salary'); setDescription(''); setAmount('')
    setIncomeDate(new Date().toISOString().slice(0, 10))
    setIsRecurring(false); setRecurrenceInterval('monthly'); setError(null)
  }

  async function handleAddSource(name: string): Promise<boolean> {
    setError(null)
    const { data, error: sourceError } = await supabase.from('family_income_sources')
      .insert({ family_id: familyId, name }).select('id, name').single()
    if (sourceError || !data) {
      if (sourceError) Sentry.captureException(sourceError)
      setError(t('sourceSaveError'))
      return false
    }
    setCustomSources((prev) => [...prev, data as CustomSource].sort((a, b) => a.name.localeCompare(b.name)))
    return true
  }

  async function handleRenameSource(id: string, newName: string): Promise<boolean> {
    setError(null)
    const { error: sourceError } = await supabase.from('family_income_sources').update({ name: newName }).eq('id', id)
    if (sourceError) {
      Sentry.captureException(sourceError)
      setError(t('sourceSaveError'))
      return false
    }
    setCustomSources((prev) => prev.map((s) => s.id === id ? { ...s, name: newName } : s).sort((a, b) => a.name.localeCompare(b.name)))
    return true
  }

  async function handleDeleteSource(id: string, name: string) {
    setError(null)
    const { error: sourceError } = await supabase.from('family_income_sources').delete().eq('id', id)
    if (sourceError) {
      Sentry.captureException(sourceError)
      setError(t('sourceDeleteError'))
      return
    }
    setCustomSources((prev) => prev.filter((s) => s.id !== id))
    if (source === name) setSource('salary')
    if (editSource === name) setEditSource('salary')
  }

  function startEdit(entry: IncomeEntry) {
    setEditingId(entry.id); setEditSource(entry.source)
    setEditDescription(entry.description ?? ''); setEditAmount(String(entry.amount))
    setEditDate(entry.income_date); setEditIsRecurring(entry.is_recurring)
    setEditInterval(entry.recurrence_interval ?? 'monthly')
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseFloat(editAmount.replace(',', '.'))
    if (isNaN(parsed) || parsed <= 0) return
    setEditSaving(true)
    const { data, error: updateError } = await supabase.from('income_entries').update({
      source: editSource, description: editDescription.trim(), amount: parsed,
      income_date: editDate, is_recurring: editIsRecurring,
      recurrence_interval: editIsRecurring ? editInterval : null,
    }).eq('id', editingId!).select().single()
    if (updateError || !data) {
      if (updateError) Sentry.captureException(updateError)
      setError(t('saveError'))
    } else {
      setEntries((prev) => prev.map((entry) => entry.id === editingId ? data as IncomeEntry : entry))
      setEditingId(null)
    }
    setEditSaving(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setError(null)
    const parsed = parseFloat(amount.replace(',', '.'))
    if (isNaN(parsed) || parsed <= 0) { setError(t('invalidAmount')); return }
    setSaving(true)
    const { data, error: insertError } = await supabase.from('income_entries').insert({
      family_id: familyId, added_by: userId, source,
      description: description.trim(), amount: parsed,
      income_date: incomeDate, is_recurring: isRecurring,
      recurrence_interval: isRecurring ? recurrenceInterval : null,
    }).select().single()
    if (insertError || !data) {
      if (insertError) Sentry.captureException(insertError)
      setError(t('saveError')); setSaving(false); return
    }
    setEntries([data as IncomeEntry, ...entries])
    resetForm(); setShowAdd(false); setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm(t('deleteConfirm'))) return
    await supabase.from('income_entries').delete().eq('id', id)
    setEntries(entries.filter((e) => e.id !== id))
  }

  const recurringSelect = (val: string, setVal: (v: string) => void) => (
    <select value={val} onChange={(e) => setVal(e.target.value)} className="input-base ml-2 py-1 text-sm">
      <option value="monthly">{t('monthly')}</option>
      <option value="weekly">{t('weekly')}</option>
      <option value="yearly">{t('yearly')}</option>
    </select>
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
            <DashboardMonthNav
              monthLabel={monthLabel}
              currentMonth={currentMonth}
              isCurrentMonth={isCurrentMonth}
              basePath="/income"
            />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            <span className="font-semibold text-gray-700">{fmt(totalIncome)} total</span>
          </p>
        </div>
        <button onClick={() => { setShowAdd(true); setError(null) }}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 transition">
          <Plus className="h-4 w-4" />{t('addIncome')}
        </button>
      </div>

      {showAdd && (
        <div className="card p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">{t('newEntry')}</h2>
          {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">{t('source')}</label>
              <SourcePicker value={source} onChange={setSource} customSources={customSources}
                onAddSource={handleAddSource} onRenameSource={handleRenameSource} onDeleteSource={handleDeleteSource} t={t} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('amountLabel')}</label>
                <input type="text" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)}
                  placeholder={t('amountPlaceholder')} className="input-base" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('dateReceived')}</label>
                <input type="date" required value={incomeDate} onChange={(e) => setIncomeDate(e.target.value)} className="input-base" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('description')}</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder={t('descriptionPlaceholder')} className="input-base" />
            </div>
            <div className="flex items-center gap-3">
              <input id="recurring" type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
              <label htmlFor="recurring" className="text-sm text-gray-700">{t('recurring')}</label>
              {isRecurring && recurringSelect(recurrenceInterval, setRecurrenceInterval)}
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => { setShowAdd(false); resetForm() }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">{tc('cancel')}</button>
              <button type="submit" disabled={saving}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition">
                {saving ? t('addIncomeSaving') : t('addIncome')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card divide-y divide-gray-100">
        {entries.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            {t('noIncome')}<br /><span className="text-xs">{t('noIncomeHint')}</span>
          </div>
        ) : entries.map((entry) => (
          <div key={entry.id}>
            {editingId === entry.id && !entry.people_transaction_id ? (
              <form onSubmit={handleUpdate} className="px-5 py-4 bg-indigo-50 space-y-3">
                <p className="text-xs font-semibold text-indigo-700">{t('editEntry')}</p>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">{t('source')}</label>
                  <SourcePicker value={editSource} onChange={setEditSource} customSources={customSources}
                    onAddSource={handleAddSource} onRenameSource={handleRenameSource} onDeleteSource={handleDeleteSource} t={t} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">{t('amountLabel')}</label>
                    <input type="text" inputMode="decimal" required value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">{t('dateReceived')}</label>
                    <input type="date" required value={editDate} onChange={(e) => setEditDate(e.target.value)} className="input-base" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('description')}</label>
                  <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
                    placeholder={t('descriptionPlaceholder')} className="input-base" />
                </div>
                <div className="flex items-center gap-3">
                  <input id={`rec-${entry.id}`} type="checkbox" checked={editIsRecurring} onChange={(e) => setEditIsRecurring(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                  <label htmlFor={`rec-${entry.id}`} className="text-sm text-gray-700">{t('recurring')}</label>
                  {editIsRecurring && recurringSelect(editInterval, setEditInterval)}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditingId(null)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">{tc('cancel')}</button>
                  <button type="submit" disabled={editSaving}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition">
                    {editSaving ? t('saving') : t('saveChanges')}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between px-5 py-3 group">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {entry.description || sourceLabel(entry.source, t)}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">{sourceLabel(entry.source, t)}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-xs text-gray-400">{formatDate(entry.income_date)}</span>
                    {entry.is_recurring && (
                      <><span className="text-gray-300">·</span>
                      <span className="text-xs text-green-600 font-medium">🔄 {entry.recurrence_interval}</span></>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  <span className="text-sm font-semibold text-green-600">{fmt(entry.amount)}</span>
                  {entry.people_transaction_id ? (
                    <span title={t('lockedByPeople')} className="rounded-lg p-1.5 text-gray-300 cursor-default">
                      <Lock className="h-4 w-4" />
                    </span>
                  ) : (
                    <>
                      <button onClick={() => startEdit(entry)}
                        className="opacity-0 group-hover:opacity-100 rounded-lg p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(entry.id)}
                        className="opacity-0 group-hover:opacity-100 rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
