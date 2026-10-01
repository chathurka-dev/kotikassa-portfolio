'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Lock, Minus, Pause, Play, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createClient, today } from '@kotikassa/shared'
import { useFormatCurrency } from '@/lib/currency-context'

interface SavingsTransaction {
  id: string
  goal_id: string
  amount: number
  note: string | null
  contributed_at: string
  transaction_type: 'deposit' | 'withdrawal'
  recovery_plan_id: string | null
}

interface Goal {
  id: string
  name: string
  description: string | null
  target_amount: number
  current_amount: number
  deadline: string | null
  is_private: boolean
  transactions: SavingsTransaction[]
}

interface RecoveryPlan {
  id: string
  goal_id: string
  goal_name: string
  source_transaction_id: string
  target_amount: number
  recovered_amount: number
  monthly_amount: number
  deadline: string | null
  status: 'active' | 'paused' | 'completed'
  created_at: string
}

interface TransactionForm {
  goalId: string
  type: 'deposit' | 'withdrawal'
  recoveryPlanId: string | null
}

interface Props {
  initialGoals: Goal[]
  initialPlans: RecoveryPlan[]
  familyId: string
  userId: string
}

function parseAmount(value: string): number {
  return Number.parseFloat(value.replace(',', '.'))
}

export default function SavingsClient({ initialGoals, initialPlans, familyId, userId }: Props) {
  const fmt = useFormatCurrency()
  const t = useTranslations('savings')
  const tc = useTranslations('common')
  const supabase = createClient()
  const router = useRouter()

  const [showAdd, setShowAdd] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [transactionForm, setTransactionForm] = useState<TransactionForm | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [deadline, setDeadline] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [transactionAmount, setTransactionAmount] = useState('')
  const [transactionNote, setTransactionNote] = useState('')
  const [transactionDate, setTransactionDate] = useState(today())
  const [createRecovery, setCreateRecovery] = useState(true)
  const [recoveryMonthlyAmount, setRecoveryMonthlyAmount] = useState('')
  const [recoveryDeadline, setRecoveryDeadline] = useState('')
  const [transactionSaving, setTransactionSaving] = useState(false)
  const [transactionError, setTransactionError] = useState<string | null>(null)

  async function handleAddGoal(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const parsedTarget = parseAmount(targetAmount)
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      setError(t('invalidTarget'))
      return
    }

    setSaving(true)
    const { error: saveError } = await supabase.from('savings_goals').insert({
      family_id: familyId,
      created_by: userId,
      name: name.trim(),
      description: description.trim() || null,
      target_amount: parsedTarget,
      current_amount: 0,
      deadline: deadline || null,
      is_private: isPrivate,
    })
    setSaving(false)
    if (saveError) {
      setError(t('saveError'))
      return
    }

    setName('')
    setDescription('')
    setTargetAmount('')
    setDeadline('')
    setIsPrivate(false)
    setShowAdd(false)
    router.refresh()
  }

  async function handleDeleteGoal(id: string) {
    if (!confirm(t('deleteConfirm'))) return
    const { error: deleteError } = await supabase.from('savings_goals').delete().eq('id', id)
    if (deleteError) {
      setError(t('deleteError'))
      return
    }
    router.refresh()
  }

  function openTransaction(
    goalId: string,
    type: 'deposit' | 'withdrawal',
    recoveryPlan: RecoveryPlan | null = null,
  ) {
    setTransactionForm({ goalId, type, recoveryPlanId: recoveryPlan?.id ?? null })
    setTransactionAmount(recoveryPlan ? String(recoveryPlan.monthly_amount).replace('.', ',') : '')
    setTransactionNote(recoveryPlan ? t('recoveryPaymentNote') : '')
    setTransactionDate(today())
    setCreateRecovery(type === 'withdrawal')
    setRecoveryMonthlyAmount('')
    setRecoveryDeadline('')
    setTransactionError(null)
  }

  function closeTransaction() {
    setTransactionForm(null)
    setTransactionError(null)
  }

  async function handleSaveTransaction(goal: Goal) {
    if (!transactionForm) return
    setTransactionError(null)
    const amount = parseAmount(transactionAmount)
    const monthlyAmount = parseAmount(recoveryMonthlyAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setTransactionError(t('invalidTransactionAmount'))
      return
    }
    if (transactionForm.type === 'withdrawal' && amount > goal.current_amount) {
      setTransactionError(t('withdrawalExceedsBalance'))
      return
    }
    if (transactionForm.type === 'withdrawal' && createRecovery
        && (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0)) {
      setTransactionError(t('invalidRecoveryAmount'))
      return
    }

    setTransactionSaving(true)
    const { error: saveError } = await supabase.rpc('record_savings_transaction', {
      p_goal_id: goal.id,
      p_transaction_type: transactionForm.type,
      p_amount: amount,
      p_note: transactionNote.trim() || null,
      p_transaction_date: transactionDate,
      p_recovery_plan_id: transactionForm.recoveryPlanId,
      p_create_recovery: transactionForm.type === 'withdrawal' && createRecovery,
      p_recovery_monthly_amount: transactionForm.type === 'withdrawal' && createRecovery ? monthlyAmount : null,
      p_recovery_deadline: transactionForm.type === 'withdrawal' && createRecovery && recoveryDeadline
        ? recoveryDeadline
        : null,
    })
    setTransactionSaving(false)
    if (saveError) {
      setTransactionError(t('transactionSaveError'))
      return
    }

    closeTransaction()
    router.refresh()
  }

  async function handleDeleteTransaction(transactionId: string) {
    if (!confirm(t('deleteTransactionConfirm'))) return
    const { error: deleteError } = await supabase.rpc('delete_savings_transaction', {
      p_transaction_id: transactionId,
    })
    if (deleteError) {
      setError(t('deleteTransactionError'))
      return
    }
    router.refresh()
  }

  async function toggleRecoveryPlan(plan: RecoveryPlan) {
    const status = plan.status === 'paused' ? 'active' : 'paused'
    const { error: updateError } = await supabase.rpc('set_savings_recovery_status', {
      p_plan_id: plan.id,
      p_status: status,
    })
    if (updateError) {
      setError(t('recoveryUpdateError'))
      return
    }
    router.refresh()
  }

  function daysLeft(value: string): number {
    return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000)
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('subtitle', { count: initialGoals.length })}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          {t('addGoal')}
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {showAdd && (
        <div className="card mb-6 p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">{t('newGoal')}</h3>
          <form onSubmit={handleAddGoal} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-gray-700">{t('goalName')}</span>
              <input required value={name} onChange={(event) => setName(event.target.value)} className="input-base" placeholder={t('goalNamePlaceholder')} autoFocus />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-gray-700">{t('targetAmount')}</span>
              <input required value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} className="input-base" placeholder="0,00" inputMode="decimal" />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-gray-700">{t('deadline')}</span>
              <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="input-base" />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-gray-700">{t('description')}</span>
              <input value={description} onChange={(event) => setDescription(event.target.value)} className="input-base" placeholder={t('descriptionPlaceholder')} />
            </label>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
              <span className="text-sm text-gray-700">{t('privateGoal')}</span>
            </label>
            {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" onClick={() => { setShowAdd(false); setError(null) }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">{tc('cancel')}</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? tc('saving') : tc('save')}</button>
            </div>
          </form>
        </div>
      )}

      {initialPlans.length > 0 && (
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-900">{t('recoveryPlans')}</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {initialPlans.map((plan) => {
              const remaining = Math.max(0, plan.target_amount - plan.recovered_amount)
              const percent = Math.min(100, Math.round((plan.recovered_amount / plan.target_amount) * 100))
              const goal = initialGoals.find((candidate) => candidate.id === plan.goal_id)
              return (
                <div key={plan.id} className={`card p-4 ${plan.status === 'completed' ? 'border-green-200' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{plan.goal_name}</p>
                      <p className="text-xs text-gray-500">{t('restoreWithdrawnSavings')}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${
                      plan.status === 'completed' ? 'bg-green-50 text-green-700'
                        : plan.status === 'paused' ? 'bg-gray-100 text-gray-600' : 'bg-indigo-50 text-indigo-700'
                    }`}>{t(`recoveryStatus.${plan.status}`)}</span>
                  </div>
                  <div className="mt-3 flex justify-between text-xs text-gray-500">
                    <span>{t('recovered', { amount: fmt(plan.recovered_amount) })}</span>
                    <span>{fmt(plan.target_amount)}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-gray-100">
                    <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${percent}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                    <span>{t('recoveryRemaining', { amount: fmt(remaining), monthly: fmt(plan.monthly_amount) })}</span>
                    {plan.deadline && <span>{t('recoveryDeadline', { date: plan.deadline })}</span>}
                  </div>
                  {plan.status !== 'completed' && goal && (
                    <div className="mt-3 flex justify-end gap-2">
                      <button type="button" onClick={() => toggleRecoveryPlan(plan)} className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                        {plan.status === 'paused' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                        {plan.status === 'paused' ? t('resumeRecovery') : t('pauseRecovery')}
                      </button>
                      {plan.status === 'active' && (
                        <button type="button" onClick={() => openTransaction(goal.id, 'deposit', plan)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
                          {t('addRecoveryPayment')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {initialGoals.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="mb-3 text-3xl">🐷</div>
          <p className="text-sm text-gray-500">{t('noGoals')}</p>
          <button onClick={() => setShowAdd(true)} className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-700">{t('addFirst')}</button>
        </div>
      ) : (
        <div className="space-y-4">
          {initialGoals.map((goal) => {
            const percent = goal.target_amount > 0 ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100)) : 0
            const remaining = Math.max(0, goal.target_amount - goal.current_amount)
            const reached = goal.current_amount >= goal.target_amount
            const days = goal.deadline ? daysLeft(goal.deadline) : null
            const expanded = expandedId === goal.id
            const showingForm = transactionForm?.goalId === goal.id

            return (
              <div key={goal.id} className="card p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-gray-900">{goal.name}</h3>
                      {goal.is_private && <span className="flex items-center gap-1 text-xs text-gray-400"><Lock className="h-3 w-3" /> {t('private')}</span>}
                    </div>
                    {goal.description && <p className="mt-0.5 text-xs text-gray-400">{goal.description}</p>}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <button onClick={() => openTransaction(goal.id, 'deposit')} className="flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"><Plus className="h-3.5 w-3.5" /> {t('addContribution')}</button>
                    <button onClick={() => openTransaction(goal.id, 'withdrawal')} disabled={goal.current_amount <= 0} className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-40"><Minus className="h-3.5 w-3.5" /> {t('withdraw')}</button>
                    <button onClick={() => setExpandedId(expanded ? null : goal.id)} className="p-1.5 text-gray-400 hover:text-gray-600">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
                    <button onClick={() => handleDeleteGoal(goal.id)} className="p-1.5 text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>

                <div className="mb-2">
                  <div className="mb-1 flex justify-between text-xs text-gray-500"><span>{fmt(goal.current_amount)} {t('totalSaved')}</span><span>{fmt(goal.target_amount)}</span></div>
                  <div className="h-2.5 w-full rounded-full bg-gray-100"><div className={`h-2.5 rounded-full ${reached ? 'bg-green-500' : 'bg-indigo-500'}`} style={{ width: `${percent}%` }} /></div>
                  <div className="mt-1 flex justify-between text-xs">
                    <span className={reached ? 'font-medium text-green-600' : 'text-gray-400'}>{reached ? t('reached') : `${percent}%`}</span>
                    <span className="text-gray-400">
                      {!reached && `${fmt(remaining)} ${t('remaining')}`}
                      {days !== null && !reached && <span className={`ml-2 ${days < 0 ? 'text-red-500' : days < 30 ? 'text-amber-500' : ''}`}>· {days < 0 ? t('overdue') : t('daysLeft', { days })}</span>}
                    </span>
                  </div>
                </div>

                {showingForm && transactionForm && (
                  <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <h4 className="mb-3 text-sm font-semibold text-gray-900">
                      {transactionForm.recoveryPlanId ? t('recoveryPayment')
                        : transactionForm.type === 'withdrawal' ? t('withdrawSavings') : t('depositSavings')}
                    </h4>
                    {transactionError && <p className="mb-2 text-xs text-red-600">{transactionError}</p>}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                      <label>
                        <span className="mb-1 block text-xs font-medium text-gray-600">{t('transactionAmount')}</span>
                        <input value={transactionAmount} onChange={(event) => setTransactionAmount(event.target.value)} className="input-base py-1.5 text-sm" placeholder="0,00" inputMode="decimal" autoFocus />
                      </label>
                      <label>
                        <span className="mb-1 block text-xs font-medium text-gray-600">{t('transactionDate')}</span>
                        <input type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} className="input-base py-1.5 text-sm" />
                      </label>
                      <label className="sm:col-span-2">
                        <span className="mb-1 block text-xs font-medium text-gray-600">{t('transactionNote')}</span>
                        <input value={transactionNote} onChange={(event) => setTransactionNote(event.target.value)} className="input-base py-1.5 text-sm" placeholder={t('transactionNotePlaceholder')} />
                      </label>
                    </div>

                    {transactionForm.type === 'withdrawal' && (
                      <div className="mt-3 border-t border-gray-200 pt-3">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={createRecovery} onChange={(event) => setCreateRecovery(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600" />
                          <span className="text-sm font-medium text-gray-700">{t('createRecoveryPlan')}</span>
                        </label>
                        {createRecovery && (
                          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <label>
                              <span className="mb-1 block text-xs font-medium text-gray-600">{t('monthlyRecoveryAmount')}</span>
                              <input value={recoveryMonthlyAmount} onChange={(event) => setRecoveryMonthlyAmount(event.target.value)} className="input-base py-1.5 text-sm" placeholder="0,00" inputMode="decimal" />
                            </label>
                            <label>
                              <span className="mb-1 block text-xs font-medium text-gray-600">{t('recoveryDeadlineOptional')}</span>
                              <input type="date" min={transactionDate} value={recoveryDeadline} onChange={(event) => setRecoveryDeadline(event.target.value)} className="input-base py-1.5 text-sm" />
                            </label>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-3 flex justify-end gap-2">
                      <button onClick={closeTransaction} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100">{tc('cancel')}</button>
                      <button onClick={() => handleSaveTransaction(goal)} disabled={transactionSaving} className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${transactionForm.type === 'withdrawal' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}`}>{transactionSaving ? tc('saving') : tc('save')}</button>
                    </div>
                  </div>
                )}

                {expanded && (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{t('transactions')}</p>
                    {goal.transactions.length === 0 ? <p className="text-xs text-gray-400">{t('noTransactions')}</p> : (
                      <div className="divide-y divide-gray-100">
                        {goal.transactions.map((transaction) => {
                          const deposit = transaction.transaction_type === 'deposit'
                          return (
                            <div key={transaction.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                              <div className="min-w-0">
                                <span className="text-gray-700">{transaction.contributed_at}</span>
                                <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${deposit ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{deposit ? t('deposit') : t('withdrawal')}</span>
                                {transaction.recovery_plan_id && <span className="ml-1 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">{t('recovery')}</span>}
                                {transaction.note && <p className="truncate text-xs text-gray-400">{transaction.note}</p>}
                              </div>
                              <div className="flex flex-shrink-0 items-center gap-2">
                                <span className={`font-semibold ${deposit ? 'text-green-600' : 'text-amber-700'}`}>{deposit ? '+' : '−'}{fmt(transaction.amount)}</span>
                                <button onClick={() => handleDeleteTransaction(transaction.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                            </div>
                          )
                        })}
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
