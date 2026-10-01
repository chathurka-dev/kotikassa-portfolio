'use client'

import { formatDate } from '@kotikassa/shared'
import { useTranslations } from 'next-intl'
import { useFormatCurrency } from '@/lib/currency-context'

function fmtQtyUnit(quantity: number | null, unit: string | null): string | null {
  if (quantity == null || unit == null) return null
  return `${String(quantity).replace('.', ',')} ${unit}`
}

interface Expense {
  id: string
  name: string
  amount: number
  quantity: number | null
  unit: string | null
  expense_date: string
  categories: { name: string; icon: string; color: string } | null
}

export default function RecentExpenses({ expenses }: { expenses: Expense[] }) {
  const fmt = useFormatCurrency()
  const t = useTranslations('recentExpenses')

  if (expenses.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">
        {t('noExpenses')}
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {expenses.map((expense) => (
        <li key={expense.id} className="flex items-center justify-between gap-3 py-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base flex-shrink-0">
              {expense.categories?.icon ?? '📦'}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{expense.name}</div>
              <div className="text-xs text-gray-400">
                {fmtQtyUnit(expense.quantity, expense.unit)
                  ? `${fmtQtyUnit(expense.quantity, expense.unit)} · `
                  : ''
                }{formatDate(expense.expense_date)}
              </div>
            </div>
          </div>
          <div className="text-sm font-semibold text-gray-900 flex-shrink-0">
            {fmt(expense.amount)}
          </div>
        </li>
      ))}
    </ul>
  )
}
