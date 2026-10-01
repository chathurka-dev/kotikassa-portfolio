'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { useFormatCurrency } from '@/lib/currency-context'

/** A past item aggregated from expense history, used for quick-add + autocomplete. */
export interface ItemSuggestion {
  name: string
  lastPrice: number
  categoryId: string | null
  count: number
}

interface Props {
  value: string
  onChange: (value: string) => void
  /** Called when the user picks a suggestion from the dropdown. */
  onPick: (suggestion: ItemSuggestion) => void
  suggestions: ItemSuggestion[]
  placeholder?: string
  /** Classes for the <input> itself. Defaults to the app's `input-base`. */
  className?: string
  required?: boolean
  autoFocus?: boolean
  maxMatches?: number
  matches?: ItemSuggestion[]
  showPrice?: boolean
  matchStatus?: 'exact' | 'similar'
  exactMatchLabel?: string
  similarMatchLabel?: string
}

/**
 * Suggestion-aware item-name input shared by the manual "New expense" form and the
 * receipt "Review items" rows. Renders a text input with an autocomplete dropdown of
 * matching past items (showing each item's last price). Picking one calls `onPick`.
 */
export default function ItemNameSuggestInput({ value,
  onChange,
  onPick,
  suggestions,
  placeholder,
  className = 'input-base',
  required,
  autoFocus,
  maxMatches = 6,
  matches: suppliedMatches,
  showPrice = true,
  matchStatus,
  exactMatchLabel,
  similarMatchLabel,
}: Props) {
  const fmt = useFormatCurrency()
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const query = value.trim().toLowerCase()
  const matches = suppliedMatches ?? (query
    ? suggestions
        .filter((s) => s.name.toLowerCase().includes(query) && s.name.toLowerCase() !== query)
        .slice(0, maxMatches)
    : [])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className={className}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      {matchStatus === 'exact' && exactMatchLabel && (
        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          {exactMatchLabel}
        </span>
      )}
      {matchStatus === 'similar' && similarMatchLabel && matches.length > 0 && (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            inputRef.current?.focus()
            setOpen(true)
          }}
          className="mt-1 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 transition hover:bg-indigo-100"
          aria-expanded={open}
        >
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {similarMatchLabel}
        </button>
      )}
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {matches.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(s)
                  setOpen(false)
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm
                           text-gray-700 hover:bg-indigo-50"
              >
                <span className="truncate">{s.name}</span>
                {showPrice && (
                  <span className="flex-shrink-0 text-xs text-gray-400">{fmt(s.lastPrice)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
