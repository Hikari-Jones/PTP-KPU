import { API_BASE_URL } from './api'

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
  if (!res.ok) throw new Error(`Unduhan gagal (${res.status})`)
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export interface Employee { id_pegawai: number; nama: string; nip: string; role: string; id_bagian: number | null; jabatan: string | null; is_active: boolean }
export interface Department { id_bagian: number; nama_bagian: string }
export const message = (e: unknown) => e instanceof Error ? e.message : 'Terjadi kesalahan'
