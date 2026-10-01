'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useFormatCurrency } from '@/lib/currency-context'

interface BudgetAlert {
  categoryId: string
  name: string
  icon: string
  color: string
  spent: number
  limit: number
  pct: number
}

interface Props {
  alerts: BudgetAlert[]
}

export default function BudgetSummary({ alerts }: Props) {
  const fmt = useFormatCurrency()
  const t = useTranslations('dashboard')

  if (alerts.length === 0) return null

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">{t('budgetAlerts')}</h2>
        <Link href="/budgets" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
          {t('viewBudgets')}
        </Link>
      </div>
      <div className="space-y-3">
        {alerts.map((a) => {
          const over = a.spent > a.limit
          const barColor = over ? '#ef4444' : '#f59e0b'
          const textColor = over ? 'text-red-600' : 'text-amber-600'
          return (
            <div key={a.categoryId}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span>{a.icon}</span>
                  <span className="text-xs font-medium text-gray-700 truncate">{a.name}</span>
                </div>
                <span className={`text-xs font-semibold ${textColor} ml-2 flex-shrink-0`}>
                  {fmt(a.spent)} / {fmt(a.limit)}
                  {over && <span className="ml-1">(+{fmt(a.spent - a.limit)})</span>}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(a.pct, 100)}%`, backgroundColor: barColor }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
