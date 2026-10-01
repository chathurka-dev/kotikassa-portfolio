import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'
import SavingsClient from './_components/SavingsClient'

export const dynamic = 'force-dynamic'

interface TransactionRow {
  id: string
  goal_id: string
  amount: number
  note: string | null
  contributed_at: string
  transaction_type: 'deposit' | 'withdrawal'
  recovery_plan_id: string | null
}

interface GoalRow {
  id: string
  name: string
  description: string | null
  target_amount: number
  current_amount: number
  deadline: string | null
  is_private: boolean
}

interface RecoveryPlanRow {
  id: string
  goal_id: string
  source_transaction_id: string
  target_amount: number
  monthly_amount: number
  deadline: string | null
  status: 'active' | 'paused' | 'completed'
  created_at: string
}

export default async function SavingsPage() {
  const session = await getServerSession()
  if (!session) redirect('/login')

  const { user, familyId, supabase } = session
  const [{ data: goalsRaw }, { data: transactionsRaw }, { data: plansRaw }] = await Promise.all([
    supabase
      .from('savings_goals')
      .select('id, name, description, target_amount, current_amount, deadline, is_private')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false }),
    supabase
      .from('savings_contributions')
      .select('id, goal_id, amount, note, contributed_at, transaction_type, recovery_plan_id')
      .eq('family_id', familyId)
      .order('contributed_at', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('savings_recovery_plans')
      .select('id, goal_id, source_transaction_id, target_amount, monthly_amount, deadline, status, created_at')
      .eq('family_id', familyId)
      .order('created_at', { ascending: false }),
  ])

  const transactions = (transactionsRaw ?? []) as TransactionRow[]
  const goals = ((goalsRaw ?? []) as GoalRow[]).map((goal) => ({
    ...goal,
    target_amount: Number(goal.target_amount),
    current_amount: Number(goal.current_amount),
    transactions: transactions
      .filter((transaction) => transaction.goal_id === goal.id)
      .map((transaction) => ({ ...transaction, amount: Number(transaction.amount) })),
  }))
  const goalNames = new Map(goals.map((goal) => [goal.id, goal.name]))
  const plans = ((plansRaw ?? []) as RecoveryPlanRow[]).map((plan) => ({
    ...plan,
    target_amount: Number(plan.target_amount),
    monthly_amount: Number(plan.monthly_amount),
    recovered_amount: transactions
      .filter((transaction) => transaction.recovery_plan_id === plan.id && transaction.transaction_type === 'deposit')
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0),
    goal_name: goalNames.get(plan.goal_id) ?? '',
  }))

  return (
    <SavingsClient
      initialGoals={goals}
      initialPlans={plans}
      familyId={familyId}
      userId={user.id}
    />
  )
}
