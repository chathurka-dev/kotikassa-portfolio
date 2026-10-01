// ============================================================
// Currency context — mirrors apps/web/lib/currency-context.tsx.
// Fetches families.currency once per session (ADR-009).
// ============================================================
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { formatCurrency } from '@kotikassa/shared/native'
import { supabase } from './supabase'
import { useAuth } from './auth-context'

const CurrencyContext = createContext<string>('EUR')

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { familyId } = useAuth()
  const [currency, setCurrency] = useState('EUR')

  useEffect(() => {
    if (!familyId) return
    let mounted = true
    supabase
      .from('families')
      .select('currency')
      .eq('id', familyId)
      .single()
      .then(({ data }) => {
        if (mounted && data?.currency) setCurrency(data.currency)
      })
    return () => {
      mounted = false
    }
  }, [familyId])

  return <CurrencyContext.Provider value={currency}>{children}</CurrencyContext.Provider>
}

export function useCurrency(): string {
  return useContext(CurrencyContext)
}

export function useFormatCurrency(): (amount: number) => string {
  const currency = useContext(CurrencyContext)
  return useCallback((amount: number) => formatCurrency(amount, currency), [currency])
}
