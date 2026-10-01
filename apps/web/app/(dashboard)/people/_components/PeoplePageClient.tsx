'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Users } from 'lucide-react'
import { createClient } from '@kotikassa/shared'
import PersonPanel, { type Category } from './PersonPanel'
import { useFormatCurrency } from '@/lib/currency-context'

export interface Person {
  id: string
  name: string
  notes: string | null
  created_at: string
}

export interface Transaction {
  id: string
  person_id: string
  type: 'sent' | 'received' | 'lent' | 'borrowed' | 'repaid_them' | 'they_repaid'
  amount: number
  note: string | null
  transaction_date: string
}

const TYPE_SIGNS: Record<Transaction['type'], number> = {
  sent: -1, received: +1, lent: +1, borrowed: -1, repaid_them: +1, they_repaid: -1,
}

function calcBalance(txns: Transaction[]): number {
  return txns.reduce((sum, t) => sum + TYPE_SIGNS[t.type] * t.amount, 0)
}

function calcSent(txns: Transaction[]): number {
  return txns.filter(t => t.type === 'sent').reduce((s, t) => s + t.amount, 0)
}

function BalancePill({ balance }: { balance: number }) {
  const t = useTranslations('people')
  const fmt = useFormatCurrency()
  if (balance === 0) return null
  const positive = balance > 0
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${positive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
      {positive ? t('owesYou', { amount: fmt(balance) }) : t('youOwe', { amount: fmt(-balance) })}
    </span>
  )
}

interface Props {
  initialPeople: Person[]
  initialTransactions: Transaction[]
  categories: Category[]
  familyId: string
  userId: string
}

export default function PeoplePageClient({ initialPeople, initialTransactions, categories, familyId, userId }: Props) {
  const fmt = useFormatCurrency()
  const t = useTranslations('people')
  const tc = useTranslations('common')
  const [people, setPeople] = useState<Person[]>(initialPeople)
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const selectedPerson = people.find(p => p.id === selectedId) ?? null
  const selectedTxns = transactions.filter(t => t.person_id === selectedId)

  async function handleAddPerson(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    const { data } = await supabase
      .from('people').insert({ family_id: familyId, name, notes: newNotes.trim() || null })
      .select('id, name, notes, created_at').single()
    if (data) {
      setPeople(prev => [...prev, data as Person].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedId((data as Person).id)
    }
    setNewName(''); setNewNotes(''); setAdding(false); setSaving(false)
  }

  function handleTransactionAdded(txn: Transaction) { setTransactions(prev => [txn, ...prev]) }
  function handleTransactionDeleted(id: string) { setTransactions(prev => prev.filter(t => t.id !== id)) }
  function handlePersonDeleted(id: string) {
    setPeople(prev => prev.filter(p => p.id !== id))
    setTransactions(prev => prev.filter(t => t.person_id !== id))
    setSelectedId(null)
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Left: people list */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 transition">
            <Plus className="h-4 w-4" />{t('addPerson')}
          </button>
        </div>

        {adding && (
          <form onSubmit={handleAddPerson} className="card p-4 space-y-2">
            <input autoFocus type="text" value={newName} onChange={e => setNewName(e.target.value)}
              placeholder={t('namePlaceholder')} className="input-base" required />
            <input type="text" value={newNotes} onChange={e => setNewNotes(e.target.value)}
              placeholder={t('notesPlaceholder')} className="input-base" />
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => { setAdding(false); setNewName(''); setNewNotes('') }}
                className="flex-1 rounded-lg border border-gray-300 py-1.5 text-sm text-gray-600 hover:bg-gray-50">{tc('cancel')}</button>
              <button type="submit" disabled={saving || !newName.trim()}
                className="flex-1 rounded-lg bg-indigo-600 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? tc('saving') : tc('save')}</button>
            </div>
          </form>
        )}

        <div className="card divide-y divide-gray-100 overflow-y-auto flex-1">
          {people.length === 0 && !adding ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
              <Users className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">{t('noPeople')}</p>
              <p className="text-xs mt-1">{t('noPeopleHint')}</p>
            </div>
          ) : people.map(person => {
            const txns = transactions.filter(t => t.person_id === person.id)
            const balance = calcBalance(txns)
            const sent = calcSent(txns)
            const isSelected = selectedId === person.id
            return (
              <button key={person.id} onClick={() => setSelectedId(person.id)}
                className={`w-full text-left px-4 py-3 transition ${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-700' : 'text-gray-900'}`}>{person.name}</span>
                  <BalancePill balance={balance} />
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {sent > 0 && <span className="text-xs text-gray-400">{t('sent')}: {fmt(sent)}</span>}
                  {txns.length === 0 && <span className="text-xs text-gray-400">{t('noTransactions')}</span>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Right: detail panel */}
      <div className="flex-1 min-w-0">
        {selectedPerson ? (
          <PersonPanel
            person={selectedPerson}
            transactions={selectedTxns}
            categories={categories}
            familyId={familyId}
            userId={userId}
            onTransactionAdded={handleTransactionAdded}
            onTransactionDeleted={handleTransactionDeleted}
            onPersonDeleted={handlePersonDeleted}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400">
            <div className="text-center">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t('selectPerson')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
