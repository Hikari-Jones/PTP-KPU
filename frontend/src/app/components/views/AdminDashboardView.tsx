import { useEffect, useState } from 'react'
import { request, message } from '../../../services/operations'
import { Workspace, button, buttonSecondary, SkeletonCards } from '../ui/operations'
import { Users, UserCheck, Mail, Database, ShieldAlert, Clock, RefreshCw } from 'lucide-react'

type Status = {
  users: number
  active_users: number
  letters: number
  budget_events: number
  official_issuance_enabled: boolean
  checked_at: string
}

export function AdminDashboardView({ theme }: { theme: 'light' | 'dark' }) {
  const isDark = theme === 'dark'
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setBusy(true)
    setError('')
    try {
      setStatus(await request<Status>('/operations/admin-status'))
    } catch (e) {
      setError(message(e))
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <Workspace
      theme={theme}
      category="Administrator"
      title="Dashboard Administrator"
      description="Ringkasan status basis data, aktivitas persuratan, dan audit anggaran sistem PTP-KPU"
      actions={
        <button
          className={`${buttonSecondary} !px-3.5 !py-2 !text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer shadow-xs transition-all active:scale-95`}
          disabled={busy}
          onClick={load}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
          <span>Muat Ulang</span>
        </button>
      }
    >
      {error && (
        <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold">
          {error}
        </div>
      )}

      {busy && !status && <SkeletonCards count={4} />}

      {status && (
        <div className="space-y-6">
          {/* Metric Cards - Pola Desain PTP-KPU */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Akun Terdaftar */}
            <div className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${
              isDark
                ? 'bg-[#111827]/70 border-white/10 shadow-md'
                : 'bg-slate-50 border-slate-200 shadow-xs'
            }`}>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                  Akun Terdaftar
                </span>
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {status.users}
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <Users className="w-6 h-6" />
              </div>
            </div>

            {/* Card 2: Akun Aktif */}
            <div className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${
              isDark
                ? 'bg-[#111827]/70 border-white/10 shadow-md'
                : 'bg-slate-50 border-slate-200 shadow-xs'
            }`}>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                  Akun Aktif
                </span>
                <span className="text-2xl font-black text-red-600 dark:text-red-400">
                  {status.active_users}
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <UserCheck className="w-6 h-6" />
              </div>
            </div>

            {/* Card 3: Alur Surat Tersimpan */}
            <div className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${
              isDark
                ? 'bg-[#111827]/70 border-white/10 shadow-md'
                : 'bg-slate-50 border-slate-200 shadow-xs'
            }`}>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                  Alur Surat
                </span>
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {status.letters}
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <Mail className="w-6 h-6" />
              </div>
            </div>

            {/* Card 4: Audit Anggaran */}
            <div className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${
              isDark
                ? 'bg-[#111827]/70 border-white/10 shadow-md'
                : 'bg-slate-50 border-slate-200 shadow-xs'
            }`}>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                  Audit Anggaran
                </span>
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {status.budget_events}
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <Database className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Info Status Operasional */}
          <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
            isDark ? 'bg-[#111827]/40 border-white/10 text-slate-300' : 'bg-slate-100/70 border-slate-200 text-slate-700'
          }`}>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
              <span>
                Penerbitan Resmi:{' '}
                <strong className={status.official_issuance_enabled ? 'text-red-500 font-semibold' : 'text-slate-500'}>
                  {status.official_issuance_enabled ? 'Diaktifkan dalam konfigurasi' : 'Dinonaktifkan'}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-slate-400 font-mono">
              <Clock className="w-3.5 h-3.5" />
              <span>Database Sync: {new Date(status.checked_at).toLocaleString('id-ID')}</span>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed pt-2">
        Catatan: Uptime server, kapasitas penyimpanan disk fisik, dan alokasi memori dipantau melalui dashboard monitoring server internal.
      </p>
    </Workspace>
  )
}
