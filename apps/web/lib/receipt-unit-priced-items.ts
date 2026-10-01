export interface UnitPricedReceiptItem {
  amount: number
  quantity: number
  unit: string
  unitPrice: number | null
  discountAmount: number | null
  originalPrice: number | null
}

const MAX_CANDIDATES = 16
const MAX_SEARCH_STATES = 5_000

function toCents(value: number): number {
  return Math.round(value * 100)
}

/**
 * Quantity rows such as "2 KPL 0,65 EUR/KPL" describe a per-piece price,
 * while the product row contains the charged line total. Vision models can
 * confuse those two values. Correct only an exact, unambiguous subset whose
 * quantity x explicit unit price closes the printed receipt-total shortfall.
 */
export function reconcileUnitPricedItemAmounts<T extends UnitPricedReceiptItem>(
  items: T[],
  totalAmount: number | null,
): T[] {
  if (totalAmount === null) return items

  const currentTotalCents = items.reduce((sum, item) => sum + toCents(item.amount), 0)
  const targetDeltaCents = toCents(totalAmount) - currentTotalCents
  if (targetDeltaCents <= 0) return items

  const candidates = items
    .map((item, index) => {
      if (
        item.unit !== 'kpl'
        || !Number.isInteger(item.quantity)
        || item.quantity < 2
        || item.quantity > 100
        || item.unitPrice === null
        || item.unitPrice <= 0
        || item.discountAmount !== null
        || item.originalPrice !== null
      ) return null

      const currentAmountCents = toCents(item.amount)
      const unitPriceCents = toCents(item.unitPrice)
      // This reconciler addresses the specific unit-price-as-line-total error.
      // If amount is already different from unitPrice, leave it untouched.
      if (currentAmountCents !== unitPriceCents) return null

      const correctedAmountCents = toCents(item.quantity * item.unitPrice)
      const deltaCents = correctedAmountCents - currentAmountCents
      if (deltaCents <= 0) return null
      return { index, correctedAmountCents, deltaCents }
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)

  if (candidates.length === 0 || candidates.length > MAX_CANDIDATES) return items

  // null marks an ambiguous total reachable by more than one candidate subset.
  const paths = new Map<number, number[] | null>([[0, []]])
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    for (const [delta, selected] of Array.from(paths.entries())) {
      if (selected === null) continue
      const nextDelta = delta + candidates[candidateIndex]!.deltaCents
      const nextSelection = [...selected, candidateIndex]
      if (!paths.has(nextDelta)) paths.set(nextDelta, nextSelection)
      else paths.set(nextDelta, null)
      if (paths.size > MAX_SEARCH_STATES) return items
    }
  }

  const selectedCandidates = paths.get(targetDeltaCents)
  if (!selectedCandidates || selectedCandidates.length === 0) return items

  const corrections = new Map(
    selectedCandidates.map((candidateIndex) => {
      const candidate = candidates[candidateIndex]!
      return [candidate.index, candidate.correctedAmountCents / 100]
    }),
  )

  return items.map((item, index) => {
    const correctedAmount = corrections.get(index)
    return correctedAmount === undefined ? item : { ...item, amount: correctedAmount }
  })
}
