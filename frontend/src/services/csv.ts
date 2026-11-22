import { showToast } from './activity'

/** Quote CSV fields and prevent spreadsheet formula execution in text cells. */
export function csvCell(value: unknown): string {
  let text = String(value ?? '')
  if (typeof value !== 'number' && /^[\s]*[=+@-]/.test(text)) text = "'" + text
  return '"' + text.replace(/"/g, '""') + '"'
}

/** Save a Blob as a file in the browser and confirm it to the user. */
export function saveFile(filename: string, blob: Blob, message = `${filename} berhasil diunduh`) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  showToast('success', message)
}

/**
 * Export rows (first row = header) as CSV that Excel opens correctly (UTF-8 BOM, CRLF).
 * Returns false and tells the user when there is nothing to export.
 */
export function saveCsv(filename: string, rows: unknown[][]): boolean {
  const dataRows = rows.length - 1
  if (dataRows <= 0) {
    showToast('info', 'Tidak ada data untuk diekspor pada filter saat ini')
    return false
  }
  const blob = new Blob(['﻿' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  saveFile(filename, blob, `${filename} diunduh (${dataRows} baris)`)
  return true
}
