'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { createClient } from '@kotikassa/shared'
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
  itemName: string
  familyId: string
  onClose: () => void
}

export default function PriceHistoryModal({ itemName, familyId, onClose }: Props) {
  const fmt = useFormatCurrency()
  const [history, setHistory] = useState<PricePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStore, setSelectedStore] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ store: string; x: number; y: number } | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('expense_items')
        .select('amount, quantity, unit, expense_date, receipts(store_name)')
        .eq('family_id', familyId)
        .ilike('name', itemName)
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
    load()
  }, [itemName, familyId, supabase])

  // Unique stores for the filter chips
  const stores = Array.from(new Set(history.map((h) => h.store).filter(Boolean))) as string[]

  // Apply store filter to everything — stats, graph, list
  const filtered = selectedStore ? history.filter((h) => h.store === selectedStore) : history

  const unitPrices = filtered.map((h) => h.unitPrice)
  const min = unitPrices.length ? Math.min(...unitPrices) : 0
  const max = unitPrices.length ? Math.max(...unitPrices) : 0
  const avg = unitPrices.length ? unitPrices.reduce((s, a) => s + a, 0) / unitPrices.length : 0

  // Round to 2 decimal places before comparing — unitPrice is amount/quantity so
  // floating-point gives tiny non-zero diffs (e.g. 0.000134) even for identical prices.
  const latestChange = filtered.length >= 2
    ? Math.round((filtered[filtered.length - 1]!.unitPrice - filtered[filtered.length - 2]!.unitPrice) * 100) / 100
    : null

  // Dominant canonical unit — because unitPrice is normalized (g→kg, ml→l),
  // all weight rows share 'kg' and all volume rows share 'l', so mixed-unit
  // items (100 g one trip, 0.192 kg another) display and compare correctly.
  const canonicals = filtered.map((h) => h.canonicalUnit).filter(Boolean) as string[]
  const dominantUnit = canonicals.length > 0
    ? [...canonicals].sort((a, b) =>
        canonicals.filter(u => u === b).length - canonicals.filter(u => u === a).length
      )[0] ?? null
    : null

  // Padded Y domain — prevents Recharts from compressing the axis to sub-cent range
  // when all prices are equal, which causes the monotone curve to look non-flat.
  const yPad = Math.max((max - min) * 0.25, max * 0.05, 0.05)
  const yDomain: [number, number] = [Math.max(0, min - yPad), max + yPad]

  const hasQuantity = filtered.some((h) => h.rawQuantity != null && h.rawQuantity > 0)
  const perUnitLabel = dominantUnit ? `€/${dominantUnit}` : hasQuantity ? '€/unit' : '€'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed-position store tooltip — outside overflow so it's never clipped */}
        {tooltip && (
          <div
            className="fixed z-[60] pointer-events-none whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-xs text-white shadow-lg"
            style={{ top: tooltip.y - 36, left: tooltip.x, transform: 'translateX(-50%)' }}
          >
            {tooltip.store}
          </div>
        )}
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{itemName}</h2>
            <p className="text-sm text-gray-400">
              {loading ? 'Loading…' : `${filtered.length}${selectedStore ? '' : ` of ${history.length}`} purchase${filtered.length !== 1 ? 's' : ''}${selectedStore ? ` · ${selectedStore}` : ''}`}
              {latestChange !== null && latestChange !== 0 && (
                <span className={`ml-2 font-medium ${latestChange > 0 ? 'text-red-500' : 'text-green-600'}`}>
                  {latestChange > 0 ? '▲' : '▼'} {fmt(Math.abs(latestChange))}{dominantUnit ? `/${dominantUnit}` : ''} since last
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="h-52 flex items-center justify-center text-gray-400 text-sm">
            Loading price history…
          </div>
        ) : history.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-gray-400 text-sm">
            No purchase history found for this item.
          </div>
        ) : (
          <>
            {/* Store filter chips — only shown when multiple stores exist */}
            {stores.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-4">
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
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-0.5">Lowest</p>
                <p className="text-base font-bold text-green-600">{fmt(min)}</p>
                {dominantUnit && <p className="text-[10px] text-gray-400">per {dominantUnit}</p>}
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-0.5">Average</p>
                <p className="text-base font-bold text-gray-800">{fmt(avg)}</p>
                {dominantUnit && <p className="text-[10px] text-gray-400">per {dominantUnit}</p>}
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-0.5">Highest</p>
                <p className="text-base font-bold text-red-500">{fmt(max)}</p>
                {dominantUnit && <p className="text-[10px] text-gray-400">per {dominantUnit}</p>}
              </div>
            </div>

            {/* Chart */}
            {filtered.length >= 2 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={filtered} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    tickFormatter={(d: string) => d.slice(5)}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    tickFormatter={(v: number) => `${v.toFixed(2)}€`}
                    domain={yDomain}
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
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#4f46e5' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="rounded-xl bg-indigo-50 p-4 text-center text-sm text-indigo-700">
                Only 1 purchase so far — scan more receipts to see price trends.
              </div>
            )}

            {/* Purchase history list */}
            <div className="mt-4 max-h-36 overflow-y-auto divide-y divide-gray-100">
              {[...filtered].reverse().map((h, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center py-1.5 px-2 -mx-2 rounded-lg text-sm cursor-default transition-colors hover:bg-gray-50"
                    onMouseEnter={(e) => h.store && setTooltip({ store: h.store, x: e.clientX, y: e.clientY })}
                    onMouseMove={(e) => h.store && setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <div>
                      <span className="text-gray-700">{h.date}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-medium text-gray-900">{fmt(h.unitPrice)}</span>
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
          </>
        )}
      </div>
    </div>
  )
}
