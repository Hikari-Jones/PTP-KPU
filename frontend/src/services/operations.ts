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
export async function download(path: string, filename: string) {
  const res = await fetch(API_BASE_URL + path, { headers: { Authorization: `Bearer ${localStorage.getItem('ptp_kpu_token')}` } })
  if (!res.ok) {
    // Show the server's reason (e.g. "Akses berkas ditolak") rather than just the status code.
    const error = await res.json().catch(() => ({}))
    throw new Error(typeof error.detail === 'string' ? `Unduhan gagal: ${error.detail}` : `Unduhan gagal (${res.status})`)
  }
  saveFile(filename, await res.blob())
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
