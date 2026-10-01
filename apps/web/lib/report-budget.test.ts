import { describe, expect, it } from 'vitest'
import { allocateBudgetSpending } from './report-budget'

const CATEGORY_ID = '123e4567-e89b-42d3-a456-426614174000'

describe('report budget allocation', () => {
  it('allocates spending once to its matching category and period', () => {
    const allocated = allocateBudgetSpending(
      [
        { id: 'july', category_id: CATEGORY_ID, month: '2026-07-15', amount: 200 },
        { id: 'august', category_id: CATEGORY_ID, month: '2026-08-15', amount: 220 },
      ],
      [
        { category_id: CATEGORY_ID, expense_date: '2026-07-20', amount: 20 },
        { category_id: CATEGORY_ID, expense_date: '2026-08-20', amount: 30 },
        { category_id: null, expense_date: '2026-07-25', amount: 99 },
      ],
      '2026-07-15',
      '2026-09-14'
    )

    expect(allocated.map((row) => ({ id: row.id, spent: row.spent }))).toEqual([
      { id: 'july', spent: 20 },
      { id: 'august', spent: 30 },
    ])
  })
})
