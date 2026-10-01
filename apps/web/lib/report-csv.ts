export type CsvValue = string | number | null

export function escapeCsvCell(value: CsvValue): string {
  if (value == null) return '""'
  const text = String(value)
  const protectedText =
    typeof value === 'string' && /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${protectedText.replace(/"/g, '""')}"`
}

export function createCsv(rows: CsvValue[][]): string {
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}`
}

export function safeReportFilename(value: string): string {
  const invalid = '<>:"/\\|?*'
  return (
    [...value]
      .map((character) =>
        character.charCodeAt(0) <= 31 || invalid.includes(character) ? '-' : character
      )
      .join('')
      .trim() || 'report'
  )
}
