// ============================================================
// Finnish receipt parser
// Extracts store name, date, and line items from raw Tesseract output.
//
// Tested against: S-Market, K-Market, K-Supermarket, Lidl, Prisma, Tokmanni, Normal
// Finnish receipts use comma as decimal separator: 1,99
// ============================================================

export interface ParsedItem {
  name: string
  amount: number
  quantity?: number
  unit?: string          // 'kg' | 'l' | 'kpl' | 'pss' | 'pk' | 'pkt'  (g→kg, ml/cl→l on extract)
  discountAmount?: number  // monetary discount applied (e.g. 27.48)
  originalPrice?: number   // pre-discount price = amount + discountAmount
  rawLine: string
}

export interface ParsedReceipt {
  storeName: string
  receiptDate: string | null  // ISO date string YYYY-MM-DD or null if not found
  items: ParsedItem[]
  rawText: string
}

// ── Lines to skip entirely ───────────────────────────────────────────────────
// These appear on Finnish receipts but are not expense items.
const SKIP_PATTERNS = [
  /^yhteens[äa]/i,          // YHTEENSÄ (total)
  /^alv[\s\t]/i,            // ALV (VAT breakdown header)
  /^alv$/i,                 // ALV alone
  /^bonust?a/i,             // BONUSTA (loyalty points)
  /^j[äa]sennumero/i,       // Jäsennumero (member number)
  /^bonustapahtuma/i,       // Bonustapahtuma (bonus event)
  /^kuitti\b/i,             // Kuitti (receipt number line)
  /^s-etuna/i,              // S-etuna (S-group benefit)
  /^k-plussa/i,             // K-Plussa (K-group loyalty)
  /^kanta-asiakas/i,         // KANTA-ASIAKAS (K-group loyalty card section header)
  /^plussaa\s+kerr/i,        // PLUSSAA KERRYTTÄVÄT OSTOT (K-Plus points accumulation — not an item)
  /^maksutapa/i,            // Maksutapa (payment method)
  /^maksukortti/i,           // Maksukortti (payment card amount line — pharmacy/service receipts)
  /^korttitapahtuma/i,      // Korttitapahtuma (card transaction)
  /^kortti\s*:/i,           // Kortti: Visa Debit etc.
  /^sovellus\s*:/i,         // Sovellus: (card application)
  /^tap\.?\s*nro/i,         // Tap.nro (transaction number)
  /^yritys\s*\/\s*ala/i,    // Yritys/Ala (merchant category)
  /^kassa/i,                // Kassa (cashier)
  /^myym[äa]l[äa]/i,        // Myymälä (store number)
  /^puh\./i,                // Puh. (phone)
  /\bpuh\.\s*\+/i,         // Phone with OCR noise prefix: "s Puh. +358 ..." → country-code lines
  /^www\./i,                // Web address
  /^tosite\b/i,              // Tosite (receipt reference number — Normal/Scandinavian stores)
  /^henkil/i,                // Henkil (cashier ID line — Normal stores)
  /^trans\.?\s+\d/i,          // Trans. 183320 (transaction number — Normal stores)
  /^[£¥]\s/,                 // OCR misread of ALV tax-category letter: "E 25,5" → "£ 0..."
  /^\*{4}/,                  // **** card number fragments
  /^\d{4}\s*\d{4}\s*\d{4}/, // Card number fragments
  /^veroton/i,              // Veroton (tax-exclusive)
  /^verollinen/i,           // Verollinen (tax-inclusive)
  /^viite\s*:/i,            // Viite: (reference)
  /^viite$/i,
  /^saatu/i,                // Saatu (received)
  /^palautunut/i,           // Palautunut (refunded)
  /^takaisinmaksu/i,        // Takaisinmaksu
  /^debit\s*\/?\s*veloitus/i, // Debit/Veloitus (payment line)
  /^visa\s/i,               // Visa Contactless etc.
  /^asiakasomistajan/i,     // Asiakasomistajan edut (member benefit notice)
  /edut.*huomioitu/i,       // Catches OCR misreads of ASIAKASOMISTAJAN (e.g. ASTAKASOMISTAJAN)
  /^osuuskauppa/i,          // Osuuskauppa (co-op name footer)
  /^y-tunnus/i,             // Y-tunnus (business ID)
  /^pl\s+\d/i,              // PL 1 50101 (P.O. Box)
  /^kauppatie/i,            // Street address lines
  /^\(\d{6}/,               // Barcode-like numbers (524880-...)
  /^\d{4,}\s+\d+\s*x\s*\d/i, // Pharmacy qty line: "456953 1 x 18,91" (code, qty, x, price) — not a PLU-coded item like "4011 BANAANI 1,45"
  /^pankki\s*:/i,           // Pankki: (bank payment section header — Motonet/terminal receipts)
  /^osto\b/i,               // OSTO EUR (transaction type confirmation line)
  /^tapaht/i,               // TAPAHT. OK (transaction OK)
  /^er[äa]\s*:/i,           // Erä: 184 (batch/instalment number)
  /^p[äa][äa]te\s*:/i,      // Pääte: (payment terminal ID)
  /^aid\s*:/i,              // AID: (card application identifier)
  /^atc\s*:/i,              // ATC: (application transaction counter)
  /^tsi\s*:/i,              // TSI: (transaction status indicator)
  /^resp\s*:/i,             // Resp: 00 (response code)
  /^asiakastilaus/i,        // Asiakastilaus: (customer order ref — Motonet)
  /^\d{1,2}\/\d{1,2}\/\d{4}/, // DD/MM/YYYY slash-format date (terminal section)
  /^\d{5,}$/,               // Standalone PLU/barcode code (5+ digits, nothing else)
  /^\d[\d\s,.]+\d[,.]\d*\s*%/, // VAT data rows: "41.27 25.5% 10.52" (starts with digit, contains decimal%)
  /^\d+[,.]?\d*\s*%/,       // VAT percentage rows that START with a number (e.g. "14% 52,50")
  /^^\s*$/,                 // Empty lines
]

// Lines with 3+ price-like numbers are VAT breakdown rows (e.g. "6  13,50  8,28  1,12  9,40")
function isVatBreakdownLine(line: string): boolean {
  const matches = line.match(/\d+[,.]\d{2}/g)
  return (matches?.length ?? 0) >= 3
}

// "Apteekki" alone doesn't identify which pharmacy — unlike branded retail chains, keep a
// preceding qualifier word (e.g. "Sulkavan Apteekki") instead of stripping it as OCR junk.
const APTEEKKI_PATTERN = /apteekki/i

// Known Finnish store name patterns — used for reliable store extraction
const KNOWN_STORE_PATTERNS = [
  /s-market/i,
  /k-market/i,
  /k-supermarket/i,
  /citymarket/i,
  /prisma/i,
  /lidl/i,
  /tokmanni/i,
  /alepa/i,
  /r-kioski/i,
  /stockmann/i,
  /m[- ]?kaupp/i,
  /valintatalo/i,
  APTEEKKI_PATTERN,         // Finnish pharmacies: Sulkavan Apteekki, Yliopiston Apteekki, etc.
  /motonet/i,               // Motonet (hardware/automotive chain)
  /^normal\b/i,             // Normal (Scandinavian discount chain)
]

// Matches a Finnish price at the end of a line: 1,99 or 12,40 or 5,7 (torn edge)
// Accepts 1–2 decimal digits so receipts with torn right edges still parse.
const PRICE_AT_END = /(-?\d{1,4}[,\.]\d{1,2})\s*[€]?\s*$/

// Matches a Finnish date: 12.11.2024 or 1.2.24
const DATE_PATTERN = /\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/

// Matches weight lines: "1,234 kg" or "2 KPL" or "3 l"
const QTY_PATTERN = /^(\d+[,\.]?\d*)\s*(kg|kpl|l|g|cl|ml|pss|pk|pkt)\s*(?:\d[,.\d]*\s*[€e]?\/\w+)?\s*$/i

// Matches weight/unit embedded at the end of an item name: "MANSIKKA 500 G", "JUUSTO1KG".
// \s* (not \s+) handles fused OCR output where Tesseract omits the space before the digits.
const EMBEDDED_QTY = /\s*(\d+[,.]?\d*)\s*(kg|g|l|cl|ml|kpl|pss|pk|pkt)\s*$/i

// Matches a line that is ONLY a price — handles long product names that OCR
// splits across two lines with the price landing on the second line alone.
// e.g. line 1: "PINGUI VÄLIPALAPATUKKA"  line 2: "0,98"
const STANDALONE_PRICE = /^\s*(-?\d{1,4}[,\.]\d{1,2})\s*[€]?\s*$/

// Matches Finnish discount lines that carry a negative price.
// e.g. "Kampanja -50%  -27,48"  "ASIAKASOMISTAJA-ALENNUS  -2,60"  "Ale -1,00"
// The negative monetary amount is capture group 1.
const DISCOUNT_LINE = /(?:kampanja|alennus|ale\b|rabatt|hinnanalennus|s[\u00e4a][\u00e4a]st[\u00f6o]|discount).*?(-\d{1,4}[,\.]\d{1,2})\s*[\u20ac]?\s*$/i

// Matches "Norm." / "Normaalihinta" lines — the original (pre-discount) price printed
// by some Finnish stores (S-Market, K-Market) directly below a discounted item.
// e.g. "Norm.    13,49"  "Normaalihinta  5,99"
const NORM_PRICE_LINE = /^norm(?:aalihinta)?\.?\s*(?=\d)/i


/** True if a line looks like a product name (not a price, not a skip pattern) */
function looksLikeProductName(line: string): boolean {
  if (!line || line.length < 2 || line.length > 70) return false
  if (SKIP_PATTERNS.some((p) => p.test(line))) return false
  if (PRICE_AT_END.test(line)) return false
  if (/^\d/.test(line)) return false
  const letterCount = (line.match(/[a-zA-ZäöåÄÖÅ]/g) ?? []).length
  return letterCount >= 2
}

/**
 * Fix OCR misreads in price positions at the end of a line.
 * Torn receipt edges cause two common problems:
 *   1. Decimal comma read as a space:  "5 70%"  → "5,70"
 *   2. Trailing noise characters:      "5,70|"  → "5,70"
 */
function normalizeLinePrices(line: string): string {
  return line
    .replace(/(\d) (\d{1,2})\s*[%|Il!)\]>]?\s*$/, '$1,$2')  // "5 70%" → "5,70"
    .replace(/[%|Il!)\]>]{1,3}$/, '')                          // strip remaining noise
    // Strip trailing PLU/article codes after a price so PRICE_AT_END can find the price.
    // e.g. "VARTA 5,99768365" or "VARTA 5,99 768365" → "VARTA 5,99"
    // Requires 5+ digits to avoid stripping years (2026) or other short numbers.
    .replace(/(\d{1,4}[,.]\d{1,2})\s*\d{5,}\s*$/, '$1')
    // Strip trailing single-letter VAT tax code (A–F) that some stores
    // (Normal, Scandinavian chains) append after each item price.
    // e.g. "MILKA OREO 100G  1,00  F" → "MILKA OREO 100G  1,00"
    // Using \s+ (not \s*) avoids stripping units fused to a number like "3G".
    .replace(/(\d{1,4}[,.]\d{1,2})\s+[A-F]\s*$/, '$1')
    .trimEnd()
}

