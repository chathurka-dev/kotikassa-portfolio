'use client'

import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createClient, today } from '@kotikassa/shared'
import { useFormatCurrency } from '@/lib/currency-context'

interface Contribution {
  id: string
  amount: number
  note: string | null
  contributed_at: string
}

interface Investment {
  id: string
  name: string
  description: string | null
  current_value: number | null
  current_value_date: string | null
  total_invested: number
  contributions: Contribution[]
}

interface Props {
  initialInvestments: Investment[]
  familyId: string
  userId: string
}

export default function InvestmentsClient({ initialInvestments, familyId, userId }: Props) {
  const fmt = useFormatCurrency()
  const t = useTranslations('investments')
  const tc = useTranslations('common')
  const supabase = createClient()

  const [investments, setInvestments] = useState<Investment[]>(initialInvestments)
  const [showAdd, setShowAdd] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [contributingId, setContributingId] = useState<string | null>(null)
  const [updatingValueId, setUpdatingValueId] = useState<string | null>(null)

  // New investment form
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Contribution form
  const [contribAmount, setContribAmount] = useState('')
  const [contribNote, setContribNote] = useState('')
  const [contribDate, setContribDate] = useState(today())
  const [contribSaving, setContribSaving] = useState(false)
  const [contribError, setContribError] = useState<string | null>(null)

  // Update value form
  const [newValue, setNewValue] = useState('')
  const [newValueDate, setNewValueDate] = useState(today())
  const [valueSaving, setValueSaving] = useState(false)
  const [valueError, setValueError] = useState<string | null>(null)

  async function handleAddInvestment(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const { data, error: err } = await supabase
      .from('investments')
      .insert({
        family_id: familyId,
        name: name.trim(),
        description: description.trim() || null,
      })
      .select('id, name, description, current_value, current_value_date')
      .single()
    if (err || !data) { setError(t('saveError')); setSaving(false); return }
    const inv = data as Omit<Investment, 'total_invested' | 'contributions'>
    setInvestments([{ ...inv, total_invested: 0, contributions: [] }, ...investments])
    setName(''); setDescription('')
    setShowAdd(false)
    setSaving(false)
  }

  async function handleDeleteInvestment(id: string) {
    if (!confirm(t('deleteConfirm'))) return
    await supabase.from('investments').delete().eq('id', id)
    setInvestments(investments.filter((i) => i.id !== id))
  }

  async function handleAddContribution(investmentId: string) {
    setContribError(null)
    setContribSaving(true)
    const parsedAmount = parseFloat(contribAmount.replace(',', '.'))
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setContribError('Enter a valid amount.')
      setContribSaving(false)
      return
    }
    const { data, error: err } = await supabase
      .from('investment_contributions')
      .insert({
        investment_id: investmentId,
        family_id: familyId,
        added_by: userId,
        amount: parsedAmount,
        note: contribNote.trim() || null,
        contributed_at: contribDate,
      })
      .select('id, amount, note, contributed_at')
      .single()
    if (err || !data) { setContribError(t('saveContributionError')); setContribSaving(false); return }

    setInvestments(investments.map((inv) => inv.id === investmentId
      ? {
          ...inv,
          total_invested: inv.total_invested + parsedAmount,
          contributions: [data as Contribution, ...inv.contributions],
        }
      : inv
    ))
    setContribAmount(''); setContribNote(''); setContribDate(today())
    setContributingId(null)
    setContribSaving(false)
  }

  async function handleDeleteContribution(investmentId: string, contribId: string, amount: number) {
    if (!confirm(t('deleteContributionConfirm'))) return
    await supabase.from('investment_contributions').delete().eq('id', contribId)
    setInvestments(investments.map((inv) => inv.id === investmentId
      ? {
          ...inv,
          total_invested: Math.max(0, inv.total_invested - amount),
          contributions: inv.contributions.filter((c) => c.id !== contribId),
        }
      : inv
    ))
  }

  async function handleUpdateValue(investmentId: string) {
    setValueError(null)
    setValueSaving(true)
    const parsed = parseFloat(newValue.replace(',', '.'))
    if (isNaN(parsed) || parsed < 0) {
      setValueError('Enter a valid amount.')
      setValueSaving(false)
      return
    }
    const { error: err } = await supabase
      .from('investments')
      .update({ current_value: parsed, current_value_date: newValueDate })
      .eq('id', investmentId)
    if (err) { setValueError(t('saveError')); setValueSaving(false); return }
    setInvestments(investments.map((inv) => inv.id === investmentId
      ? { ...inv, current_value: parsed, current_value_date: newValueDate }
      : inv
    ))
    setNewValue(''); setNewValueDate(today())
    setUpdatingValueId(null)
    setValueSaving(false)
  }

  const totalInvested = investments.reduce((s, i) => s + i.total_invested, 0)
  const totalCurrentValue = investments.reduce((s, i) => s + (i.current_value ?? i.total_invested), 0)
  const totalGain = totalCurrentValue - totalInvested

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <div className="flex gap-4 mt-1 text-sm text-gray-500">
            <span>{t('totalInvested')}: <strong className="text-gray-900">{fmt(totalInvested)}</strong></span>
            <span>{t('currentValueLabel')}: <strong className="text-gray-900">{fmt(totalCurrentValue)}</strong></span>
            <span className={totalGain >= 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
              {totalGain >= 0 ? '+' : ''}{fmt(totalGain)}
            </span>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold
                     text-white shadow-sm hover:bg-indigo-700 transition"
        >
          <Plus className="h-4 w-4" />
          {t('addInvestment')}
        </button>
      </div>

      {/* Add investment form */}
      {showAdd && (
        <div className="card p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('newInvestment')}</h3>
          {error && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">{error}</div>}
          <form onSubmit={handleAddInvestment} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('investmentName')}</label>
              <input required value={name} onChange={(e) => setName(e.target.value)}
                className="input-base" placeholder={t('investmentNamePlaceholder')} autoFocus />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('description')}</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)}
                className="input-base" placeholder="Optional notes" />
            </div>
            <div className="col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowAdd(false); setError(null) }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition">
                {tc('cancel')}
              </button>
              <button type="submit" disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white
                           hover:bg-indigo-700 disabled:opacity-50 transition">
                {saving ? tc('saving') : tc('save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Investments list */}
      {investments.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-3xl mb-3">📈</div>
          <p className="text-sm text-gray-500">{t('noInvestments')}</p>
          <button onClick={() => setShowAdd(true)}
            className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
            {t('addFirst')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {investments.map((inv) => {
            const effectiveValue = inv.current_value ?? inv.total_invested
            const gain = effectiveValue - inv.total_invested
            const gainPct = inv.total_invested > 0
              ? ((gain / inv.total_invested) * 100).toFixed(1)
              : '0.0'
            const isExpanded = expandedId === inv.id
            const isContributing = contributingId === inv.id
            const isUpdatingValue = updatingValueId === inv.id

            return (
              <div key={inv.id} className="card p-5">
                {/* Investment header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900">{inv.name}</h3>
                    {inv.description && (
                      <p className="text-xs text-gray-400 mt-0.5">{inv.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => { setContributingId(isContributing ? null : inv.id); setContribError(null) }}
                      className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs font-medium
                                 text-indigo-700 hover:bg-indigo-100 transition"
                    >
                      + {t('addContribution')}
                    </button>
                    <button
                      onClick={() => { setUpdatingValueId(isUpdatingValue ? null : inv.id); setValueError(null) }}
                      className="rounded-lg bg-gray-50 border border-gray-200 px-2 py-1.5 text-gray-500
                                 hover:bg-gray-100 transition"
                      title={t('updateValue')}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 transition">
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <button onClick={() => handleDeleteInvestment(inv.id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 transition">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Value summary */}
                <div className="grid grid-cols-3 gap-3 text-center bg-gray-50 rounded-xl p-3 mb-3">
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">{t('totalInvested')}</div>
                    <div className="text-sm font-semibold text-gray-900">{fmt(inv.total_invested)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">{t('currentValueLabel')}</div>
                    <div className="text-sm font-semibold text-gray-900">{fmt(effectiveValue)}</div>
                    {inv.current_value_date && (
                      <div className="text-xs text-gray-400">{inv.current_value_date}</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">{gain >= 0 ? t('gain') : t('loss')}</div>
                    <div className={`text-sm font-semibold ${gain >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {gain >= 0 ? '+' : ''}{fmt(gain)}
                      <span className="text-xs ml-1">({gainPct}%)</span>
                    </div>
                  </div>
                </div>

                {/* Update value form */}
                {isUpdatingValue && (
                  <div className="mb-3 rounded-xl bg-blue-50 border border-blue-200 p-4">
                    <p className="text-xs font-semibold text-blue-700 mb-2">{t('updateValue')}</p>
                    {valueError && <p className="text-xs text-red-600 mb-2">{valueError}</p>}
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('currentValue')}</label>
                        <input value={newValue} onChange={(e) => setNewValue(e.target.value)}
                          className="input-base py-1.5 text-sm" placeholder="0,00" inputMode="decimal" autoFocus />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('currentValueDate')}</label>
                        <input type="date" value={newValueDate} onChange={(e) => setNewValueDate(e.target.value)}
                          className="input-base py-1.5 text-sm" />
                      </div>
                      <button onClick={() => setUpdatingValueId(null)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 transition">
                        {tc('cancel')}
                      </button>
                      <button onClick={() => handleUpdateValue(inv.id)} disabled={valueSaving}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition">
                        {valueSaving ? tc('saving') : tc('save')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Contribution form */}
                {isContributing && (
                  <div className="mb-3 rounded-xl bg-gray-50 border border-gray-200 p-4">
                    {contribError && <p className="text-xs text-red-600 mb-2">{contribError}</p>}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('contributionAmount')}</label>
                        <input value={contribAmount} onChange={(e) => setContribAmount(e.target.value)}
                          className="input-base py-1.5 text-sm" placeholder="0,00" inputMode="decimal" autoFocus />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('contributionDate')}</label>
                        <input type="date" value={contribDate} onChange={(e) => setContribDate(e.target.value)}
                          className="input-base py-1.5 text-sm" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('contributionNote')}</label>
                        <input value={contribNote} onChange={(e) => setContribNote(e.target.value)}
                          className="input-base py-1.5 text-sm" placeholder="Optional note" />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end mt-3">
                      <button onClick={() => setContributingId(null)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 transition">
                        {tc('cancel')}
                      </button>
                      <button onClick={() => handleAddContribution(inv.id)} disabled={contribSaving}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition">
                        {contribSaving ? tc('saving') : tc('save')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Contributions history */}
                {isExpanded && (
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{t('contributions')}</p>
                    {inv.contributions.length === 0 ? (
                      <p className="text-xs text-gray-400">{t('noContributions')}</p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {inv.contributions.map((c) => (
                          <div key={c.id} className="flex items-center justify-between py-2 text-sm">
                            <div>
                              <span className="text-gray-700">{c.contributed_at}</span>
                              {c.note && <span className="ml-2 text-xs text-gray-400">{c.note}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-indigo-600">+{fmt(c.amount)}</span>
                              <button onClick={() => handleDeleteContribution(inv.id, c.id, c.amount)}
                                className="text-gray-300 hover:text-red-500 transition">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
