export const RECEIPT_SCAN_QUALITY_SCHEMA_VERSION = 'v1'

export type ScanQualityLevel = 'low' | 'medium' | 'high'
export type ScanQualitySeverity = 'notice' | 'warning' | 'critical'
export type ScanQualityOutcome = 'corrected' | 'dismissed' | 'unresolved'

export type ScanQualityWarningCode =
  | 'store_missing'
  | 'date_missing'
  | 'date_invalid'
  | 'date_future'
  | 'date_unusually_old'
  | 'total_missing'
  | 'total_mismatch'
  | 'duplicate_line'
  | 'non_product_row'
  | 'quantity_arithmetic'
  | 'price_outlier'

export interface ScanQualityItem {
  name: string
  amount: number
  quantity: number
  unit: string
  unitPrice: number | null
  discountAmount: number | null
  originalPrice: number | null
  include?: boolean
  lineIndex?: number
}

export interface ScanPriceContext {
  lineIndex: number
  sampleCount: number
  canonicalUnit: 'kg' | 'l' | 'kpl'
  medianUnitPrice: number
  lowerUnitPrice: number
  upperUnitPrice: number
}

export interface ReceiptScanQualityInput {
  storeName: string | null
  receiptDateRaw: string | null
  receiptDate: string | null
  totalAmount: number | null
  items: ScanQualityItem[]
}

export interface ReceiptScanQualityWarning {
  id: string
  code: ScanQualityWarningCode
  severity: ScanQualitySeverity
  points: number
  entityType: 'receipt' | 'item'
  lineIndex: number | null
  fieldName: 'store_name' | 'receipt_date' | 'total_amount' | 'name' | 'amount' | 'quantity'
  params: Record<string, string | number>
}

export interface ReceiptScanQualityAssessment {
  schemaVersion: typeof RECEIPT_SCAN_QUALITY_SCHEMA_VERSION
  score: number
  level: ScanQualityLevel
  warnings: ReceiptScanQualityWarning[]
}

export interface PersistedScanQualityWarning extends ReceiptScanQualityWarning {
  outcome: ScanQualityOutcome
}

const NON_PRODUCT_ROW =
  /^(?:yhteens[äa]|total|alv|vat|kortti|maksutapa|maksukortti|kanta-asiakas|bonusta|vaihtoraha|debit|credit|tapaht(?:uma)?\.?\s*ok|approved|hyv[äa]ksytty)$/iu

function cents(value: number) {
  return Math.round(value * 100)
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase('fi-FI').replace(/\s+/g, ' ')
}

function canonicalUnitPrice(item: ScanQualityItem) {
  if (!(item.amount > 0) || !(item.quantity > 0)) return null
  const unit = item.unit.toLocaleLowerCase()
  if (unit === 'kg' || unit === 'l' || unit === 'kpl') return item.amount / item.quantity
  if (unit === 'g') return item.amount / (item.quantity / 1000)
  if (unit === 'ml') return item.amount / (item.quantity / 1000)
  if (unit === 'cl') return item.amount / (item.quantity / 100)
  return null
}

function warning(
  code: ScanQualityWarningCode,
  severity: ScanQualitySeverity,
  points: number,
  entityType: 'receipt' | 'item',
  lineIndex: number | null,
  fieldName: ReceiptScanQualityWarning['fieldName'],
  params: ReceiptScanQualityWarning['params'] = {}
): ReceiptScanQualityWarning {
  return {
    id: `${entityType}:${lineIndex ?? 'receipt'}:${fieldName}:${code}`,
    code,
    severity,
    points,
    entityType,
    lineIndex,
    fieldName,
    params,
  }
}

function isoDaysApart(from: string, to: string) {
  return Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000)
}

