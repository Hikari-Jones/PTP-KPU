import { useEffect, useState, useRef } from 'react'
import { request, download, message } from '../../../services/operations'
import type { Employee } from '../../../services/operations'
import { filesApi } from '../../../services/api'
import { Workspace, field, button, useOperation } from '../ui/operations'
import { useAuth } from '../../context/AuthContext'
import { RefreshCw, FileText, ChevronDown, Download, CheckCircle, AlertCircle, Send, Archive, Check, Search, Filter, X, Eye, Inbox } from 'lucide-react'
import { showToast as notify } from '../../../services/activity'

const TABS: { id: string; label: string }[] = [
  { id: "overview", label: "Dashboard" },
  { id: "surat-masuk", label: "Surat Masuk & Disposisi" },
  { id: "surat-keluar", label: "Surat Keluar" },
  { id: "surat-tugas", label: "Surat Tugas" },
  { id: "klasifikasi", label: "Kode Klasifikasi" },
]

const TAB_ROUTE: Record<string, string> = {
  overview: "surat-summary",
  "surat-masuk": "surat-masuk",
  "surat-keluar": "surat-keluar",
  "surat-tugas": "surat-tugas",
  klasifikasi: "surat-klasifikasi",
}

interface Letter {
  id: number
  kind: string
  subject: string
  sender: string
  recipient: string
  number: string | null
  content: string
  date: string
  status: string
  file_id: number | null
  owner_id?: number
  assignee_id?: number | null
  version: number
  history: { at: string; actor: string; action: string; note: string }[]
}

export interface SuratMenyuratModuleProps {
  theme: 'light' | 'dark'
  subTab?: 'ringkasan' | 'masuk' | 'keluar'
  onNavigate?: (tab: string) => void
}

const statuses: Record<string, string> = {
  registered: 'Terdaftar',
  draft: 'Draft',
  submitted: 'Menunggu Verifikasi',
  revision: 'Perlu Revisi',
  approved: 'Lolos Pemeriksaan Internal',
  assigned: 'Dalam Disposisi',
  completed: 'Disposisi Selesai',
  archived: 'Terarsip',
}

