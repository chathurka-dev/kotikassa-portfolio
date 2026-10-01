// ============================================================
// Image preprocessor — runs entirely in the browser via Canvas API.
// Converts a receipt photo into a flat, evenly-lit grayscale image
// that Tesseract can read more accurately.
//
// Pipeline:
//   1. Decode image with EXIF orientation applied
//   2. Detect the receipt region and crop to it (see below)
//   3. Resize the crop to optimal OCR width (upscale small, cap large)
//   4. Grayscale, flatten uneven illumination, THEN contrast (order matters)
//   5. Output as JPEG (much faster encoding than PNG)
//
// Why cropping (the big win for phone photos):
//   When a receipt is photographed at 1x zoom it often fills only part of the
//   frame, so its text is physically small in pixels. Scaling the *whole* photo
//   down to the OCR width then shrinks that text below the ~20px Tesseract needs,
//   producing garbage. Photos taken at 2x (receipt fills the frame) read fine.
//   To fix this we locate the bright receipt rectangle, crop to it, and upscale
//   only that region — so the text is large regardless of how far away the photo
//   was taken. Detection is deliberately conservative: if we're not confident we
//   fall back to the full image, so a well-framed shot is never made worse.
//
// Orientation strategy:
//   We use createImageBitmap({ imageOrientation: 'from-image' }) which asks the
//   browser to apply the EXIF rotation tag before we ever touch the pixels.
//   This works for JPEG, HEIC, PNG and WebP — both fresh camera shots and gallery
//   photos — so upright pixels always go into detection + Tesseract.
//
// Why JPEG not PNG: canvas.toDataURL('image/png') blocks the main thread
// for several seconds on large images. JPEG encodes 5-10x faster and the
// minor compression artefacts don't affect OCR accuracy on text.
//
// Why grayscale not binarization: Tesseract has its own well-tuned internal
// Otsu binarizer. Feeding it a flat, evenly-lit grayscale lets Tesseract apply
// its optimised algorithm rather than inheriting our cruder threshold.
// ============================================================

export interface PreprocessResult {
  dataUrl: string     // base64 JPEG — passed directly to Tesseract
  width: number
  height: number
  cropped: boolean    // true when we detected and cropped to the receipt region
}

/**
 * Which post-grayscale normalisation to apply:
 *   'contrast' (default) -- original global contrast stretch; best on clean,
 *               evenly-lit receipts. Run this FIRST.
 *   'flatten'            -- divide out uneven lighting before contrast; rescues
 *               shadowed / curled receipts that 'contrast' turns into garbage.
 *               Used as a confidence-triggered fallback (see scanReceipt).
 */
export type PreprocessMode = 'contrast' | 'flatten'

const MIN_WIDTH = 1900   // upscale small / cropped images — Tesseract needs text ≥20px tall
const MAX_WIDTH = 2600   // cap to keep OCR fast without throwing away receipt detail
const MAX_AREA  = 12_500_000 // iOS/WebKit canvases past ~16.7M px corrupt silently; stay under
const CONTRAST  = 1.8    // stroke-crisping stretch, applied AFTER illumination flattening (not before)

interface CropRect { x: number; y: number; w: number; h: number }

/**
 * Scale dimensions so the width sits between MIN_WIDTH and MAX_WIDTH, then clamp
 * the total area so we never build a canvas big enough to corrupt on mobile WebKit.
 */
function scaleToTarget(w: number, h: number): { w: number; h: number } {
  const targetW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w))
  const scale = targetW / Math.max(1, w)
  let outW = Math.max(1, Math.round(w * scale))
  let outH = Math.max(1, Math.round(h * scale))

  const area = outW * outH
  if (area > MAX_AREA) {
    const areaScale = Math.sqrt(MAX_AREA / area)
    outW = Math.max(1, Math.round(outW * areaScale))
    outH = Math.max(1, Math.round(outH * areaScale))
  }
  return { w: outW, h: outH }
}

/**
 * Locate the receipt within the photo by finding the dominant bright rectangle.
 *
 * Runs on a small (~220px wide) analysis copy for speed: grayscales it, picks a
 * brightness threshold with Otsu (biased toward bright, since receipts are pale),
 * then uses row/column projection profiles to find the dense band of bright pixels.
 *
 * Returns a crop rect in *source* pixel coordinates, or null when detection is not
 * confident enough (in which case the caller uses the full image).
 */
