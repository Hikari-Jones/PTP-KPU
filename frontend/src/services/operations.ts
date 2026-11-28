import { API_BASE_URL } from './api'
import { saveFile } from './csv'

export async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = localStorage.getItem('ptp_kpu_token')
  const res = await fetch(API_BASE_URL + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(typeof error.detail === 'string' ? error.detail : `Permintaan gagal (${res.status})`)
  }
  return res.json()
}
export function extractDownloadFilename(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback
  const utf8Match = disposition.match(/filename\*\s*=\s*UTF-8''([^;\r\n]+)/i)
  if (utf8Match?.[1]) {
    try {
      const decoded = decodeURIComponent(utf8Match[1].trim())
      if (decoded) return decoded
    } catch {
      // fall through to standard filename=
    }
  }
  const plainMatch = disposition.match(/filename\s*=\s*"?([^";\r\n]+)"?/i)
  if (plainMatch?.[1]) {
    const cleaned = plainMatch[1].trim()
    if (cleaned) return cleaned
  }
  return fallback
}

export async function requestWithTotal<T>(path: string, method = 'GET', body?: unknown): Promise<{ data: T; total: number }> {
  const token = localStorage.getItem('ptp_kpu_token')
  const res = await fetch(API_BASE_URL + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(typeof error.detail === 'string' ? error.detail : `Permintaan gagal (${res.status})`)
  }
  const data = await res.json() as T
  const totalHeader = res.headers.get('X-Total-Count')
  const total = totalHeader !== null ? Number(totalHeader) : (Array.isArray(data) ? data.length : 0)
  return { data, total: Number.isFinite(total) ? total : 0 }
}

export async function download(path: string, filename: string) {
  const res = await fetch(API_BASE_URL + path, { headers: { Authorization: `Bearer ${localStorage.getItem('ptp_kpu_token')}` } })
  if (!res.ok) {
    // Show the server's reason (e.g. "Akses berkas ditolak") rather than just the status code.
    const error = await res.json().catch(() => ({}))
    throw new Error(typeof error.detail === 'string' ? `Unduhan gagal: ${error.detail}` : `Unduhan gagal (${res.status})`)
  }
  const resolvedName = extractDownloadFilename(res.headers.get('content-disposition'), filename)
  saveFile(resolvedName, await res.blob())
}

export async function fetchFilePreview(path: string): Promise<{ url: string; contentType: string; text?: string }> {
  const res = await fetch(API_BASE_URL + path, { headers: { Authorization: `Bearer ${localStorage.getItem('ptp_kpu_token')}` } })
  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    throw new Error(typeof error.detail === 'string' ? `Gagal membuka berkas: ${error.detail}` : `Gagal membuka berkas (${res.status})`)
  }
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  const rawBlob = await res.blob()
  const typedBlob = new Blob([rawBlob], { type: contentType })
  const url = URL.createObjectURL(typedBlob)
  let text: string | undefined
  if (contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('csv')) {
    text = await typedBlob.text()
  }
  return { url, contentType, text }
}
export interface Employee { id_pegawai: number; nama: string; nip: string; role: string; id_bagian: number | null; jabatan: string | null; is_active: boolean; is_online?: boolean }
export interface Department { id_bagian: number; nama_bagian: string }
export const message = (e: unknown) => e instanceof Error ? e.message : 'Terjadi kesalahan'
