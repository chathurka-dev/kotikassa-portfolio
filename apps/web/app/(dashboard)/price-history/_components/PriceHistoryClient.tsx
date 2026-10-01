'use client'

import { useState } from 'react'
import { Search, ArrowLeft } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { createClient } from '@kotikassa/shared'
import type { PriceHistorySuggestion } from '../page'
import { useFormatCurrency } from '@/lib/currency-context'
import { normalizeUnitPrice } from '@kotikassa/shared'

interface PricePoint {
  date: string
  amount: number
  rawQuantity: number | null  // original quantity as entered (e.g. 100 for "100 g")
  rawUnit: string | null      // original unit as entered (e.g. 'g')
  unitPrice: number           // normalized to canonical unit (e.g. €/kg, not €/g)
  canonicalUnit: string | null // e.g. 'kg', 'l'
  store: string | null
}

interface Props {
  familyId: string
  suggestions: PriceHistorySuggestion[]
}

function formatQtyUnit(quantity: number | null, unit: string | null): string | null {
  if (quantity == null || unit == null) return null
  return `${String(quantity).replace('.', ',')} ${unit}`
}

export default function PriceHistoryClient({ familyId, suggestions }: Props) {
  const fmt = useFormatCurrency()
  const [query, setQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [history, setHistory] = useState<PricePoint[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedStore, setSelectedStore] = useState<string | null>(null)
  const supabase = createClient()

  const showDropdown = !selectedItem && query.trim().length > 0

  async function selectItem(name: string) {
    setSelectedItem(name)
    setQuery(name)
    setSelectedStore(null)
    setLoading(true)

    const { data } = await supabase
      .from('expense_items')
      .select('amount, quantity, unit, expense_date, receipts(store_name)')
      .eq('family_id', familyId)
      .ilike('name', name)
      .order('expense_date', { ascending: true })
      .limit(100)

    type Row = {
      amount: number
      quantity: number | null
      unit: string | null
      expense_date: string
      receipts: { store_name: string | null } | null
    }
    setHistory(
      (data ?? []).map((row) => {
        const r = row as unknown as Row
        const rawUnitPrice = r.quantity != null && r.quantity > 0
          ? r.amount / r.quantity
          : r.amount
        const { price: unitPrice, canonical: canonicalUnit } = normalizeUnitPrice(rawUnitPrice, r.unit ?? null)
        return {
          date: r.expense_date,
          amount: r.amount,
          rawQuantity: r.quantity ?? null,
          rawUnit: r.unit ?? null,
          unitPrice,
          canonicalUnit,
          store: r.receipts?.store_name ?? null,
        }
      })
    )
    setLoading(false)
  }

  function goBack() {
    setSelectedItem(null)
    setQuery('')
    setHistory([])
    setSelectedStore(null)
  }

  // Store filter
  const stores = Array.from(new Set(history.map((h) => h.store).filter(Boolean))) as string[]
  const filteredHistory = selectedStore ? history.filter((h) => h.store === selectedStore) : history

  // Stats — computed on filtered data using unit prices
  const unitPrices = filteredHistory.map((h) => h.unitPrice)
  const min = unitPrices.length ? Math.min(...unitPrices) : 0
  const max = unitPrices.length ? Math.max(...unitPrices) : 0
  const avg = unitPrices.length ? unitPrices.reduce((s, a) => s + a, 0) / unitPrices.length : 0

  const latestChange = filteredHistory.length >= 2
    ? filteredHistory[filteredHistory.length - 1]!.unitPrice - filteredHistory[filteredHistory.length - 2]!.unitPrice
    : null

  const canonicals = filteredHistory.map((h) => h.canonicalUnit).filter(Boolean) as string[]
  const dominantUnit = canonicals.length > 0
    ? [...canonicals].sort((a, b) =>
        canonicals.filter(u => u === b).length - canonicals.filter(u => u === a).length
      )[0] ?? null
    : null

  const perUnitLabel = dominantUnit ? `€/${dominantUnit}` : '€'

  // ── Item list (no item selected) ─────────────────────────────────────────
  if (!selectedItem) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Price History</h1>
          <p className="text-sm text-gray-500">Track how item prices change over time.</p>
        </div>

        {/* Search */}
        <div className="card p-4 mb-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for an item…"
              className="input-base pl-9"
              autoFocus
            />
          </div>
        </div>

        {/* Item list */}
        <div className="card divide-y divide-gray-100">
          {(showDropdown
            ? suggestions.filter((s) => s.name.toLowerCase().includes(query.toLowerCase())).slice(0, 12)
            : suggestions.slice(0, 20)
          ).map((s) => {
            const qty = formatQtyUnit(s.lastQuantity, s.lastUnit)
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => selectItem(s.name)}
                className="flex w-full items-center justify-between px-5 py-3
                           hover:bg-indigo-50 transition text-left gap-4"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{s.name}</div>
                  {qty && <div className="text-xs text-gray-400 mt-0.5">{qty}</div>}
                </div>
                <span className="text-sm font-semibold text-gray-900 flex-shrink-0">
                  {fmt(s.lastPrice)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Item detail (item selected) ───────────────────────────────────────────
  return (
    <div>
      <button
        onClick={goBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition mb-5"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to list
      </button>

      <div className="card p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">{selectedItem}</h2>
        <p className="text-sm text-gray-400 mb-5">
          {loading
            ? 'Loading…'
            : `${filteredHistory.length}${selectedStore ? '' : ` of ${history.length}`} purchase${filteredHistory.length !== 1 ? 's' : ''}${selectedStore ? ` · ${selectedStore}` : ''}`
          }
          {latestChange !== null && latestChange !== 0 && (
            <span className={`ml-2 font-medium ${latestChange > 0 ? 'text-red-500' : 'text-green-600'}`}>
              {latestChange > 0 ? '▲' : '▼'} {fmt(Math.abs(latestChange))}{dominantUnit ? `/${dominantUnit}` : ''} since last
            </span>
          )}
        </p>

        {loading ? (
          <div className="h-52 flex items-center justify-center text-gray-400 text-sm">
            Loading price history…
          </div>
        ) : history.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-gray-400 text-sm">
            No purchases found.
          </div>
        ) : (
          <>
            {/* Store filter chips */}
            {stores.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-5">
                <button
                  onClick={() => setSelectedStore(null)}
                  className={`text-xs rounded-full px-3 py-1 font-medium transition ${
                    selectedStore === null
                      ? 'bg-indigo-600 text-white border border-indigo-600'
                      : 'text-gray-500 border border-dashed border-gray-300 hover:border-gray-400'
                  }`}
                >
                  All stores
                </button>
                {stores.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedStore(s === selectedStore ? null : s)}
                    className={`text-xs rounded-full px-3 py-1 font-medium transition ${
                      selectedStore === s
                        ? 'bg-indigo-600 text-white border border-indigo-600'
                        : 'text-gray-500 border border-dashed border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-0.5">Lowest</p>
                <p className="text-lg font-bold text-green-600">{fmt(min)}</p>
                {dominantUnit && <p className="text-[10px] text-gray-400">per {dominantUnit}</p>}
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-0.5">Average</p>
                <p className="text-lg font-bold text-gray-800">{fmt(avg)}</p>
                {dominantUnit && <p className="text-[10px] text-gray-400">per {dominantUnit}</p>}
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-0.5">Highest</p>
                <p className="text-lg font-bold text-red-500">{fmt(max)}</p>
                {dominantUnit && <p className="text-[10px] text-gray-400">per {dominantUnit}</p>}
              </div>
            </div>

            {/* Chart */}
            {filteredHistory.length >= 2 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={filteredHistory} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    tickFormatter={(d: string) => d.slice(5)}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    tickFormatter={(v: number) => `${v.toFixed(2)}€`}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    formatter={(val: number) => [fmt(val), perUnitLabel]}
                    labelFormatter={(label: string) => `Date: ${label}`}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="unitPrice"
                    stroke="#4f46e5"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#4f46e5' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="rounded-xl bg-indigo-50 p-4 text-center text-sm text-indigo-700 mb-4">
                Only 1 purchase so far — scan more receipts to see price trends.
              </div>
            )}

            {/* Purchase list */}
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                All purchases
              </p>
              <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {[...filteredHistory].reverse().map((h, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center py-2 px-2 -mx-2 rounded-lg text-sm cursor-default transition-colors hover:bg-gray-50"
                    >
                      <div className="flex flex-col">
                        <span className="text-gray-700">{h.date}</span>
                        {h.store && <span className="text-xs text-gray-400">{h.store}</span>}
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-gray-900">{fmt(h.unitPrice)}</span>
                        {h.canonicalUnit && <span className="text-xs text-gray-400">/{h.canonicalUnit}</span>}
                        {h.rawQuantity != null && h.rawQuantity > 0 && (
                          <span className="ml-1 text-xs text-gray-400">
                            · {Number(h.rawQuantity).toLocaleString('fi-FI')}{h.rawUnit ? ` ${h.rawUnit}` : ''} total {fmt(h.amount)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
