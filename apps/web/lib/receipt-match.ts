export interface MatchReceipt {
  storeName: string | null
  receiptDate: string | null
  totalAmount: number | null
}

export interface MatchItem {
  id?: string
  name: string
  amount: number
  quantity?: number | null
  unit?: string | null
  originalPrice?: number | null
}

export interface ItemMatch {
  existingIndex: number
  scannedIndex: number
  confidence: number
  exactAmount: boolean
  exactName: boolean
  similarName: boolean
  quantityMatches: boolean
}

export interface ReceiptMatchResult {
  verified: boolean
  matches: ItemMatch[]
  unmatchedExisting: number[]
  unmatchedScanned: number[]
  storeMatches: boolean
  dateMatches: boolean
  totalMatches: boolean
  existingTotal: number
  scannedItemsTotal: number
}

const cents = (value: number) => Math.round(value * 100)

function normalizeText(value: string | null): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fi')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function nameSimilarity(left: string, right: string): number {
  const a = normalizeText(left)
  const b = normalizeText(right)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.9

  const aTokens = new Set(a.split(' '))
  const bTokens = new Set(b.split(' '))
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length
  const union = new Set([...aTokens, ...bTokens]).size
  const tokenSimilarity = union === 0 ? 0 : intersection / union

  // OCR mistakes often change one or two characters inside a product token
  // (for example CHIOUITA -> CHIQUITA). Token equality alone treats those as
  // completely different words, so also compare the normalized full strings.
  const rows = Array.from({ length: a.length + 1 }, (_, index) => index)
  for (let rightIndex = 1; rightIndex <= b.length; rightIndex++) {
    let diagonal = rows[0]!
    rows[0] = rightIndex
    for (let leftIndex = 1; leftIndex <= a.length; leftIndex++) {
      const previousRow = rows[leftIndex]!
      rows[leftIndex] = Math.min(
        rows[leftIndex]! + 1,
        rows[leftIndex - 1]! + 1,
        diagonal + (a[leftIndex - 1] === b[rightIndex - 1] ? 0 : 1),
      )
      diagonal = previousRow
    }
  }
  const characterSimilarity = 1 - rows[a.length]! / Math.max(a.length, b.length)

  return Math.max(tokenSimilarity, characterSimilarity)
}

function normalizedQuantity(item: MatchItem): { quantity: number | null; unit: string | null } {
  if (item.quantity == null || !item.unit) return { quantity: null, unit: null }
  const unit = item.unit.toLocaleLowerCase('fi')
  if (unit === 'g') return { quantity: item.quantity / 1000, unit: 'kg' }
  if (unit === 'ml') return { quantity: item.quantity / 1000, unit: 'l' }
  if (unit === 'cl') return { quantity: item.quantity / 100, unit: 'l' }
  return { quantity: item.quantity, unit }
}

function quantitiesMatch(left: MatchItem, right: MatchItem): boolean {
  const a = normalizedQuantity(left)
  const b = normalizedQuantity(right)
  if (a.quantity == null || b.quantity == null) return true
  return a.unit === b.unit && Math.abs(a.quantity - b.quantity) <= 0.001
}

function scoreItem(existing: MatchItem, scanned: MatchItem) {
  const exactAmount = cents(existing.amount) === cents(scanned.amount)
  const exactName = normalizeText(existing.name) === normalizeText(scanned.name)
  const similarity = nameSimilarity(existing.name, scanned.name)
  const similarName = similarity >= 0.5
  const quantityMatches = quantitiesMatch(existing, scanned)
  const originalPriceMatches = existing.originalPrice == null || scanned.originalPrice == null
    || cents(existing.originalPrice) === cents(scanned.originalPrice)
  const confidence = (exactAmount ? 0.55 : 0) + similarity * 0.35
    + (quantityMatches ? 0.07 : 0) + (originalPriceMatches ? 0.03 : 0)
  return { confidence, exactAmount, exactName, similarName, quantityMatches }
}

export function compareReceipt(
  existingReceipt: MatchReceipt,
  existingItems: MatchItem[],
  scannedReceipt: MatchReceipt,
  scannedItems: MatchItem[],
): ReceiptMatchResult {
  const candidates = existingItems.flatMap((existing, existingIndex) =>
    scannedItems.map((scanned, scannedIndex) => ({
      existingIndex,
      scannedIndex,
      ...scoreItem(existing, scanned),
    })),
  ).sort((a, b) => b.confidence - a.confidence)

  const usedExisting = new Set<number>()
  const usedScanned = new Set<number>()
  const matches: ItemMatch[] = []
  for (const candidate of candidates) {
    if (candidate.confidence < 0.72) break
    if (usedExisting.has(candidate.existingIndex) || usedScanned.has(candidate.scannedIndex)) continue
    usedExisting.add(candidate.existingIndex)
    usedScanned.add(candidate.scannedIndex)
    matches.push(candidate)
  }

  const unmatchedExisting = existingItems.map((_, index) => index).filter((index) => !usedExisting.has(index))
  const unmatchedScanned = scannedItems.map((_, index) => index).filter((index) => !usedScanned.has(index))
  const existingTotal = existingItems.reduce((sum, item) => sum + item.amount, 0)
  const scannedItemsTotal = scannedItems.reduce((sum, item) => sum + item.amount, 0)
  const storeMatches = !existingReceipt.storeName || !scannedReceipt.storeName
    || normalizeText(existingReceipt.storeName) === normalizeText(scannedReceipt.storeName)
  const dateMatches = !existingReceipt.receiptDate || !scannedReceipt.receiptDate
    || existingReceipt.receiptDate === scannedReceipt.receiptDate
  const scannedTotal = scannedReceipt.totalAmount ?? scannedItemsTotal
  const expectedTotal = existingReceipt.totalAmount ?? existingTotal
  const totalMatches = Math.abs(cents(scannedTotal) - cents(expectedTotal)) <= 2
  const everyMatchIsStrong = matches.every((match) => match.exactAmount && match.exactName && match.quantityMatches)

  return {
    verified: existingItems.length > 0 && unmatchedExisting.length === 0
      && unmatchedScanned.length === 0 && everyMatchIsStrong
      && storeMatches && dateMatches && totalMatches,
    matches: matches.sort((a, b) => a.existingIndex - b.existingIndex),
    unmatchedExisting,
    unmatchedScanned,
    storeMatches,
    dateMatches,
    totalMatches,
    existingTotal,
    scannedItemsTotal,
  }
}