export function assessReceiptScanQuality(
  receipt: ReceiptScanQualityInput,
  priceContext: ScanPriceContext[] = [],
  today = new Date().toISOString().slice(0, 10)
): ReceiptScanQualityAssessment {
  const warnings: ReceiptScanQualityWarning[] = []
  const includedItems = receipt.items.filter((item) => item.include !== false)

  if (!receipt.storeName?.trim()) {
    warnings.push(warning('store_missing', 'warning', 12, 'receipt', null, 'store_name'))
  }

  if (!receipt.receiptDateRaw?.trim()) {
    warnings.push(warning('date_missing', 'warning', 12, 'receipt', null, 'receipt_date'))
  } else if (!receipt.receiptDate) {
    warnings.push(
      warning('date_invalid', 'critical', 30, 'receipt', null, 'receipt_date', {
        value: receipt.receiptDateRaw,
      })
    )
  } else if (receipt.receiptDate > today) {
    warnings.push(
      warning('date_future', 'critical', 30, 'receipt', null, 'receipt_date', {
        value: receipt.receiptDate,
      })
    )
  } else if (isoDaysApart(receipt.receiptDate, today) > 365 * 5) {
    warnings.push(
      warning('date_unusually_old', 'notice', 8, 'receipt', null, 'receipt_date', {
        value: receipt.receiptDate,
      })
    )
  }

  if (receipt.totalAmount === null) {
    warnings.push(warning('total_missing', 'warning', 18, 'receipt', null, 'total_amount'))
  } else {
    const itemTotal = includedItems.reduce((sum, item) => sum + cents(item.amount), 0)
    const difference = Math.abs(cents(receipt.totalAmount) - itemTotal)
    if (difference >= 2) {
      const severe =
        difference >= 100 || difference / Math.max(cents(receipt.totalAmount), 1) >= 0.1
      warnings.push(
        warning(
          'total_mismatch',
          severe ? 'critical' : 'warning',
          severe ? 35 : 22,
          'receipt',
          null,
          'total_amount',
          {
            receiptTotal: receipt.totalAmount,
            itemTotal: itemTotal / 100,
            difference: difference / 100,
          }
        )
      )
    }
  }

  const signatures = new Map<string, number[]>()
  includedItems.forEach((item, index) => {
    const lineIndex = item.lineIndex ?? index
    const signature = [normalized(item.name), cents(item.amount), item.quantity, item.unit].join(
      '|'
    )
    signatures.set(signature, [...(signatures.get(signature) ?? []), lineIndex])

    if (NON_PRODUCT_ROW.test(item.name.trim())) {
      warnings.push(
        warning('non_product_row', 'critical', 25, 'item', lineIndex, 'name', {
          value: item.name,
        })
      )
    }

    if (
      item.unitPrice !== null &&
      item.discountAmount === null &&
      Math.abs(cents(item.quantity * item.unitPrice) - cents(item.amount)) >= 2
    ) {
      warnings.push(
        warning('quantity_arithmetic', 'warning', 22, 'item', lineIndex, 'quantity', {
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.amount,
          expectedAmount: Math.round(item.quantity * item.unitPrice * 100) / 100,
        })
      )
    }

    const history = priceContext.find((context) => context.lineIndex === lineIndex)
    const currentPrice = canonicalUnitPrice(item)
    if (history && history.sampleCount >= 3 && currentPrice !== null) {
      const low = Math.min(history.medianUnitPrice * 0.4, history.lowerUnitPrice * 0.6)
      const high = Math.max(history.medianUnitPrice * 2.5, history.upperUnitPrice * 1.75)
      if (currentPrice < low || currentPrice > high) {
        warnings.push(
          warning('price_outlier', 'warning', 20, 'item', lineIndex, 'amount', {
            currentUnitPrice: Math.round(currentPrice * 100) / 100,
            medianUnitPrice: Math.round(history.medianUnitPrice * 100) / 100,
            canonicalUnit: history.canonicalUnit,
            sampleCount: history.sampleCount,
          })
        )
      }
    }
  })

  for (const lineIndexes of signatures.values()) {
    if (lineIndexes.length < 2) continue
    for (const lineIndex of lineIndexes.slice(1)) {
      warnings.push(
        warning('duplicate_line', 'notice', 10, 'item', lineIndex, 'name', {
          duplicateCount: lineIndexes.length,
        })
      )
    }
  }

  const score = Math.min(
    100,
    warnings.reduce((sum, item) => sum + item.points, 0)
  )
  return {
    schemaVersion: RECEIPT_SCAN_QUALITY_SCHEMA_VERSION,
    score,
    level: score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low',
    warnings,
  }
}

export function resolveScanQualityWarningOutcomes(
  original: ReceiptScanQualityAssessment,
  finalReceipt: ReceiptScanQualityInput,
  priceContext: ScanPriceContext[],
  dismissed: Record<string, boolean>,
  today = new Date().toISOString().slice(0, 10)
): PersistedScanQualityWarning[] {
  const remaining = new Set(
    assessReceiptScanQuality(finalReceipt, priceContext, today).warnings.map((item) => item.id)
  )
  return original.warnings.map((item) => ({
    ...item,
    outcome: !remaining.has(item.id)
      ? 'corrected'
      : dismissed[item.id]
        ? 'dismissed'
        : 'unresolved',
  }))
}

export function isLowReviewRisk(
  reviewDurationMs: number,
  quality: ReceiptScanQualityAssessment,
  outcomes: PersistedScanQualityWarning[]
) {
  const meaningfulAction = outcomes.some((item) => item.outcome !== 'unresolved')
  return reviewDurationMs < 1500 || (quality.level === 'high' && !meaningfulAction)
}
