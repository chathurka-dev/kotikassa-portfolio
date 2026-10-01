'use client'

import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useTranslations } from 'next-intl'
import CategoryExpenseModal from './CategoryExpenseModal'
import { useFormatCurrency } from '@/lib/currency-context'

interface ChartEntry {
  name: string
  icon: string
  color: string
  is_fixed: boolean
  total: number
  categoryId: string | null
}

type ChartMode = 'variable' | 'fixed' | 'all'

interface SelectedCategory {
  id: string | null
  name: string
  icon: string
}

export default function MonthlyChart({ data,
  fixedTotal,
  variableTotal,
  familyId,
  currentMonth,
  budgetStartDay,
}: {
  data: ChartEntry[]
  fixedTotal: number
  variableTotal: number
  familyId: string
  currentMonth: string
  budgetStartDay: number
}) {
  const fmt = useFormatCurrency()
  const t = useTranslations('dashboard')
  const [mode, setMode] = useState<ChartMode>('variable')
  const [selectedCategory, setSelectedCategory] = useState<SelectedCategory | null>(null)

  const filtered = data.filter((d) => {
    if (mode === 'variable') return !d.is_fixed
    if (mode === 'fixed') return d.is_fixed
    return true
  })

  const total = filtered.reduce((s, d) => s + d.total, 0)

  // Group slices under 2% into "Other" to keep the donut clean
  const THRESHOLD = 0.02
  const main: typeof filtered = []
  let otherTotal = 0
  for (const d of filtered) {
    if (total > 0 && d.total / total < THRESHOLD) {
      otherTotal += d.total
    } else {
      main.push(d)
    }
  }
  if (otherTotal > 0) {
    main.push({ name: 'Other', icon: '📦', color: '#d1d5db', is_fixed: false, total: otherTotal, categoryId: null })
  }

  const chartData = main.map((d) => ({
    name: `${d.icon} ${d.name}`,
    rawName: d.name,
    icon: d.icon,
    value: d.total,
    color: d.color,
    pct: total > 0 ? (d.total / total) * 100 : 0,
    categoryId: d.categoryId,
  }))

  const modes: { key: ChartMode; label: string; modeTotal: number }[] = [
    { key: 'variable', label: t('variable'), modeTotal: variableTotal },
    { key: 'fixed',    label: t('fixed'),    modeTotal: fixedTotal },
    { key: 'all',      label: t('all'),      modeTotal: fixedTotal + variableTotal },
  ]

  function handleSliceClick(entry: { rawName: string; icon: string; categoryId: string | null }) {
    setSelectedCategory({ id: entry.categoryId, name: entry.rawName, icon: entry.icon })
  }

  return (
    <div>
      {/* Mode toggle chips */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {modes.map(({ key, label, modeTotal }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`flex items-center gap-1.5 text-xs rounded-full px-3 py-1 font-medium transition ${
              mode === key
                ? key === 'variable'
                  ? 'bg-indigo-600 text-white border border-indigo-600'
                  : key === 'fixed'
                  ? 'bg-red-500 text-white border border-red-500'
                  : 'bg-gray-700 text-white border border-gray-700'
                : 'text-gray-500 border border-dashed border-gray-300 hover:border-gray-400'
            }`}
          >
            {label}
            <span className={mode === key ? 'opacity-75 font-normal' : 'text-gray-400 font-normal'}>
              {fmt(modeTotal)}
            </span>
          </button>
        ))}
      </div>

      {chartData.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-gray-400">
          {t('noExpenses')}
        </div>
      ) : (
        <>
          {/* Donut — clickable slices open CategoryExpenseModal */}
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={64}
                outerRadius={96}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
                style={{ cursor: 'pointer' }}
                onClick={(entry) => handleSliceClick(entry as { rawName: string; icon: string; categoryId: string | null })}
              >
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, _name: string, props: { payload?: { pct?: number } }) => [
                  `${fmt(value)} · ${props.payload?.pct?.toFixed(1) ?? 0}%`,
                  'Spent',
                ]}
                contentStyle={{ fontSize: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Custom legend — 2-column grid, clickable */}
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
            {filtered
              .slice()
              .sort((a, b) => b.total - a.total)
              .map((d) => {
                const pct = total > 0 ? (d.total / total) * 100 : 0
                return (
                  <button
                    key={d.name}
                    onClick={() => setSelectedCategory({ id: d.categoryId, name: d.name, icon: d.icon })}
                    className="flex items-center gap-2 min-w-0 text-left hover:opacity-75 transition"
                  >
                    <span
                      className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: d.color }}
                    />
                    <span className="text-xs text-gray-600 truncate flex-1">
                      {d.icon} {d.name}
                    </span>
                    <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
                      {pct.toFixed(0)}%
                    </span>
                  </button>
                )
              })}
          </div>
        </>
      )}

      {/* Category expense modal */}
      {selectedCategory && (
        <CategoryExpenseModal
          categoryId={selectedCategory.id}
          categoryName={selectedCategory.name}
          categoryIcon={selectedCategory.icon}
          month={currentMonth}
          budgetStartDay={budgetStartDay}
          familyId={familyId}
          onClose={() => setSelectedCategory(null)}
        />
      )}
    </div>
  )
}
