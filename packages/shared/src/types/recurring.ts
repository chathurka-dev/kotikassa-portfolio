export interface RecurringExpense {
  id: string
  family_id: string
  created_by: string
  name: string
  amount: number
  category_id: string | null
  recurrence_type: 'monthly' | 'yearly'
  day_of_month: number | null
  month_of_year: number | null  // for yearly: 1-12
  active: boolean
  notes: string | null
  last_materialized_month: string | null  // 'YYYY-MM'
  created_at: string
}
