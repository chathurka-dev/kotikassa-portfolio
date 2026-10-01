'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Trash2, Plus, ArrowUpRight, ArrowDownLeft, HandCoins, Wallet, CornerUpLeft, CornerDownRight, Lock } from 'lucide-react'
import { createClient, formatDate } from '@kotikassa/shared'
import type { Person, Transaction } from './PeoplePageClient'
import { useFormatCurrency } from '@/lib/currency-context'

export interface Category {
  id: string
  name: string
  icon: string
}

// Balance: positive = they owe you net; negative = you owe them net
// sent/-1        gave them money (support/gift)  -> creates expense
// received/+1    got money from them (gift)       -> creates income
// lent/+1        gave them a loan                 -> creates expense
// borrowed/-1    got a loan from them             -> no auto-record (liability)
// repaid_them/+1 you repaid a loan               -> creates expense
// they_repaid/-1 they repaid a loan              -> creates income
const TYPE_META = {
  sent:        { label: 'sent',       icon: ArrowUpRight,    color: 'text-red-500',    bg: 'bg-red-50',    sign: -1, creates: 'expense' },
  lent:        { label: 'lent',       icon: HandCoins,       color: 'text-amber-600',  bg: 'bg-amber-50',  sign: +1, creates: 'expense' },
  repaid_them: { label: 'repaidThem', icon: CornerUpLeft,    color: 'text-indigo-600', bg: 'bg-indigo-50', sign: +1, creates: 'expense' },
  received:    { label: 'received',   icon: ArrowDownLeft,   color: 'text-green-600',  bg: 'bg-green-50',  sign: +1, creates: 'income' },
  they_repaid: { label: 'theyRepaid', icon: CornerDownRight, color: 'text-teal-600',   bg: 'bg-teal-50',   sign: -1, creates: 'income' },
  borrowed:    { label: 'borrowed',   icon: Wallet,          color: 'text-purple-600', bg: 'bg-purple-50', sign: -1, creates: null },
} as const

type TxnType = keyof typeof TYPE_META

function calcBalance(txns: Transaction[]): number {
  return txns.reduce((sum, t) => sum + TYPE_META[t.type].sign * t.amount, 0)
}

interface Props {
  person: Person
  transactions: Transaction[]
  categories: Category[]
  familyId: string
  userId: string
  onTransactionAdded: (t: Transaction) => void
  onTransactionDeleted: (id: string) => void
  onPersonDeleted: (id: string) => void
}

