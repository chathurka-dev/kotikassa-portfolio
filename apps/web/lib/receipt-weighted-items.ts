export interface WeightedReceiptItem {
  name: string
  amount: number
  quantity: number
  unit: string
  discountAmount: number | null
  originalPrice: number | null
}

const EMBEDDED_PACK_SIZE = /\b\d+(?:[.,]\d+)?\s*(?:kg|g)\b/iu
const MAX_CANDIDATES = 16
const MAX_SEARCH_STATES = 5_000

function toCents(value: number): number {
  return Math.round(value * 100)
}

/**
 * Loose weighted products print a line total followed by a weight and EUR/kg.
 * Vision models occasionally return the EUR/kg value as `amount`. We correct
 * only when an exact subset of plausible loose-weight rows makes the sum of
 * all item amounts equal the printed receipt total. Packaged products whose
 * names contain sizes such as 275G are excluded.
 */
export function reconcileWeightedItemAmounts<T extends WeightedReceiptItem>(
  items: T[],
  totalAmount: number | null,
): T[] {
  if (totalAmount === null) return items

  const currentTotalCents = items.reduce((sum, item) => sum + toCents(item.amount), 0)
  const targetDeltaCents = toCents(totalAmount) - currentTotalCents
  if (targetDeltaCents === 0) return items

  const candidates = items
    .map((item, index) => {
      if (
        item.unit !== 'kg'
        || item.quantity <= 0
        || item.quantity > 20
        || item.amount <= 0
        || item.discountAmount !== null
        || item.originalPrice !== null
        || EMBEDDED_PACK_SIZE.test(item.name)
      ) return null

      const correctedAmountCents = toCents(item.amount * item.quantity)
      const currentAmountCents = toCents(item.amount)
      const deltaCents = correctedAmountCents - currentAmountCents
      if (correctedAmountCents <= 0 || deltaCents === 0) return null

      return { index, correctedAmountCents, deltaCents }
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)

  if (candidates.length === 0 || candidates.length > MAX_CANDIDATES) return items

  const paths = new Map<number, number[]>([[0, []]])
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    for (const [delta, selected] of Array.from(paths.entries())) {
      const nextDelta = delta + candidates[candidateIndex]!.deltaCents
      if (!paths.has(nextDelta)) paths.set(nextDelta, [...selected, candidateIndex])
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
