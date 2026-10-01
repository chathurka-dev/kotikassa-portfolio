// ============================================================
// Recurring-expense materialization — same ADR-008 logic as the
// web server components, via the shared helpers. Idempotent:
// guarded by last_materialized_month, safe to call from any screen.
// ============================================================
import {
  MATERIALIZE_TEMPLATE_COLUMNS,
  isRecurringTemplateDue,
  buildRecurringExpenseRow,
  type MaterializableTemplate,
} from '@kotikassa/shared/native'
import { supabase } from './supabase'

// Skip the network round trip once this app session has covered a month.
// Only set after a fully successful run so failures retry on the next focus.
let materializedMonth: string | null = null

export async function materializeRecurring(
  familyId: string,
  userId: string,
  currentMonth: string // 'YYYY-MM'
): Promise<void> {
  if (materializedMonth === currentMonth) return

  const { data, error } = await supabase
    .from('recurring_expenses')
    .select(MATERIALIZE_TEMPLATE_COLUMNS)
    .eq('family_id', familyId)
    .eq('active', true)
    .or(`last_materialized_month.is.null,last_materialized_month.neq.${currentMonth}`)
  if (error) {
    console.error('[recurring] template fetch failed:', error.message)
    return
  }

  const templates = ((data as unknown as MaterializableTemplate[] | null) ?? []).filter((t) =>
    isRecurringTemplateDue(t, currentMonth)
  )
  if (templates.length === 0) {
    materializedMonth = currentMonth
    return
  }

  const { error: insertErr } = await supabase
    .from('expense_items')
    .insert(templates.map((t) => buildRecurringExpenseRow(t, familyId, userId, currentMonth)))
  if (insertErr) {
    console.error('[recurring] materialization insert failed:', insertErr.message)
    return
  }

  await supabase
    .from('recurring_expenses')
    .update({ last_materialized_month: currentMonth })
    .in('id', templates.map((t) => t.id))
  materializedMonth = currentMonth
}
