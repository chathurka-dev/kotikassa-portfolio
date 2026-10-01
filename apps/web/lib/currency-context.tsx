'use client'

import { createContext, useCallback, useContext } from 'react'
import { formatCurrency } from '@kotikassa/shared'

const CurrencyContext = createContext<string>('EUR')

export function CurrencyProvider({
  currency,
  children,
}: {
  currency: string
  children: React.ReactNode
}) {
  return (
    <CurrencyContext.Provider value={currency}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency(): string {
  return useContext(CurrencyContext)
}

/** Returns a stable formatter bound to the family's currency. Re-creates only when currency changes. */
export function useFormatCurrency(): (amount: number) => string {
  const currency = useCurrency()
  return useCallback((amount: number) => formatCurrency(amount, currency), [currency])
}
