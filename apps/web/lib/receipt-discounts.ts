export interface DiscountedReceiptItem {
  amount: number
  discountAmount: number | null
  originalPrice: number | null
}

function toCents(value: number): number {
  return Math.round(value * 100)
}

/**
 * Some receipts print a gross product-line total and put its discount on the
 * next line. If the model returns those gross line totals as item amounts, the
 * sum of items exceeds YHTEENSÄ by exactly the sum of discounts. Only in that
 * unambiguous case do we convert each discounted line to its paid amount.
 */
export function reconcileDiscountedItemAmounts<T extends DiscountedReceiptItem>(
  items: T[],
  totalAmount: number | null,
): T[] {
  if (totalAmount === null) return items

  const itemTotalCents = items.reduce((sum, item) => sum + toCents(item.amount), 0)
  const receiptTotalCents = toCents(totalAmount)
  if (itemTotalCents === receiptTotalCents) return items

  const discountTotalCents = items.reduce(
    (sum, item) => sum + (item.discountAmount === null ? 0 : toCents(item.discountAmount)),
    0,
  )
  if (discountTotalCents <= 0 || itemTotalCents - discountTotalCents !== receiptTotalCents) {
    return items
  }

  return items.map((item) => {
    if (item.discountAmount === null) return item
    const originalPriceCents = toCents(item.amount)
    const paidAmountCents = originalPriceCents - toCents(item.discountAmount)
    if (paidAmountCents <= 0) return item
    return {
      ...item,
      amount: paidAmountCents / 100,
      originalPrice: originalPriceCents / 100,
    }
  })
}
