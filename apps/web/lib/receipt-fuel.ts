export interface FuelReceiptItem {
  name: string
  amount: number
  quantity: number
  unit: string
}

const FUEL_NAME = /\b(?:95\s*E10|98\s*E5|E10|E5|diesel|dieseli|bensiini|polttoaine)\b/i

function roundToHundredths(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Fuel receipts commonly print: litres, EUR/litre, and charged total. Vision
 * models sometimes put the middle value into quantity. For fuel lines only,
 * recover litres when the supplied "quantity" is a plausible unit price and
 * the reconstructed total matches to normal receipt rounding tolerance.
 */
export function reconcileFuelQuantities<T extends FuelReceiptItem>(items: T[]): T[] {
  return items.map((item) => {
    if (item.unit !== 'l' || !FUEL_NAME.test(item.name)) return item
    if (item.amount < 5 || item.quantity < 0.5 || item.quantity > 5) return item

    const litres = roundToHundredths(item.amount / item.quantity)
    if (litres < 3 || litres > 200) return item

    const reconstructedTotal = roundToHundredths(litres * item.quantity)
    if (Math.abs(reconstructedTotal - roundToHundredths(item.amount)) > 0.02) return item

    return { ...item, quantity: litres }
  })
}