/**
 * Parse the comma/period decimal that Tesseract may produce for either locale.
 */
function parsePrice(raw: string): number {
  return parseFloat(raw.replace(',', '.'))
}

/**
 * Convert sub-units to their base unit so price-per-unit comparisons are consistent.
 * Price history divides amount / quantity — meaningful only when quantity is in the
 * base unit (kg or l), not in grams or millilitres from a package label.
 */
function normalizeQuantity(value: number, rawUnit: string): { quantity: number; unit: string } {
  switch (rawUnit) {
    case 'g':  return { quantity: value / 1000, unit: 'kg' }
    case 'ml': return { quantity: value / 1000, unit: 'l' }
    case 'cl': return { quantity: value / 100,  unit: 'l' }
    default:   return { quantity: value, unit: rawUnit }
  }
}

/**
 * Convert a Finnish date string to ISO YYYY-MM-DD.
 * OCR commonly misreads digits in the year (e.g. "26" -> "28").
 * If the resulting date is more than 60 days in the future, we assume
 * it is a misread and substitute the current year instead.
 */
function parseDate(day: string, month: string, year: string): string {
  let y = year.length === 2 ? `20${year}` : year
  const iso = `${y}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  // A purchase date can never be in the future — clamp to today.
  // OCR commonly misreads the year digit (e.g. "26" → "28"), producing impossible future dates.
  const parsed = new Date(iso)
  const today = new Date(); today.setHours(23, 59, 59, 999)
  if (!isNaN(parsed.getTime()) && parsed > today) {
    // Try substituting the current year first
    const withCurrentYear = new Date(iso.replace(/^\d{4}/, String(new Date().getFullYear())))
    y = withCurrentYear <= today
      ? String(new Date().getFullYear())
      : String(new Date().getFullYear() - 1)  // e.g. Jan receipt scanned in Dec
  }
  return `${y}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

/**
 * Attempt to extract the store name from OCR text.
 * First tries to match known Finnish store names; falls back to heuristics.
 */
function extractStoreName(lines: string[]): string {
  const searchLines = lines.slice(0, 15)

  // Pass 1: known store patterns — most reliable
  // Slice from the match position so OCR junk before the store name is stripped
  for (const line of searchLines) {
    const trimmed = line.trim()
    for (const p of KNOWN_STORE_PATTERNS) {
      const m = trimmed.match(p)
      if (m && m.index !== undefined) {
        if (p === APTEEKKI_PATTERN) {
          // Keep a meaningful word prefix (e.g. "Sulkavan" before "Apteekki") — only this
          // pattern needs it; other stores keep the unconditional strip below.
          const prefix = trimmed.slice(0, m.index)
          if (prefix.trim().length > 0 && /^[a-zA-ZäöåÄÖÅ\s-]+$/.test(prefix)) return trimmed
        }
        // Slice from the match position so OCR junk before the store name is stripped,
        // e.g. "** S-Market"
        return trimmed.slice(m.index).trim()
      }
    }
  }

  // Pass 2: first reasonable-looking non-numeric, non-date line
  // Require at least 5 chars and at least 2 letters to filter out OCR noise like "| 4 No"
  const candidates = searchLines.filter((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length < 5) return false
    if (/^\d/.test(trimmed)) return false
    if ((trimmed.match(/[a-zA-ZäöåÄÖÅ]/g) ?? []).length < 2) return false
    if (DATE_PATTERN.test(trimmed)) return false
    if (PRICE_AT_END.test(trimmed)) return false
    if (/\d+[,.]\d{3,}/.test(trimmed)) return false   // weight-style numbers (e.g. "1,460" OCR artefact) — not a store name
    if (SKIP_PATTERNS.some((p) => p.test(trimmed))) return false
    return true
  })
  return candidates[0]?.trim() ?? ''
}

