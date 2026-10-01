'use server'

import { revalidatePath } from 'next/cache'

/**
 * Invalidates the router cache for pages that show materialized recurring expenses.
 * Call this after any change to recurring_expenses templates so the next navigation
 * to /expenses or / re-runs the server component and picks up the change.
 */
export async function revalidateAfterRecurringChange() {
  revalidatePath('/')
  revalidatePath('/expenses')
}
