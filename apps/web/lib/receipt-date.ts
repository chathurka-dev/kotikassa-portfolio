const FINNISH_RECEIPT_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/

/**
 * Converts an exactly transcribed Finnish receipt date (D.M.YYYY) to the ISO
 * date stored by Kotikassa. Calendar validation prevents JavaScript from
 * silently rolling invalid values such as 31.2.2026 into the following month.
 */
export function parseFinnishReceiptDate(value: string | null): string | null {
  if (!value) return null

  const match = FINNISH_RECEIPT_DATE.exec(value.trim())
  if (!match) return null

  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
