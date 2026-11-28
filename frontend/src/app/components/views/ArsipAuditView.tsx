import { useEffect, useState } from 'react'
import { request, message } from '../../../services/operations'
import { Workspace, field, button, useOperation, SkeletonTable } from '../ui/operations'
import { CharLimit } from '../ui/CharLimit'
import { History, RefreshCw, Search, ShieldCheck, X } from 'lucide-react'

interface AuditLogItem {
  id: number
  id_dokumen?: number | null
  nomor_dokumen?: string | null
  nama_dokumen?: string | null
  aksi: string
  actor_nama?: string | null
  detail?: string | null
  created_at: string
}

const AKSI_OPTIONS = [
  { value: '', label: 'Semua Aksi Audit' },
  { value: 'create', label: 'Unggah / Buat (create)' },
  { value: 'view', label: 'Lihat Dokumen (view)' },
  { value: 'download', label: 'Unduh Dokumen (download)' },
  { value: 'update', label: 'Ubah Metadata (update)' },
  { value: 'new_version', label: 'Versi Baru (new_version)' },
  { value: 'grant_access', label: 'Beri Izin Akses (grant_access)' },
  { value: 'revoke_access', label: 'Cabut Izin Akses (revoke_access)' },
  { value: 'legal_hold', label: 'Legal Hold (legal_hold)' },
  { value: 'soft_delete', label: 'Pindah ke Sampah (soft_delete)' },
  { value: 'restore', label: 'Pulihkan (restore)' },
  { value: 'permanent_delete', label: 'Hapus Permanen (permanent_delete)' },
  { value: 'disposal_execute', label: 'Eksekusi Penyusutan (disposal_execute)' },
] as const

const AKSI_BADGE: Record<string, string> = {
  create: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  view: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  download: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  update: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  new_version: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  grant_access: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  revoke_access: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  legal_hold: 'bg-amber-600 text-white',
  soft_delete: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  permanent_delete: 'bg-red-700 text-white',
  disposal_execute: 'bg-red-700 text-white',
  restore: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
}

export function ArsipAuditView({ theme }: { theme: 'light' | 'dark' }) {
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [aksiFilter, setAksiFilter] = useState('')
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const { busy, error, run, setError } = useOperation()

  const loadLogs = async (aksi = aksiFilter, q = appliedSearch) => {
    const params = new URLSearchParams({ limit: '150' })
    if (aksi) params.set('aksi', aksi)
    if (q.trim()) params.set('search', q.trim())
    const rows = await request<AuditLogItem[]>(`/arsip/my-audit-logs?${params}`)
    setLogs(rows)
  }

  useEffect(() => {
    loadLogs(aksiFilter, appliedSearch).catch((e) => setError(message(e)))
  }, [aksiFilter, appliedSearch])

  const triggerSearch = () => {
    setAppliedSearch(search)
  }

  const resetFilters = () => {
    setAksiFilter('')
    setSearch('')
    setAppliedSearch('')
  }

  return (
    <Workspace
      theme={theme}
      category="Arsip"
      title="Log Audit Arsip"
      description="Jejak audit permanen atas akses, pembaruan metadata, versi dokumen, izin akses SKKAAD, dan penyusutan arsip"
    >
      {error && (
        <div role="alert" className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-medium">
          {error}
        </div>
      )}

      <search>
        <form
          className="flex flex-col sm:flex-row items-stretch sm:items-start gap-2.5"
          onSubmit={(e) => {
            e.preventDefault()
            triggerSearch()
          }}
        >
          <div className="flex-1 space-y-1">
            <input
              type="search"
              aria-label="Cari log audit arsip"
              maxLength={150}
              className={field}
              placeholder="Cari nama dokumen, nomor dokumen, nama pegawai, atau rincian aktivitas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex justify-end">
              <CharLimit value={search} max={150} />
            </div>
          </div>

          <select
            aria-label="Filter aksi audit"
            className={`${field} sm:!w-56`}
            value={aksiFilter}
            onChange={(e) => setAksiFilter(e.target.value)}
          >
            {AKSI_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 shrink-0">
            <button type="submit" className={button} disabled={busy}>
              <Search className="w-3.5 h-3.5" />
              <span>Cari</span>
            </button>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => void run(() => loadLogs(aksiFilter, appliedSearch))}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
              <span>Muat Ulang</span>
            </button>
            {(aksiFilter || appliedSearch) && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1 cursor-pointer px-1"
              >
                <X className="w-3.5 h-3.5" /> Reset
              </button>
            )}
          </div>
        </form>
      </search>

      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/10 pb-2">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <ShieldCheck className="w-4 h-4 text-red-600 dark:text-red-400" />
          Menampilkan {logs.length} catatan audit terbaru
        </span>
      </div>

      {busy && !logs.length ? (
        <SkeletonTable rows={6} cols={3} />
      ) : logs.length === 0 ? (
        <div className="text-center py-10 space-y-2 text-slate-400 dark:text-slate-500">
          <History className="w-8 h-8 mx-auto opacity-50" />
          <p className="text-xs font-medium">Belum ada catatan audit yang cocok.</p>
        </div>
      ) : (
        <div className="space-y-2.5 text-xs">
          {logs.map((log) => (
            <article
              key={log.id}
              className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/50 dark:bg-black/20 hover:border-red-500/30 transition-colors space-y-1"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`font-bold uppercase text-[10px] px-2 py-0.5 rounded-full ${
                      AKSI_BADGE[log.aksi] ?? 'bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {log.aksi}
                  </span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {log.nama_dokumen || 'Dokumen Arsip'}
                  </span>
                  {log.nomor_dokumen && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                      {log.nomor_dokumen}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-400 tabular-nums">
                  {new Date(log.created_at).toLocaleString('id-ID')}
                </span>
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                <span className="font-semibold">{log.actor_nama || 'Sistem'}</span>
                {log.detail ? ` — ${log.detail}` : ''}
              </p>
            </article>
          ))}
        </div>
      )}
    </Workspace>
  )
}
