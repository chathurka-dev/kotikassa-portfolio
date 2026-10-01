export interface QuantityDetailReceiptItem {
  name: string
  amount: number
  quantity: number
  unit: string
  unitPrice: number | null
  discountAmount: number | null
  originalPrice: number | null
}

const QUANTITY_ONLY_NAME = /^\s*(\d+(?:[.,]\d+)?)\s*(kpl|kg|g|l|ml|cl)\s*$/iu

function toCents(value: number): number {
  return Math.round(value * 100)
}

function normalizedUnit(value: string): string {
  return value.trim().toLocaleLowerCase('fi-FI')
}

/**
 * Some models emit a receipt's quantity detail row as a second product, e.g.
 * MANSIKKATUUTTI 2,78 followed by "2 KPL 1,39 EUR/KPL". Merge an exact
 * quantity-only row into its preceding product and remove the duplicate only
 * when the resulting item sum equals the printed receipt total.
 */
export function reconcileQuantityDetailRows<T extends QuantityDetailReceiptItem>(
  items: T[],
  totalAmount: number | null,
): T[] {
  if (totalAmount === null) return items

  const reconciled: T[] = []
  let mergedAny = false

  for (const item of items) {
    const match = item.name.match(QUANTITY_ONLY_NAME)
    const previous = reconciled.at(-1)
    if (!match || !previous || item.discountAmount !== null || item.originalPrice !== null) {
      reconciled.push(item)
      continue
    }

    const printedQuantity = Number.parseFloat(match[1]!.replace(',', '.'))
    const printedUnit = normalizedUnit(match[2]!)
    const quantityMatches = Math.abs(item.quantity - printedQuantity) < 0.000_001
    const unitMatches = normalizedUnit(item.unit) === printedUnit
    const previousAmountCents = toCents(previous.amount)
    const duplicatesPreviousTotal = toCents(item.amount) === previousAmountCents
    const unitArithmeticMatchesPrevious = item.unitPrice !== null
      && toCents(printedQuantity * item.unitPrice) === previousAmountCents

    if (
      !quantityMatches
      || !unitMatches
      || (!duplicatesPreviousTotal && !unitArithmeticMatchesPrevious)
    ) {
      reconciled.push(item)
      continue
    }

    reconciled[reconciled.length - 1] = {
      ...previous,
      quantity: printedQuantity,
      unit: printedUnit,
      unitPrice: item.unitPrice ?? previous.unitPrice,
    }
    mergedAny = true
  }

  if (!mergedAny) return items

  const reconciledTotalCents = reconciled.reduce((sum, item) => sum + toCents(item.amount), 0)
  return reconciledTotalCents === toCents(totalAmount) ? reconciled : items
}
