// ============================================================
// Tesseract.js Web Worker wrapper
// Runs OCR in a background thread so the UI stays responsive.
// Supports Finnish (fin) + English (eng) language packs.
// ============================================================

export interface OcrProgress {
  status: string   // e.g. "loading tesseract core", "recognizing text"
  progress: number // 0–100
}

export interface OcrResult {
  text: string
  confidence: number  // 0–100 average word confidence
}

/**
 * Run OCR on a preprocessed image data URL.
 * Downloads Finnish + English language packs on first use (cached by browser).
 *
 * @param imageDataUrl  Result from preprocessImage()
 * @param onProgress    Called with progress updates (0–100)
 */
export async function runOcr(
  imageDataUrl: string,
  onProgress?: (p: OcrProgress) => void
): Promise<OcrResult> {
  // Dynamic import so this module is never bundled into SSR code
  const { createWorker, PSM } = await import('tesseract.js')

  const worker = await createWorker(['fin', 'eng'], 1, {
    logger: (m: { status: string; progress: number }) => {
      onProgress?.({
        status: m.status,
        progress: Math.round(m.progress * 100),
      })
    },
  })

  try {
    // Receipts are a single column where each item name is separated from its price
    // by a wide gap. Tesseract's default AUTO mode (PSM 3) frequently reads that gap
    // as a column break — emitting all item names in one block and all prices in
    // another — which detaches every price from its name so the parser drops the
    // items entirely. Forcing single-block segmentation keeps "NAME … PRICE" on one
    // line so names and prices stay paired.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })

    const { data } = await worker.recognize(imageDataUrl)

    // Calculate average word confidence
    const words = data.words ?? []
    const avgConfidence = words.length > 0
      ? words.reduce((sum, w) => sum + w.confidence, 0) / words.length
      : 0

    return {
      text: data.text,
      confidence: Math.round(avgConfidence),
    }
  } finally {
    await worker.terminate()
  }
}
