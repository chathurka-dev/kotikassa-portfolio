// Format a number with the given ISO 4217 currency code — Finnish locale
export function formatCurrency(amount: number, currency: string = 'EUR'): string {
  try {
    return new Intl.NumberFormat('fi-FI', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

// Convenience alias — kept for server components that don't need dynamic currency
export function formatEur(amount: number): string {
  return formatCurrency(amount, 'EUR')
}

// Supported currencies for the family currency picker
export const SUPPORTED_CURRENCIES = [
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'USD', label: 'US Dollar (USD)' },
  { code: 'LKR', label: 'Sri Lankan Rupee (LKR)' },
  { code: 'DKK', label: 'Danish Krone (DKK)' },
] as const

// Parse a string like "2,51" or "2.51" into a float
export function parseAmount(raw: string): number {
  // Replace Finnish decimal comma with dot
  const normalized = raw.replace(',', '.').replace(/[^0-9.]/g, '')
  const value = parseFloat(normalized)
  return isNaN(value) ? 0 : value
}

// Calculate what percentage of budget has been spent
export function budgetPercent(spent: number, budget: number): number {
  if (budget <= 0) return 0
  return Math.min(Math.round((spent / budget) * 100), 100)
}
