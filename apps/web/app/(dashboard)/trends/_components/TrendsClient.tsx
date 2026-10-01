'use client'

import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useTranslations } from 'next-intl'
import { useFormatCurrency } from '@/lib/currency-context'

export interface TrendPoint {
  key: string
  label: string
  income: number
  expenses: number
  net: number
  start?: string
  end?: string
}

interface Props {
  monthlyData: TrendPoint[]
  weeklyData: TrendPoint[]
}

const INCOME_COLOR = '#10b981'   // emerald-500
const EXPENSE_COLOR = '#6366f1'  // indigo-500

function yAxisFormatter(v: number) {
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`
  return `${v}`
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  const t = useTranslations('trends')
  const fmt = useFormatCurrency()
  if (!active || !payload?.length) return null

  const income = payload.find(p => p.name === 'income')?.value ?? 0
  const expenses = payload.find(p => p.name === 'expenses')?.value ?? 0
  const net = income - expenses

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-lg p-3 text-sm min-w-[160px]">
      <div className="font-semibold text-gray-800 mb-2">{label}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-gray-500">{t('income')}</span>
        <span className="font-medium text-emerald-600">{fmt(income)}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-gray-500">{t('expenses')}</span>
        <span className="font-medium text-indigo-600">{fmt(expenses)}</span>
      </div>
      <div className="border-t border-gray-100 mt-2 pt-2 flex items-center justify-between gap-4">
        <span className="text-gray-500">{t('net')}</span>
        <span className={`font-semibold ${net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {net >= 0 ? '+' : ''}{fmt(net)}
        </span>
      </div>
    </div>
  )
}

export default function TrendsClient({ monthlyData, weeklyData }: Props) {
  const fmt = useFormatCurrency()
  const t = useTranslations('trends')
  const [view, setView] = useState<'monthly' | 'weekly'>('monthly')

  const data = view === 'monthly' ? monthlyData : weeklyData
  const subtitle = view === 'monthly' ? t('last6Months') : t('last8Weeks')

  const hasData = data.some(p => p.income > 0 || p.expenses > 0)

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setView('monthly')}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              view === 'monthly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('monthly')}
          </button>
          <button
            onClick={() => setView('weekly')}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              view === 'weekly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('weekly')}
          </button>
        </div>
      </div>

      {/* Chart card */}
      <div className="card p-6">
        {!hasData ? (
          <div className="flex items-center justify-center h-64 text-sm text-gray-400">
            {t('noData')}
          </div>
        ) : (
          <>
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {(() => {
                const totalIncome = data.reduce((s, p) => s + p.income, 0)
                const totalExpenses = data.reduce((s, p) => s + p.expenses, 0)
                const totalNet = totalIncome - totalExpenses
                return (
                  <>
                    <div className="rounded-xl bg-emerald-50 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600 mb-1">
                        {t('income')}
                      </div>
                      <div className="text-xl font-bold text-emerald-700">{fmt(totalIncome)}</div>
                    </div>
                    <div className="rounded-xl bg-indigo-50 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600 mb-1">
                        {t('expenses')}
                      </div>
                      <div className="text-xl font-bold text-indigo-700">{fmt(totalExpenses)}</div>
                    </div>
                    <div className={`rounded-xl px-4 py-3 ${totalNet >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      <div className={`text-xs font-semibold uppercase tracking-wide mb-1 ${totalNet >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {totalNet >= 0 ? t('surplus') : t('deficit')}
                      </div>
                      <div className={`text-xl font-bold ${totalNet >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {totalNet >= 0 ? '+' : ''}{fmt(totalNet)}
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>

            {/* Bar chart */}
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data} barCategoryGap="25%" barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={yAxisFormatter}
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span className="text-xs font-medium text-gray-600">
                      {value === 'income' ? t('income') : t('expenses')}
                    </span>
                  )}
                />
                <ReferenceLine y={0} stroke="#e2e8f0" />
                <Bar dataKey="income" name="income" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={48} />
                <Bar dataKey="expenses" name="expenses" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>

            {/* Net per period row */}
            <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${data.length}, 1fr)` }}>
              {data.map((p) => (
                <div key={p.key} className="text-center">
                  <div className={`text-xs font-semibold ${p.net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {p.net === 0 ? '—' : `${p.net > 0 ? '+' : ''}${fmt(p.net)}`}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
