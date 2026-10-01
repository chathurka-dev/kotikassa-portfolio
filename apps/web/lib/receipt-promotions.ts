export interface PromotionReceiptItem {
  name: string
  amount: number
  quantity: number
  unit: string
  discountAmount: number | null
  originalPrice: number | null
}

// K-Group prints repeated bundle offers as pricing metadata immediately before
// the purchased product, for example "2*PLUSSA-TASAERÄ 2 KPL/1,00 EUR".
// The model may miss one "A" in TASAERÄ, so accept both TASAERÄ and TASERÄ.
const REPEATED_PLUSSA_BUNDLE = /^\s*(\d+)\s*\*\s*(?:PLUSSA[-\s]*)?TAS(?:A)?ER[ÄA](?:\s|$)/i

function toCents(value: number): number {
  return Math.round(value * 100)
}

/**
 * Merge a falsely emitted K-Group bundle-offer row into its following product.
 * The merge is intentionally strict: the offer's paid amount plus discount
 * must exactly equal the following product's gross line total.
 */
export function reconcileKGroupPromotionRows<T extends PromotionReceiptItem>(items: T[]): T[] {
  const reconciled: T[] = []

  for (let index = 0; index < items.length; index += 1) {
    const promotion = items[index]!
    const match = promotion.name.match(REPEATED_PLUSSA_BUNDLE)
    const product = items[index + 1]

    if (!match || !product || promotion.unit !== 'kpl') {
      reconciled.push(promotion)
      continue
    }

    const repetitions = Number.parseInt(match[1]!, 10)
    const discountCents = promotion.discountAmount === null
      ? 0
      : toCents(promotion.discountAmount)
    const paidCents = toCents(promotion.amount)
    const productGrossCents = toCents(product.amount)
    const offerOriginalCents = promotion.originalPrice === null
      ? productGrossCents
      : toCents(promotion.originalPrice)

    const validQuantity = repetitions > 0 && promotion.quantity > 0
    const validPriceLink = discountCents > 0
      && paidCents + discountCents === productGrossCents
      && offerOriginalCents === productGrossCents
    const productHasNoSeparateDiscount = product.discountAmount === null
      && product.originalPrice === null

    if (!validQuantity || !validPriceLink || !productHasNoSeparateDiscount) {
      reconciled.push(promotion)
      continue
    }

    reconciled.push({
      ...product,
      amount: paidCents / 100,
      quantity: repetitions * promotion.quantity,
      unit: 'kpl',
      discountAmount: discountCents / 100,
      originalPrice: productGrossCents / 100,
    })
    index += 1
  }

  return reconciled
}
