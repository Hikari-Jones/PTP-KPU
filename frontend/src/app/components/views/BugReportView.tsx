import { useEffect, useState } from 'react'
import { request, message } from '../../../services/operations'
import { Workspace, field, button, buttonSecondary, useOperation, SkeletonTable } from '../ui/operations'
import { useAuth } from '../../context/AuthContext'
import { AlertCircle, RefreshCw, Send, CheckCircle2, Clock, Loader2, Download, FileText } from 'lucide-react'

interface Report {
  id: number
  title: string
  priority: string
  status: string
  owner_id: number
  created_at: string
  pelapor_nama?: string
  pelapor_nip?: string
}

export function BugReportView({ theme }: { theme: 'light' | 'dark' }) {
  const isDark = theme === 'dark'
  const [items, setItems] = useState<Report[]>([])
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('Sedang')
  const { userRole } = useAuth()
  const isAdmin = userRole === 'Admin'
  const { busy, error, run, setError } = useOperation()

  const load = async () => setItems(await request<Report[]>('/operations/bugs'))

  useEffect(() => {
    load().catch(e => setError(message(e)))
  }, [])

  const exportBugLogs = () => {
    if (!items.length) return

    const now = new Date()
    const timestampStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)

    let logContent = `================================================================================\n`
    logContent += `SYSTEM BUG REPORT & ERROR LOGS - PTP-KPU SULAWESI UTARA\n`
    logContent += `Generated At : ${now.toLocaleString('id-ID')} (${now.toISOString()})\n`
    logContent += `Exported By  : Administrator\n`
    logContent += `Total Tiket  : ${items.length}\n`
    logContent += `================================================================================\n\n`

    items.forEach((item, index) => {
      const createdDate = new Date(item.created_at + 'Z').toLocaleString('id-ID')
      logContent += `[TICKET #${index + 1}] ID: BUG-${item.id}\n`
      logContent += `Waktu Lapor : ${createdDate}\n`
      logContent += `Prioritas   : ${item.priority}\n`
      logContent += `Status      : ${item.status}\n`
      logContent += `Pelapor     : ${item.pelapor_nama || 'Pengguna #' + item.owner_id}`
      if (item.pelapor_nip && item.pelapor_nip !== '-') {
        logContent += ` (NIP: ${item.pelapor_nip})`
      }
      logContent += `\n`
      logContent += `Deskripsi   :\n`
      logContent += `  ${item.title.split('\n').join('\n  ')}\n`
      logContent += `--------------------------------------------------------------------------------\n`
    })

    logContent += `\n-- END OF LOG FILE --\n`

    const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `kpu-bug-reports-log-${timestampStr}.log`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <Workspace
      theme={theme}
      category="Administrator"
      title={isAdmin ? "Daftar Laporan Kendala Sistem" : "Laporkan Kendala Sistem"}
      description="Pusat Pemantauan, Pelaporan Masalah Sistem, dan Penanganan Tiket Gangguan Teknis"
    >
      {error && (
        <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Formulir pelaporan: HANYA untuk Operator / Pegawai, disembunyikan untuk Admin */}
      {!isAdmin && (
        <form
          onSubmit={e => {
            e.preventDefault()
            void run(async () => {
              await request('/operations/bugs', 'POST', { title, priority })
              setTitle('')
              await load()
            })
          }}
          className={`p-5 sm:p-6 rounded-2xl border transition-all mb-4 ${
            isDark
              ? 'bg-[#111827]/70 border-white/10 shadow-md'
              : 'bg-slate-50 border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-500" />
            <h2 className="font-bold text-base text-slate-900 dark:text-white">
              Formulir Laporkan Kendala
            </h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Ringkasan Kendala
              </label>
              <input
                required
                maxLength={500}
                value={title}
                onChange={e => setTitle(e.target.value)}
                className={field}
                placeholder="Jelaskan secara ringkas kendala atau error yang Anda alami..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Tingkat Prioritas
              </label>
              <select
                className={field}
                value={priority}
                onChange={e => setPriority(e.target.value)}
              >
                {['Rendah', 'Sedang', 'Tinggi'].map(x => (
                  <option key={x} className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white">
                    {x}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-4 mt-2 flex items-center gap-3">
            <button className={button} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{busy ? 'Menyimpan…' : 'Simpan Laporan'}</span>
            </button>
          </div>
        </form>
      )}

      {/* List Kendala */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-base text-slate-900 dark:text-white">
              {isAdmin ? `Daftar Kendala dari Operator (${items.length})` : `Daftar Laporan Anda (${items.length})`}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAdmin
                ? "Memantau dan memperbarui status kendala teknis yang dikirimkan oleh seluruh operator."
                : "Daftar riwayat tiket kendala yang pernah Anda ajukan ke administrator."}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {isAdmin && (
              <button
                type="button"
                disabled={busy || !items.length}
                className={`${buttonSecondary} text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 disabled:opacity-50`}
                onClick={exportBugLogs}
                title="Export seluruh tiket kendala ke format .log untuk tim pengembang"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Log (.log)</span>
              </button>
            )}
            <button disabled={busy} className={buttonSecondary} onClick={() => void run(load)}>
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
              <span>Muat ulang</span>
            </button>
          </div>
        </div>

        {busy && items.length === 0 ? (
          <SkeletonTable rows={4} cols={3} />
        ) : !items.length ? (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400 border border-dashed rounded-2xl border-slate-300 dark:border-white/10">
            Belum ada laporan kendala yang dapat ditampilkan.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(x => (
              <article
                key={x.id}
                className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isDark
                    ? 'bg-[#111827]/50 border-white/10 hover:border-white/20'
                    : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-0.5 rounded-md">
                      BUG-{x.id}
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      {x.title}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(x.created_at + 'Z').toLocaleString('id-ID')}</span>
                    <span>•</span>
                    <span>Prioritas: <strong>{x.priority}</strong></span>
                    <span>•</span>
                    <span>
                      Pelapor: <strong>{x.pelapor_nama || `Pengguna #${x.owner_id}`}</strong>
                      {x.pelapor_nip && x.pelapor_nip !== '-' ? ` (${x.pelapor_nip})` : ''}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {isAdmin ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Status:</span>
                      <select
                        aria-label={`Status BUG-${x.id}`}
                        className={`rounded-xl border px-3 py-1.5 text-xs font-semibold outline-hidden ${
                          isDark
                            ? 'bg-[#1e293b] border-white/10 text-white'
                            : 'bg-slate-50 border-slate-300 text-slate-800'
                        }`}
                        value={x.status}
                        disabled={busy}
                        onChange={e =>
                          void run(async () => {
                            await request(`/operations/bugs/${x.id}`, 'PATCH', { status: e.target.value })
                            await load()
                          })
                        }
                      >
                        {['Terbuka', 'Diproses', 'Selesai'].map(s => (
                          <option key={s} className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white">
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                      x.status === 'Selesai'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : x.status === 'Diproses'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                    }`}>
                      {x.status}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </Workspace>
  )
}
