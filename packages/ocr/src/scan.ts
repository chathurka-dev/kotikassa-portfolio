// ============================================================
// Receipt scan orchestrator -- adaptive two-pass OCR.
//
// Pass 1 uses the original 'contrast' preprocessing, which is most accurate on
// clean, evenly-lit receipts. If that read is confident we stop there (fast).
// If confidence is low -- the signature of a shadowed / curled receipt that the
// global contrast turned into noise -- we run Pass 2 with 'flatten' illumination
// preprocessing and keep whichever pass read the receipt better.
//
// Net effect: clean receipts keep their original accuracy (no regression) and
// the shadowed ones that used to scan as garbage are rescued, without slowing
// down the common case (the second pass only runs when the first is weak).
// ============================================================
import { preprocessImage } from './preprocessor'
import type { PreprocessResult } from './preprocessor'
import { runOcr } from './worker'
import type { OcrProgress, OcrResult } from './worker'
import { parseReceipt } from './parser'
import type { ParsedReceipt } from './parser'

export interface ReceiptScan {
  ocrResult: OcrResult
  parsed: ParsedReceipt
  preprocessed: PreprocessResult
  usedFallback: boolean // true when the 'flatten' rescue pass produced the result
}

// Below this average word confidence (0-100) Pass 1 is treated as unreliable and
// the flatten fallback is tried. Sits above the ~35-45% seen on garbage failures
// and below the ~60-75% seen on clean receipts.
const FALLBACK_CONFIDENCE = 55

export async function scanReceipt(
  file: File,
  onProgress?: (p: OcrProgress) => void,
): Promise<ReceiptScan> {
  // Pass 1 -- original contrast preprocessing (best for clean receipts).
  const pre1 = await preprocessImage(file, 'contrast')
  const ocr1 = await runOcr(pre1.dataUrl, onProgress)
  const parsed1 = parseReceipt(ocr1.text)

  // Confident and produced items -> done. No second OCR (fast path).
  if (ocr1.confidence >= FALLBACK_CONFIDENCE && parsed1.items.length > 0) {
    return { ocrResult: ocr1, parsed: parsed1, preprocessed: pre1, usedFallback: false }
  }

  // Pass 2 -- flatten illumination (rescues shadowed / curled receipts).
  const pre2 = await preprocessImage(file, 'flatten')
  const ocr2 = await runOcr(pre2.dataUrl, onProgress)
  const parsed2 = parseReceipt(ocr2.text)

  // Regression-proof selection: the fallback wins ONLY if it extracted strictly
  // MORE line items than Pass 1. When both passes find the same number of items
  // -- the normal case for a receipt Pass 1 already handled -- we keep Pass 1,
  // the original trusted result. So the fallback can only ADD items a failed
  // scan missed; it can never replace a good parse with a softer, worse one.
  const fallbackWins = parsed2.items.length > parsed1.items.length

  return fallbackWins
    ? { ocrResult: ocr2, parsed: parsed2, preprocessed: pre2, usedFallback: true }
    : { ocrResult: ocr1, parsed: parsed1, preprocessed: pre1, usedFallback: false }
}