export default function PersonPanel({ person, transactions, categories, familyId, userId,
  onTransactionAdded, onTransactionDeleted, onPersonDeleted,
}: Props) {
  const fmt = useFormatCurrency()
  const t = useTranslations('people')
  const tc = useTranslations('common')
  const supabase = createClient()

  const [showForm, setShowForm] = useState(false)
  const [txnType, setTxnType] = useState<TxnType>('sent')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const balance = calcBalance(transactions)
  const totalSent     = transactions.filter(tx => tx.type === 'sent').reduce((s, tx) => s + tx.amount, 0)
  const totalReceived = transactions.filter(tx => tx.type === 'received').reduce((s, tx) => s + tx.amount, 0)
  const totalLent     = transactions.filter(tx => tx.type === 'lent').reduce((s, tx) => s + tx.amount, 0)

  const meta = TYPE_META[txnType]
  const needsCategory = meta.creates === 'expense'

  function resetForm() {
    setAmount(''); setNote(''); setCategoryId('')
    setDate(new Date().toISOString().slice(0, 10)); setError(null)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseFloat(amount.replace(',', '.'))
    if (isNaN(parsed) || parsed <= 0) { setError(t('invalidAmount')); return }
    if (needsCategory && !categoryId) { setError(t('categoryRequired')); return }
    setSaving(true)

    // 1. Insert people_transaction
    const { data: txn, error: txnErr } = await supabase
      .from('people_transactions')
      .insert({ person_id: person.id, family_id: familyId, added_by: userId,
                type: txnType, amount: parsed, note: note.trim() || null, transaction_date: date })
      .select('id, person_id, type, amount, note, transaction_date')
      .single()
    if (txnErr || !txn) { setError(txnErr?.message ?? t('saveError')); setSaving(false); return }

    // 2. Auto-create linked expense or income
    if (meta.creates === 'expense') {
      const expenseName = note.trim() || `${t(meta.label)} - ${person.name}`
      await supabase.from('expense_items').insert({
        family_id: familyId, added_by: userId,
        name: expenseName,
        amount: parsed,
        category_id: categoryId || null,
        expense_date: date,
        people_transaction_id: txn.id,
      })
    } else if (meta.creates === 'income') {
      const incomeDesc = note.trim() || `${person.name} - ${t(meta.label)}`
      await supabase.from('income_entries').insert({
        family_id: familyId, added_by: userId,
        source: person.name,
        description: incomeDesc,
        amount: parsed,
        income_date: date,
        is_recurring: false,
        recurrence_interval: null,
        people_transaction_id: txn.id,
      })
    }

    onTransactionAdded(txn as Transaction)
    resetForm(); setShowForm(false); setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm(t('deleteTransactionConfirm'))) return
    // CASCADE on people_transaction_id automatically removes linked expense/income
    await supabase.from('people_transactions').delete().eq('id', id)
    onTransactionDeleted(id)
  }

  async function handleDeletePerson() {
    if (!confirm(t('deletePersonConfirm', { name: person.name }))) return
    // CASCADE: person -> transactions -> linked expenses/income
    await supabase.from('people').delete().eq('id', person.id)
    onPersonDeleted(person.id)
  }

  return (
    <div className="flex flex-col h-full card">
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{person.name}</h2>
          {person.notes && <p className="text-sm text-gray-500 mt-0.5">{person.notes}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 transition">
            <Plus className="h-4 w-4" />{t('addTransaction')}
          </button>
          <button onClick={handleDeletePerson}
            className="rounded-lg border border-red-200 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 transition">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Balance summary */}
      <div className="grid grid-cols-2 gap-3 p-5 border-b border-gray-100 sm:grid-cols-4">
        <div className="rounded-lg bg-red-50 px-3 py-2">
          <p className="text-xs text-red-500 font-medium">{t('totalSent')}</p>
          <p className="text-base font-bold text-red-700 mt-0.5">{fmt(totalSent)}</p>
        </div>
        <div className="rounded-lg bg-green-50 px-3 py-2">
          <p className="text-xs text-green-600 font-medium">{t('totalReceived')}</p>
          <p className="text-base font-bold text-green-700 mt-0.5">{fmt(totalReceived)}</p>
        </div>
        <div className="rounded-lg bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-600 font-medium">{t('totalLent')}</p>
          <p className="text-base font-bold text-amber-700 mt-0.5">{fmt(totalLent)}</p>
        </div>
        <div className={`rounded-lg px-3 py-2 ${balance > 0 ? 'bg-green-50' : balance < 0 ? 'bg-orange-50' : 'bg-gray-50'}`}>
          <p className={`text-xs font-medium ${balance > 0 ? 'text-green-600' : balance < 0 ? 'text-orange-600' : 'text-gray-500'}`}>
            {t('netBalance')}
          </p>
          <p className={`text-base font-bold mt-0.5 ${balance > 0 ? 'text-green-700' : balance < 0 ? 'text-orange-700' : 'text-gray-500'}`}>
            {balance > 0 ? `+${fmt(balance)}` : fmt(balance)}
          </p>
        </div>
      </div>

      {/* Add transaction form */}
      {showForm && (
        <div className="p-5 border-b border-indigo-100 bg-indigo-50">
          <p className="text-sm font-semibold text-indigo-700 mb-3">{t('newTransaction')}</p>
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <form onSubmit={handleAdd} className="space-y-3">
            {/* Type pills */}
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TYPE_META) as TxnType[]).map(type => {
                const m = TYPE_META[type]
                const Icon = m.icon
                return (
                  <button key={type} type="button" onClick={() => setTxnType(type)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border transition
                      ${txnType === type ? `${m.bg} ${m.color} border-current` : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                    <Icon className="h-3.5 w-3.5" />{t(m.label)}
                  </button>
                )
              })}
            </div>

            {/* Category picker - only for expense-creating types */}
            {needsCategory && (
              <div>
                <label htmlFor="person-transaction-category" className="block text-xs font-medium text-gray-700 mb-1">
                  {tc('category')}
                </label>
                <select
                  id="person-transaction-category"
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  className="input-base"
                  required
                >
                  <option value="">{t('selectCategory')}</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {meta.creates === 'income' && (
              <p className="text-xs text-teal-700 bg-teal-50 rounded-lg px-3 py-2">
                {t('willCreateIncome', { name: person.name })}
              </p>
            )}
            {meta.creates === null && (
              <p className="text-xs text-purple-700 bg-purple-50 rounded-lg px-3 py-2">
                {t('borrowedNote')}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="person-transaction-amount" className="block text-xs font-medium text-gray-700 mb-1">
                  {t('amount')}
                </label>
                <input id="person-transaction-amount" type="text" inputMode="decimal" required value={amount}
                  onChange={e => setAmount(e.target.value)} placeholder="0,00" className="input-base" />
              </div>
              <div>
                <label htmlFor="person-transaction-date" className="block text-xs font-medium text-gray-700 mb-1">
                  {t('date')}
                </label>
                <input id="person-transaction-date" type="date" required value={date} onChange={e => setDate(e.target.value)} className="input-base" />
              </div>
            </div>
            <div>
              <label htmlFor="person-transaction-note" className="block text-xs font-medium text-gray-700 mb-1">
                {t('note')}
              </label>
              <input id="person-transaction-note" type="text" value={note} onChange={e => setNote(e.target.value)}
                placeholder={t('notePlaceholder')} className="input-base" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowForm(false); resetForm() }}
                className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                {tc('cancel')}
              </button>
              <button type="submit" disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition">
                {saving ? tc('saving') : tc('save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Transaction history */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {transactions.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">{t('noTransactions')}</div>
        ) : transactions.map(tx => {
          const m = TYPE_META[tx.type]
          const Icon = m.icon
          return (
            <div key={tx.id} className="flex items-center gap-3 px-5 py-3 group hover:bg-gray-50">
              <div className={`flex-shrink-0 rounded-full p-1.5 ${m.bg}`}>
                <Icon className={`h-4 w-4 ${m.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${m.color}`}>{t(m.label)}</span>
                  {m.creates && (
                    <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                      <Lock className="h-2.5 w-2.5" />
                      {m.creates === 'expense' ? t('linkedExpense') : t('linkedIncome')}
                    </span>
                  )}
                  {tx.note && <span className="text-sm text-gray-700 truncate">{tx.note}</span>}
                </div>
                <span className="text-xs text-gray-400">{formatDate(tx.transaction_date)}</span>
              </div>
              <span className={`text-sm font-bold flex-shrink-0 ${m.sign > 0 ? 'text-green-600' : 'text-red-500'}`}>
                {m.sign > 0 ? '+' : '-'}{fmt(tx.amount)}
              </span>
              <button onClick={() => handleDelete(tx.id)}
                className="opacity-0 group-hover:opacity-100 rounded p-1 text-gray-300 hover:text-red-500 transition"
                title={m.creates ? t('deleteTransactionWithLinked') : t('deleteTransactionConfirm')}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
