interface ReceiptItem {
  name: string
  amount: number
  quantity: number
  unit: string
  discountAmount: number | null
  originalPrice: number | null
}

const TERMINAL_CONFIRMATION_PATTERN = /^(?:tapah(?:t(?:uma)?)?\.?\s*ok|approved|hyväksytty)$/iu

function isTerminalConfirmation(name: string): boolean {
  return TERMINAL_CONFIRMATION_PATTERN.test(name.trim())
}

/**
 * Payment-terminal slips sometimes contain only a merchant, an OSTO amount,
 * and an approval status such as "TAPAHT. OK". The status is not a product.
 * If real product rows exist, discard the status row. If it is the only row,
 * retain the charged amount under the truthful generic receipt label "OSTO".
 */
export function reconcilePaymentTerminalItems<T extends ReceiptItem>(items: T[]): T[] {
  const hasConfirmation = items.some((item) => isTerminalConfirmation(item.name))
  if (!hasConfirmation) return items

  const productItems = items.filter((item) => !isTerminalConfirmation(item.name))
  if (productItems.length > 0) return productItems

  return items.map((item) => ({
    ...item,
    name: 'OSTO',
    quantity: 1,
    unit: 'kpl',
    discountAmount: null,
    originalPrice: null,
  }))
}
