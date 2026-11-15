/** Quote CSV fields and prevent spreadsheet formula execution in text cells. */
export function csvCell(value: unknown): string {
  let text = String(value ?? '')
  if (typeof value !== 'number' && /^[\s]*[=+@-]/.test(text)) text = "'" + text
  return '"' + text.replace(/"/g, '""') + '"'
}
export function saveCsv(filename: string, rows: unknown[][]) {
  const blob = new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
