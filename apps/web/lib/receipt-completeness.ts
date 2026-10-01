interface ReceiptAmountItem {
  amount: number
}

interface ReceiptAmounts {
  totalAmount: number | null
  items: ReceiptAmountItem[]
}

const MIN_AUDIT_SHORTFALL_CENTS = 2

function toCents(value: number): number {
  return Math.round(value * 100)
}

export function itemTotalCents(receipt: ReceiptAmounts): number {
  return receipt.items.reduce((total, item) => total + toCents(item.amount), 0)
}

/**
 * Returns a positive shortfall when purchased item totals are below the printed
 * receipt total. Overages are intentionally ignored: they can be caused by
 * excluded negative bottle-return rows and should not trigger another model call.
 */
export function receiptShortfallCents(receipt: ReceiptAmounts): number {
  if (receipt.totalAmount === null) return 0
  return Math.max(0, toCents(receipt.totalAmount) - itemTotalCents(receipt))
}

export function needsCompletenessAudit(receipt: ReceiptAmounts): boolean {
  return receiptShortfallCents(receipt) >= MIN_AUDIT_SHORTFALL_CENTS
}

/**
 * The first pass's printed total is the audit anchor. An audit is accepted only
 * when it keeps at least as many lines and brings their sum closer to that total.
 */
export function isCompletenessAuditImprovement(
  first: ReceiptAmounts,
  audit: ReceiptAmounts
): boolean {
  if (first.totalAmount === null || audit.items.length < first.items.length) return false

  const target = toCents(first.totalAmount)
  const firstDifference = Math.abs(target - itemTotalCents(first))
  const auditDifference = Math.abs(target - itemTotalCents(audit))
  return auditDifference < firstDifference
}