export function SuratMenyuratModule({ theme, subTab = 'ringkasan', onNavigate }: SuratMenyuratModuleProps) {
  const requestId = useRef(0)
  const [page, setPage] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [items, setItems] = useState<Letter[]>([])
  const [people, setPeople] = useState<Employee[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [assignee, setAssignee] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const blank = {
    kind: 'masuk',
    subject: '',
    sender: '',
    recipient: '',
    number: '',
    content: '',
    date: new Date().toLocaleDateString('en-CA'),
  }
  const [form, setForm] = useState(blank)
  const { userRole, canEdit, currentUser } = useAuth()
  const admin = userRole === 'Admin'
  const editor = canEdit('surat')
  // Filters (server-side, so they work across pages)
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const filtersActive = Boolean(appliedSearch || statusFilter || yearFilter)
  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i)
  const { busy, error, run, setError } = useOperation()

  const load = async () => {
    const activeRequest = ++requestId.current
    const params = new URLSearchParams({ skip: String(page * 50), limit: '51' })
    if (subTab !== 'ringkasan') params.set('kind', subTab)
    if (appliedSearch) params.set('search', appliedSearch)
    if (statusFilter) params.set('status', statusFilter)
    if (yearFilter) params.set('year', yearFilter)
    const rows = await request<Letter[]>(`/operations/letters?${params}`)
    if (activeRequest !== requestId.current) return
    setHasNext(rows.length > 50)
    setItems(rows.slice(0, 50))
    if (admin) setPeople(await request<Employee[]>('/pegawai/?limit=1000'))
  }

  useEffect(() => {
    setPage(0)
    setSelected(null)
  }, [subTab])

  useEffect(() => {
    load().catch((e) => setError(message(e)))
    return () => {
      requestId.current++
    }
  }, [page, subTab, appliedSearch, statusFilter, yearFilter])

  const applyFilter = (apply: () => void) => {
    apply()
    setPage(0)
    setSelected(null)
  }

  const item = items.find((x) => x.id === selected)
  // What this account may do with the open letter (mirrors backend workflow rules).
  const isAssignee = Boolean(item && currentUser?.id_pegawai && item.assignee_id === currentUser.id_pegawai)
  const canEditDraft = Boolean(item && editor && ['draft', 'revision'].includes(item.status))
  const canReview = Boolean(item && admin && item.status === 'submitted')
  const canAssign = Boolean(item && admin && ['registered', 'assigned'].includes(item.status))
  const canComplete = Boolean(item && item.status === 'assigned' && (admin || isAssignee))
  const canArchive = Boolean(item && editor && ['approved', 'completed'].includes(item.status))
  const hasActions = canEditDraft || canReview || canAssign || canComplete || canArchive
  const act = (action: string) =>
    void run(async () => {
      if (!item) return
      await request(`/operations/letters/${item.id}/actions`, 'POST', {
        action,
        version: item.version,
        note,
        assignee_id: assignee ? Number(assignee) : null,
        ...(action === 'edit' ? { content } : {}),
      })
      setNote('')
      await load()
    })

  return (
    <Workspace
      theme={theme}
      category="Surat"
      title={subTab === 'masuk' ? 'Surat Masuk & Disposisi' : 'Alur Persuratan'}
      description={
        subTab === 'masuk'
          ? 'Buku Agenda Surat Masuk, Lembar Disposisi Pimpinan, dan Pelacakan Tindak Lanjut Dokumen KPU Sulawesi Utara'
          : 'Registrasi Mandiri, Alur Disposisi Naskah Dinas, dan Pelacakan Persetujuan Dokumen KPU Sulawesi Utara'
      }
      navigation={
        <nav aria-label="Sub-menu persuratan" className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((t) => {
            const active = t.id === 'surat-masuk'
            return (
              <button
                key={t.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate?.(TAB_ROUTE[t.id])}
                className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                  active
                    ? 'bg-red-600 border-red-600 text-white shadow-md'
                    : theme === 'dark'
                      ? 'border-white/10 bg-[#0f172a] text-gray-300 hover:border-red-500/50'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-red-400'
                }`}
              >
                {t.id === 'surat-masuk' && <Inbox className="w-3.5 h-3.5" />}
                {t.label}
              </button>
            )
          })}
        </nav>
      }
    >
      {/* Banner Informasi Regulasi / Status Operasional */}
      <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
        {subTab === 'masuk'
          ? 'Buku agenda surat masuk terpadu dengan lembar disposisi digital pimpinan. Setiap surat masuk dapat langsung diteruskan atau ditindaklanjuti oleh pegawai pelaksana tugas.'
          : 'Registrasi, disposisi, revisi, dan persetujuan tersimpan di server. Nomor ALUR adalah register internal. Penerbitan nomor surat resmi belum diaktifkan sampai format dan kewenangan KPU divalidasi. Persetujuan ini bukan TTE tersertifikasi.'}
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Tombol Muat Ulang Tipis & Ramping */}
      <div className="flex items-center justify-between">
        <button
          className={`${button} !px-3 !py-1.5 !text-xs shadow-2xs`}
          disabled={busy}
          onClick={() => void run(load)}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
          <span>Muat Ulang</span>
        </button>
      </div>

      {/* Form Registrasi / Buat Draft Baru - Berjarak & Berhuruf Kapital */}
      {canEdit('surat') && (
        <details className="group border rounded-xl border-slate-200 dark:border-white/10 overflow-hidden bg-slate-50/50 dark:bg-black/20 transition-all">
          <summary className="cursor-pointer font-semibold text-xs tracking-wide px-4 py-3 select-none flex items-center justify-between text-slate-800 dark:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-white/5 transition-colors">
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-red-600 dark:text-red-500" />
              {subTab === 'masuk' ? 'Registrasi Surat Masuk Baru' : 'Registrasi / Buat Draft Surat Baru'}
            </span>
            <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
          </summary>

          <form
            className="p-4 sm:p-5 border-t border-slate-200 dark:border-white/10 space-y-4 bg-white/70 dark:bg-slate-900/40"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                // If saving the letter fails, the uploaded file is rolled back.
                const save = (fileId: number | null) =>
                  request('/operations/letters', 'POST', { ...form, file_id: fileId })
                if (file) await filesApi.uploadThen(file, 'surat', (uploaded) => save(uploaded.file_id))
                else await save(null)
                setForm(blank)
                setFile(null)
                await load()
              })
            }}
          >
            {/* Grid 2 Kolom untuk Tata Letak Rapi dan Tidak Berdempetan */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Jenis Surat <span className="text-red-500">*</span>
                </label>
                <select
                  className={field}
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value })}
                >
                  <option value="masuk">Surat Masuk</option>
                  <option value="keluar">Draft Surat Keluar</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Tanggal Surat <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="date"
                  className={field}
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Perihal Surat <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  className={field}
                  placeholder="Masukkan pokok atau perihal surat..."
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Instansi / Pengirim <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  className={field}
                  placeholder="Nama atau instansi pengirim"
                  value={form.sender}
                  onChange={(e) => setForm({ ...form, sender: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Tujuan / Penerima <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  className={field}
                  placeholder="Nama atau bagian penerima"
                  value={form.recipient}
                  onChange={(e) => setForm({ ...form, recipient: e.target.value })}
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Nomor Surat Masuk {form.kind === 'masuk' ? <span className="text-slate-400 font-normal">(Opsional)</span> : <span className="text-slate-400 font-normal">(Dinonaktifkan untuk draft keluar)</span>}
                </label>
                <input
                  disabled={form.kind === 'keluar'}
                  type="text"
                  className={field}
                  placeholder={form.kind === 'keluar' ? 'Nomor akan dibuat otomatis saat persetujuan' : 'Contoh: 123/KPU-SULUT/XI/2026'}
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ringkasan / Isi Surat
                </label>
                <textarea
                  rows={3}
                  className={field}
                  placeholder="Tuliskan ringkasan isi surat atau keterangan penting..."
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Lampiran Berkas <span className="text-slate-400 font-normal">(Opsional)</span>
                </label>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className={`${field} file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-red-600 file:text-white file:cursor-pointer hover:file:bg-red-700`}
                />
              </div>
            </div>

            {/* Tombol Simpan */}
            <div className="pt-2">
              <button disabled={busy} className={button}>
                {busy ? 'Menyimpan Surat...' : subTab === 'masuk' ? 'Simpan & Daftarkan Surat Masuk' : 'Simpan Surat'}
              </button>
            </div>
          </form>
        </details>
      )}

      {/* Filter Surat */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20">
        <span className="flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400">
          <Filter className="w-3.5 h-3.5" /> Filter:
        </span>
        <form
          className="relative flex-1 min-w-[200px]"
          onSubmit={(e) => {
            e.preventDefault()
            applyFilter(() => setAppliedSearch(search.trim()))
          }}
        >
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            aria-label="Cari surat"
            className={`${field} !pl-8 !py-1.5 !text-xs`}
            placeholder="Cari perihal, pengirim, penerima, atau nomor… (Enter)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
        <select
          aria-label="Filter status surat"
          className={`${field} !w-auto !py-1.5 !text-xs`}
          value={statusFilter}
          onChange={(e) => applyFilter(() => setStatusFilter(e.target.value))}
        >
          <option value="">Semua Status</option>
          {Object.entries(statuses).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          aria-label="Filter tahun surat"
          className={`${field} !w-auto !py-1.5 !text-xs`}
          value={yearFilter}
          onChange={(e) => applyFilter(() => setYearFilter(e.target.value))}
        >
          <option value="">Semua Tahun</option>
          {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {filtersActive && (
          <button
            type="button"
            className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            onClick={() => {
              applyFilter(() => {
                setSearch('')
                setAppliedSearch('')
                setStatusFilter('')
                setYearFilter('')
              })
              notify('info', 'Filter surat direset')
            }}
          >
            <X className="w-3.5 h-3.5" /> Reset
          </button>
        )}
      </div>

      {/* Daftar Surat & Detail Panel Disposisi */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Kolom Kiri: List Surat */}
        <div className="space-y-2.5">
          {items.filter((x) => subTab === 'ringkasan' || x.kind === subTab).length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 border rounded-xl border-slate-200 dark:border-white/10">
              {filtersActive ? 'Tidak ada surat yang cocok dengan filter.' : 'Belum ada data surat pada kategori ini.'}
            </div>
          ) : (
            items
              .filter((x) => subTab === 'ringkasan' || x.kind === subTab)
              .map((x) => (
                <button
                  key={x.id}
                  className={`block text-left w-full border rounded-xl p-4 transition-all cursor-pointer shadow-2xs ${
                    selected === x.id
                      ? 'border-red-600 bg-red-50/40 dark:bg-red-950/20'
                      : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-white/40 dark:bg-black/20'
                  }`}
                  aria-pressed={selected === x.id}
                  title="Klik untuk melihat isi surat"
                  onClick={() => {
                    setSelected(x.id)
                    setContent(x.content)
                    setNote('')
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <strong className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {x.subject}
                    </strong>
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 shrink-0">
                      {statuses[x.status] || x.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
                    <span>{x.number || `Draft #${x.id}`} · {x.date}{x.file_id ? ' · 📎 Lampiran' : ''}</span>
                    <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold shrink-0">
                      <Eye className="w-3 h-3" /> Lihat
                    </span>
                  </p>
                </button>
              ))
          )}
        </div>

        {/* Kolom Kanan: Detail & Alur Tindakan Disposisi */}
        {item ? (
          <article className="space-y-4 border rounded-xl p-5 border-slate-200 dark:border-white/10 bg-white/60 dark:bg-slate-900/40 shadow-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 block mb-1">
                {item.kind === 'masuk' ? 'Lembar Disposisi & Detail Surat Masuk' : 'Detail Alur Surat'}
              </span>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{item.subject}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {item.sender} → {item.recipient}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {item.kind === 'masuk' ? 'Surat Masuk' : 'Draft Surat Keluar'} · {item.number || `Draft #${item.id}`} · {item.date} · {statuses[item.status] || item.status}
              </p>
            </div>

            {!editor && (
              <p className="text-[11px] font-semibold rounded-lg px-3 py-2 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300">
                Mode baca saja: Anda dapat melihat isi dan lampiran surat{canComplete ? ', serta menyelesaikan disposisi yang ditujukan kepada Anda' : ''}.
              </p>
            )}

            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Isi / Ringkasan Surat</p>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-black/30 border border-slate-200/80 dark:border-white/5 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {item.content?.trim() || <span className="italic text-slate-400">Isi surat belum diisi.</span>}
              </div>
            </div>

            {item.file_id && (
              <button
                className={`${button} !px-3 !py-1.5 !text-xs`}
                disabled={busy}
                onClick={() => void run(() => download(`/files/${item.file_id}`, `lampiran-${item.id}`))}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Lampiran Berkas</span>
              </button>
            )}

            {/* Aksi & Catatan Disposisi */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/10">
              {hasActions && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Catatan Tindakan
                </label>
                <textarea
                  rows={2}
                  className={field}
                  placeholder="Tuliskan catatan disposisi atau instruksi pemeriksaan..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              )}

              {canEditDraft && (
                <div className="space-y-2">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Perbaiki Isi Surat
                    </label>
                    <textarea
                      rows={3}
                      className={field}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button className={button} disabled={busy} onClick={() => act('edit')}>
                      Simpan Revisi
                    </button>
                    <button className={`${button} !bg-slate-700 hover:!bg-slate-800`} disabled={busy} onClick={() => act('submit')}>
                      Ajukan Verifikasi
                    </button>
                  </div>
                </div>
              )}

              {canReview && (
                <div className="flex gap-2 pt-1">
                  <button className={button} disabled={busy} onClick={() => act('approve')}>
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Lolos Pemeriksaan Internal</span>
                  </button>
                  <button
                    className={`${button} !bg-slate-700 hover:!bg-slate-800`}
                    disabled={busy}
                    onClick={() => act('revise')}
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Minta Revisi</span>
                  </button>
                </div>
              )}

              {canAssign && (
                <div className="space-y-2 pt-1">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Penerima Disposisi
                    </label>
                    <select className={field} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                      <option value="">Pilih Pegawai Penerima Disposisi</option>
                      {people
                        .filter((p) => p.is_active)
                        .map((p) => (
                          <option key={p.id_pegawai} value={p.id_pegawai}>
                            {p.nama}
                          </option>
                        ))}
                    </select>
                  </div>
                  <button className={button} disabled={busy || !assignee} onClick={() => act('assign')}>
                    <Send className="w-3.5 h-3.5" />
                    <span>Kirim Disposisi Internal</span>
                  </button>
                </div>
              )}

              {canComplete && (
                <div className="pt-1">
                  <button className={button} disabled={busy} onClick={() => act('complete')}>
                    <Check className="w-3.5 h-3.5" />
                    <span>Selesaikan Disposisi</span>
                  </button>
                </div>
              )}

              {canArchive && (
                <div className="pt-1">
                  <button className={`${button} !bg-slate-800 hover:!bg-slate-900`} disabled={busy} onClick={() => act('archive')}>
                    <Archive className="w-3.5 h-3.5" />
                    <span>Arsipkan Alur</span>
                  </button>
                </div>
              )}

              {/* Riwayat Alur Server */}
              <div className="pt-3 border-t border-slate-200 dark:border-white/10 space-y-2">
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">Riwayat Alur Surat</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {item.history.map((h, i) => (
                    <div key={i} className="text-xs p-2.5 rounded-lg bg-slate-50 dark:bg-black/20 border border-slate-200/60 dark:border-white/5 space-y-0.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>{new Date(h.at).toLocaleString('id-ID')}</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{h.actor}</span>
                      </div>
                      <p className="font-medium text-slate-800 dark:text-slate-200">{h.action}</p>
                      {h.note && <p className="text-slate-500 dark:text-slate-400 italic">"{h.note}"</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>
        ) : (
          <div className="hidden lg:flex items-center justify-center p-8 border border-dashed rounded-xl border-slate-200 dark:border-white/10 text-xs text-slate-400">
            Pilih salah satu surat dari daftar di sebelah kiri untuk melihat detail alur dan disposisi.
          </div>
        )}
      </div>

      {/* Navigasi Paginasi Tipis & Ramping */}
      <nav className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/10 text-xs">
        <button
          className={`${button} !px-3 !py-1.5 !text-xs`}
          disabled={busy || page === 0}
          onClick={() => {
            setSelected(null)
            setPage(page - 1)
          }}
        >
          Sebelumnya
        </button>
        <span className="text-slate-500 dark:text-slate-400 font-medium">Halaman {page + 1}</span>
        <button
          className={`${button} !px-3 !py-1.5 !text-xs`}
          disabled={busy || !hasNext}
          onClick={() => {
            setSelected(null)
            setPage(page + 1)
          }}
        >
          Berikutnya
        </button>
      </nav>
    </Workspace>
  )
}