function detectReceiptBox(source: CanvasImageSource, srcW: number, srcH: number): CropRect | null {
  if (srcW < 2 || srcH < 2) return null

  const AW = 220
  const scale = AW / srcW
  const aw = AW
  const ah = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = aw
  canvas.height = ah
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  ctx.drawImage(source, 0, 0, aw, ah)

  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, aw, ah).data
  } catch {
    return null // tainted canvas (shouldn't happen for local files) — skip cropping
  }

  const total = aw * ah
  const gray = new Uint8Array(total)
  const hist = new Array<number>(256).fill(0)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = (0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0)) | 0
    gray[p] = g
    hist[g] = (hist[g] ?? 0) + 1
  }

  // Otsu threshold
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * (hist[t] ?? 0)
  let sumB = 0
  let wB = 0
  let maxVar = 0
  let otsu = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t] ?? 0
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * (hist[t] ?? 0)
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > maxVar) {
      maxVar = between
      otsu = t
    }
  }
  // Receipt paper is pale — bias the threshold upward so we don't grab grey background.
  const thr = Math.max(otsu, 135)

  const rowCount = new Int32Array(ah)
  const colCount = new Int32Array(aw)
  for (let y = 0; y < ah; y++) {
    const base = y * aw
    let rc = 0
    for (let x = 0; x < aw; x++) {
      if ((gray[base + x] ?? 0) >= thr) {
        rc++
        colCount[x] = (colCount[x] ?? 0) + 1
      }
    }
    rowCount[y] = rc
  }

  // A row/column belongs to the receipt when a meaningful fraction of it is bright.
  const rowThresh = aw * 0.18
  const colThresh = ah * 0.18
  let top = -1
  let bottom = -1
  let left = -1
  let right = -1
  for (let y = 0; y < ah; y++) {
    if ((rowCount[y] ?? 0) >= rowThresh) {
      if (top < 0) top = y
      bottom = y
    }
  }
  for (let x = 0; x < aw; x++) {
    if ((colCount[x] ?? 0) >= colThresh) {
      if (left < 0) left = x
      right = x
    }
  }
  if (top < 0 || left < 0 || bottom <= top || right <= left) return null

  // Pad a little so we never clip the outermost characters.
  const padY = Math.round(ah * 0.03)
  const padX = Math.round(aw * 0.03)
  top = Math.max(0, top - padY)
  bottom = Math.min(ah - 1, bottom + padY)
  left = Math.max(0, left - padX)
  right = Math.min(aw - 1, right + padX)

  // Map back to full-resolution source coordinates.
  const x = Math.round(left / scale)
  const y = Math.round(top / scale)
  const w = Math.round((right - left + 1) / scale)
  const h = Math.round((bottom - top + 1) / scale)

  // Confidence gates — bail (use full image) if the box looks implausible.
  const areaFrac = (w * h) / (srcW * srcH)
  if (areaFrac < 0.10) return null      // too small — probably mis-detection
  if (areaFrac > 0.90) return null      // already fills the frame — cropping adds nothing
  if (w < srcW * 0.15 || h < srcH * 0.15) return null // degenerate sliver

  return { x, y, w, h }
}

/**
 * Flatten uneven illumination by dividing out a blurred background estimate.
 *
 * Biggest OCR-accuracy win on real phone photos. A global contrast stretch
 * amplifies the shadow gradients of a curled / creased receipt into noise --
 * turning readable text into garbage (a real 43%-confidence case OCR'd
 * "COLA 1,5L 2,11" as "Dhl Masi lait cis ic nn"). Dividing each pixel by its
 * LOCAL background removes the gradient while keeping the dark strokes:
 *
 *   flat = gray / background * TARGET            (kills the shadow gradient)
 *   out  = clamp((flat - 128) * CONTRAST + 128)  (crisps strokes, now safe)
 *
 * Background is estimated by downscaling to ~1/8 (averaging text away) then
 * upscaling back smoothed -- cheap and robust. Contrast is applied AFTER
 * flattening, so it sharpens text instead of amplifying lighting; Tesseract's
 * own Otsu binariser then thresholds the result.
 */
