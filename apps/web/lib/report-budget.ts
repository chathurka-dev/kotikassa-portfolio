interface BudgetPeriod {
  category_id: string
  month: string
}

interface BudgetExpense {
  category_id: string | null
  expense_date: string
  amount: number
}

export function budgetPeriodEnd(periodStart: string): string {
  const nextPeriod = new Date(`${periodStart}T00:00:00Z`)
  nextPeriod.setUTCMonth(nextPeriod.getUTCMonth() + 1)
  nextPeriod.setUTCDate(nextPeriod.getUTCDate() - 1)
  return nextPeriod.toISOString().slice(0, 10)
}

export function allocateBudgetSpending<T extends BudgetPeriod>(
  budgets: readonly T[],
  expenses: readonly BudgetExpense[],
  reportFrom: string,
  reportTo: string
): Array<T & { periodTo: string; spent: number }> {
  return budgets
    .map((budget) => {
      const periodTo = budgetPeriodEnd(budget.month)
      const spent = expenses
        .filter(
          (expense) =>
            expense.category_id === budget.category_id &&
            expense.expense_date >= budget.month &&
            expense.expense_date <= periodTo
        )
        .reduce((sum, expense) => sum + Number(expense.amount), 0)
      return { ...budget, periodTo, spent }
    })
    .filter((budget) => budget.month <= reportTo && budget.periodTo >= reportFrom)
}
