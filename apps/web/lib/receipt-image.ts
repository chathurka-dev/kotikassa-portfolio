const MAX_UPLOAD_EDGE = 2000
const UPLOAD_JPEG_QUALITY = 0.8

/** Creates the JPEG used for both AI scanning and private receipt storage. */
export async function compressReceiptImage(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    try {
      const scale = Math.min(1, MAX_UPLOAD_EDGE / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) return null
      context.drawImage(bitmap, 0, 0, width, height)
      return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', UPLOAD_JPEG_QUALITY)
      })
    } finally {
      bitmap.close()
    }
  } catch {
    return null
  }
}