/**
 * Main parser — takes raw Tesseract text and returns structured receipt data.
 */
export function parseReceipt(rawText: string): ParsedReceipt {
  const lines = rawText.split('\n')
  const items: ParsedItem[] = []
  let receiptDate: string | null = null
  let storeName = extractStoreName(lines)
  let i = 0

  while (i < lines.length) {
    const line = normalizeLinePrices(lines[i]!.trim())
    i++

    if (!line) continue

    // Extract date if not yet found
    if (!receiptDate) {
      const dateMatch = line.match(DATE_PATTERN)
      if (dateMatch) {
        receiptDate = parseDate(dateMatch[1]!, dateMatch[2]!, dateMatch[3]!)
        continue
      }
    }

    // Skip non-item lines
    if (SKIP_PATTERNS.some((p) => p.test(line))) continue

    // Skip VAT breakdown rows (multiple prices on one line)
    if (isVatBreakdownLine(line)) continue

    // Try to find a price at the end of this line.
    // If no price here but the line looks like a product name, check whether
    // OCR split the item across two lines (name on this line, price on next).
    let priceMatch = line.match(PRICE_AT_END)
    let itemName = line
    let splitPriceLine = false  // true when the price came from a lookahead line, not `line` itself

    if (!priceMatch) {
      if (looksLikeProductName(line) && i < lines.length) {
        let checkIdx = i
        let checkLine = normalizeLinePrices(lines[checkIdx]!.trim())
        // If the very next line is a standalone PLU/barcode code, skip it and look one further.
        // Motonet prints: item name → PLU code (alone) → price
        if (/^\d{5,}$/.test(checkLine) && checkIdx + 1 < lines.length) {
          checkIdx++
          checkLine = normalizeLinePrices(lines[checkIdx]!.trim())
        }
        const splitMatch = checkLine.match(STANDALONE_PRICE)
        if (splitMatch) {
          priceMatch = splitMatch  // treat that line's price as this item's price
          splitPriceLine = true
          i = checkIdx + 1        // consume up to and including the price line
        }
      }
      if (!priceMatch) continue
    }

    const amount = parsePrice(priceMatch[1]!)
    if (isNaN(amount) || amount === 0) continue

    // Negative amounts: discount modifier (Kampanja, Alennus, etc.) or refund/deposit.
    // Attach savings to the preceding item when a discount keyword is present.
    // Either way, skip negative lines as standalone expense items.
    if (amount < 0) {
      const discountMatch = line.match(DISCOUNT_LINE)
      if (discountMatch && items.length > 0) {
        const saved = Math.abs(amount)
        const last = items[items.length - 1]!
        if (last.originalPrice !== undefined) {
          // originalPrice and discountAmount already set by a Norm./Normaalihinta line.
          // The paired Kampanja/RIVIALENNUS encodes the same discount — skip to avoid
          // overwriting the price-difference-derived value with a rounded percentage amount.
        } else {
          last.discountAmount = (last.discountAmount ?? 0) + saved
          last.originalPrice  = last.amount + last.discountAmount
        }
      }
      continue
    }

    // "Norm." / "Normaalihinta" lines show the original (pre-discount) price.
    // Finnish stores print these on a separate line after the discounted item price.
    // Attach to the preceding item and skip creating a new expense entry.
    if (NORM_PRICE_LINE.test(line) && items.length > 0) {
      const last = items[items.length - 1]!
      if (amount > last.amount) {
        last.originalPrice = amount
        last.discountAmount = parseFloat((amount - last.amount).toFixed(2))
      }
      continue
    }

    // Product name = everything before the price.
    // For split lines (price was on a lookahead line), itemName IS the full name —
    // priceMatch[1] does not appear in `line` at all, so slicing on it would be wrong.
    let name = splitPriceLine
      ? itemName.trim()
      : line.slice(0, line.lastIndexOf(priceMatch[1]!)).trim()
    // Remove trailing tab leaders: dots, dashes, em/en dashes, underscores
    name = name.replace(/[\s.\-_–—―—–]+$/, '').trim()
    // Strip embedded barcodes (10+ digits) -- Tokmanni and similar stores print
    // EAN-13 between the item name and price: "PAISTINPANNU 3168430344990 27,47"
    name = name.replace(/\s+\d{10,}\s*/g, ' ').trim()
    // Fix common OCR misread: "G" (gram weight unit) misread as "6"
    // e.g. "MANSIKKA 500 6" → "MANSIKKA 500 G"
    name = name.replace(/(\d+)\s+6$/, '$1 G')
    // Strip leading ALV tax class digit that S-Market prints before some item names
    // e.g. "5 XTRA VEHNAPAAHTO" → "XTRA VEHNAPAAHTO"
    // Only strip if it's a single digit followed by a space and an uppercase letter
    name = name.replace(/^\d\s+(?=[A-ZÄÖÅ])/, '')

    if (!name || name.length < 2) continue

    // Extract embedded quantity/unit from the item name itself.
    // e.g. "MANSIKKA 500 G" (space) or fused OCR output "JUUSTO1KG" (no space).
    let quantity: number | undefined
    let unit: string | undefined
    const embeddedQtyMatch = name.match(EMBEDDED_QTY)
    if (embeddedQtyMatch) {
      const norm = normalizeQuantity(parsePrice(embeddedQtyMatch[1]!), embeddedQtyMatch[2]!.toLowerCase())
      quantity = norm.quantity
      unit = norm.unit
      name = name.slice(0, embeddedQtyMatch.index).trim()
    }

    // Post-extraction guard: slicing the quantity suffix can leave a too-short name.
    if (!name || name.length < 2) continue

    // Also check if the NEXT line is a quantity line (weight-based pricing, e.g. loose produce).
    // Always consume a QTY_PATTERN line even when embedded extraction already set quantity,
    // to prevent orphaned weight lines from being re-parsed as product names.
    if (i < lines.length) {
      const nextLine = lines[i]!.trim()
      const qtyMatch = nextLine.match(QTY_PATTERN)
      if (qtyMatch) {
        if (quantity === undefined) {
          const norm = normalizeQuantity(parsePrice(qtyMatch[1]!), qtyMatch[2]!.toLowerCase())
          quantity = norm.quantity
          unit = norm.unit
        }
        i++ // consume the quantity line regardless
      }
    }

    items.push({ name, amount, quantity, unit, rawLine: line })
  }

  return { storeName, receiptDate, items, rawText }
}
