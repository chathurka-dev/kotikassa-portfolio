import type { RecurringExpense } from '../types/recurring'

// The template fields materialization needs — select exactly these.
export type MaterializableTemplate = Pick<
  RecurringExpense,
  | 'id'
  | 'name'
  | 'amount'
  | 'category_id'
  | 'recurrence_type'
  | 'day_of_month'
  | 'month_of_year'
  | 'last_materialized_month'
>

export const MATERIALIZE_TEMPLATE_COLUMNS =
  'id, name, amount, category_id, recurrence_type, day_of_month, month_of_year, last_materialized_month'

// A template is due when it has not been materialized for this month yet and,
// for yearly templates, this is its month (ADR-008).
export function isRecurringTemplateDue(template: MaterializableTemplate, currentMonth: string): boolean {
  if (template.last_materialized_month === currentMonth) return false
  if (template.recurrence_type === 'yearly') {
    return template.month_of_year === Number(currentMonth.slice(5, 7))
  }
  return true
}

// The expense_items row a due template materializes into.
export function buildRecurringExpenseRow(
  template: MaterializableTemplate,
  familyId: string,
  userId: string,
  currentMonth: string // 'YYYY-MM'
) {
  return {
    family_id: familyId,
    added_by: userId,
    name: template.name,
    amount: template.amount,
    category_id: template.category_id ?? null,
    expense_date: `${currentMonth}-${String(template.day_of_month ?? 1).padStart(2, '0')}`,
    recurring_expense_id: template.id,
  }
}