function flattenIllumination(canvas: HTMLCanvasElement): void {
  const w = canvas.width
  const h = canvas.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return

  // 1. Downscale to a small canvas -- averages out text, leaving illumination.
  const sw = Math.max(1, Math.round(w / 8))
  const sh = Math.max(1, Math.round(h / 8))
  const small = document.createElement('canvas')
  small.width = sw
  small.height = sh
  const sctx = small.getContext('2d')
  if (!sctx) return
  sctx.imageSmoothingEnabled = true
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(canvas, 0, 0, w, h, 0, 0, sw, sh)

  // 2. Upscale that background estimate back to full size, smoothed.
  const bgCanvas = document.createElement('canvas')
  bgCanvas.width = w
  bgCanvas.height = h
  const bgCtx = bgCanvas.getContext('2d', { willReadFrequently: true })
  if (!bgCtx) return
  bgCtx.imageSmoothingEnabled = true
  bgCtx.imageSmoothingQuality = 'high'
  bgCtx.drawImage(small, 0, 0, sw, sh, 0, 0, w, h)

  // 3. Divide each pixel by its local background, scaled to a target white level.
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  let bg: Uint8ClampedArray
  try {
    bg = bgCtx.getImageData(0, 0, w, h).data
  } catch {
    return // tainted canvas -- leave the plain grayscale as-is
  }
  const TARGET = 185
  for (let i = 0; i < d.length; i += 4) {
    const g = d[i] ?? 0
    const b = bg[i] || 1
    // Flatten: normalise the pixel by its LOCAL background, killing the shadow.
    const flat = (g / b) * TARGET
    // Then a contrast stretch -- now that the shadow is gone it crisps the text
    // strokes instead of amplifying lighting gradients into noise.
    const v = Math.min(255, Math.max(0, (flat - 128) * CONTRAST + 128))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * Original global contrast stretch: push each grey value away from mid-grey
 * (128). Best on clean, evenly-lit receipts. On shadowed / curled photos it
 * amplifies the lighting gradient into noise -- that is what flattenIllumination
 * fixes for the fallback pass.
 */
function applyContrast(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.min(255, Math.max(0, ((d[i] ?? 0) - 128) * CONTRAST + 128))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * Render a decoded image source (optionally a sub-rectangle) into a canvas,
 * apply grayscale then the chosen normalisation (mode), and return a JPEG.
 */
function renderToCanvas(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  crop: CropRect | null,
  mode: PreprocessMode,
): PreprocessResult {
  const cropX = crop?.x ?? 0
  const cropY = crop?.y ?? 0
  const cropW = crop?.w ?? srcW
  const cropH = crop?.h ?? srcH

  const { w, h } = scaleToTarget(cropW, cropH)

  const canvas = document.createElement('canvas')
  canvas.width  = w
  canvas.height = h

  const ctx = canvas.getContext('2d')!
  // High-quality resampling — keeps text edges clean when up- or down-scaling.
  // Some mobile browsers default to nearest-neighbour, which shreds small text.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, w, h)

  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]     ?? 0
    const g = data[i + 1] ?? 0
    const b = data[i + 2] ?? 0
    // Luminance-weighted grayscale (matches human eye perception)
    const gray = 0.299 * r + 0.587 * g + 0.114 * b
    data[i] = data[i + 1] = data[i + 2] = gray
    // Alpha unchanged
  }

  ctx.putImageData(imageData, 0, 0)

  // 'flatten' divides out uneven lighting (shadows from curled / creased
  // receipts) BEFORE contrast, so contrast crisps the text instead of
  // amplifying those shadows into noise. 'contrast' is the original path, kept
  // unchanged for clean receipts. scanReceipt() tries 'contrast' first and only
  // falls back to 'flatten' when OCR confidence is low.
  if (mode === 'flatten') {
    flattenIllumination(canvas)
  } else {
    applyContrast(canvas)
  }

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    width: w,
    height: h,
    cropped: crop !== null,
  }
}

/** Detect the receipt region then render. Detection never throws — falls back to full image. */
function detectAndRender(source: CanvasImageSource, srcW: number, srcH: number, mode: PreprocessMode): PreprocessResult {
  let crop: CropRect | null = null
  try {
    crop = detectReceiptBox(source, srcW, srcH)
  } catch {
    crop = null
  }
  return renderToCanvas(source, srcW, srcH, crop, mode)
}

/**
 * Preprocess a receipt image for OCR:
 * - Applies EXIF orientation via createImageBitmap (works for JPEG, HEIC, PNG, WebP)
 * - Detects + crops to the receipt so zoomed-out (1x) photos still have readable text
 * - Scales to optimal width (upscales small crops, caps huge photos)
 * - Converts to grayscale and flattens uneven lighting so text stands out
 * - Returns a JPEG data URL (fast, async-friendly, Tesseract-compatible)
 */
export async function preprocessImage(
  file: File,
  mode: PreprocessMode = 'contrast',
): Promise<PreprocessResult> {
  // Attempt 1 — createImageBitmap with explicit orientation correction.
  if (typeof createImageBitmap !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(
        file,
        { imageOrientation: 'from-image' } as ImageBitmapOptions,
      )
      const result = detectAndRender(bitmap, bitmap.width, bitmap.height, mode)
      bitmap.close()
      return result
    } catch {
      // Option string not supported (very old Safari) — try without the option.
      try {
        const bitmap = await createImageBitmap(file)
        const result = detectAndRender(bitmap, bitmap.width, bitmap.height, mode)
        bitmap.close()
        return result
      } catch { /* fall through to HTMLImageElement path */ }
    }
  }

  // Attempt 2 — HTMLImageElement fallback (iOS < 15, very old browsers).
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      try {
        const result = detectAndRender(img, img.naturalWidth, img.naturalHeight, mode)
        URL.revokeObjectURL(objectUrl)
        resolve(result)
      } catch (err) {
        URL.revokeObjectURL(objectUrl)
        reject(err)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not load image for preprocessing.'))
    }

    img.src = objectUrl
  })
}
