import { useEffect, useRef, useState } from 'react'
import { request, requestWithTotal, download, fetchFilePreview, message } from '../../../services/operations'
import { filesApi } from '../../../services/api'
import { showToast as notify } from '../../../services/activity'
import { useAuth } from '../../context/AuthContext'
import { Workspace, field, button, useOperation, SkeletonTable } from '../ui/operations'
import { ArsipBulkImport, type KlasifikasiOption } from './ArsipBulkImport'
import {
  Search, Trash2, Archive as ArchiveIcon, UploadCloud, Download, RotateCcw,
  Loader2, Filter, RefreshCw, X, Eye, ExternalLink, Pencil, ShieldAlert,
  ShieldCheck, Lock, History, Layers, KeyRound, FileCheck2,
} from 'lucide-react'

interface Archive {
  id_dokumen: number
  nama_dokumen: string
  nomor_dokumen: string
  kategori: string
  event: string
  hak_akses: string
  tanggal_dokumen: string
  file_path: string | null
  id_klasifikasi?: number | null
  kode_klasifikasi?: string | null
  nama_klasifikasi?: string | null
  status_retensi?: string
  nasib_akhir?: string | null
  tanggal_retensi_aktif?: string | null
  tanggal_retensi_inaktif?: string | null
  arsip_vital?: boolean
  legal_hold?: boolean
  legal_hold_alasan?: string | null
  lokasi_fisik?: string | null
  nomor_berkas?: string | null
  sha256_hash?: string | null
  versi_dokumen?: number
  parent_dokumen_id?: number | null
  nama_pengunggah?: string
  sumber_modul?: string
  sub_kategori?: string | null
  ref_tipe?: string | null
  id_pegawai?: number
  dihapus_oleh?: number | null
  hapus_status?: 'diajukan' | 'ditolak' | null
  hapus_alasan?: string | null
  hapus_catatan_admin?: string | null
  hapus_diajukan_pada?: string | null
  nama_pengaju_hapus?: string | null
}

interface FilterOptions {
  years: number[]
  sumber_modul: string[]
  sub_kategori: Record<string, string[]>
  status_retensi?: string[]
}

interface AccessGrantItem {
  id: number
  id_dokumen: number
  id_pegawai: number
  nama_pegawai?: string | null
  alasan?: string | null
  valid_until?: string | null
  created_at: string
}

interface AuditLogItem {
  id: number
  aksi: string
  actor_nama?: string | null
  detail?: string | null
  created_at: string
}

interface PegawaiOption {
  id_pegawai: number
  nama: string
  nip: string
}

const SUMBER_LABEL: Record<string, string> = {
  arsip: 'Arsip Umum (Unggahan)',
  surat: 'Surat Menyurat',
  realisasi: 'Realisasi Anggaran',
}

const SUB_LABEL: Record<string, string> = {
  arsip: 'Semua Sub-Kategori',
  surat: 'Semua Jenis Surat',
  realisasi: 'Semua Akun Anggaran',
}

const SKKAAD_META: Record<string, { label: string; cls: string }> = {
  sangat_rahasia: { label: 'SANGAT RAHASIA', cls: 'bg-red-700 text-white' },
  rahasia: { label: 'RAHASIA', cls: 'bg-rose-600/15 text-rose-600 dark:text-rose-400 border border-rose-500/30' },
  terbatas: { label: 'TERBATAS', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30' },
  internal: { label: 'INTERNAL', cls: 'bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-300' },
  biasa: { label: 'BIASA', cls: 'bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-300' },
  publik: { label: 'PUBLIK', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
}

const RETENSI_META: Record<string, { label: string; cls: string }> = {
  aktif: { label: 'JRA: Aktif', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  inaktif: { label: 'JRA: Inaktif', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  siap_susut: { label: 'JRA: Siap Susut', cls: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 font-bold' },
  disusutkan: { label: 'Disusutkan', cls: 'bg-slate-500/20 text-slate-500' },
}

export function ArsipView({ theme }: { theme: 'light' | 'dark' }) {
  const isDark = theme === 'dark'
  const [items, setItems] = useState<Archive[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [trash, setTrash] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [klasifikasiList, setKlasifikasiList] = useState<KlasifikasiOption[]>([])
  const [pegawaiList, setPegawaiList] = useState<PegawaiOption[]>([])

  const [form, setForm] = useState({
    nama_dokumen: '',
    nomor_dokumen: '',
    kategori: 'Laporan',
    event: '',
    tanggal_dokumen: new Date().toLocaleDateString('en-CA'),
    hak_akses: 'internal',
    id_klasifikasi: '',
    lokasi_fisik: '',
    nomor_berkas: '',
    arsip_vital: false,
    legal_hold: false,
    legal_hold_alasan: '',
  })

  const { busy, error, run, setError } = useOperation()
  const { userRole, currentUser } = useAuth()
  const isAdmin = userRole === 'Admin'

  const [onlyRequests, setOnlyRequests] = useState(false)
  const [requestFor, setRequestFor] = useState<number | null>(null)
  const [requestReason, setRequestReason] = useState('')
  const [rejectFor, setRejectFor] = useState<number | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [sumber, setSumber] = useState('')
  const [subKategori, setSubKategori] = useState('')
  const [tahun, setTahun] = useState('')
  const [retensiFilter, setRetensiFilter] = useState('')
  const [aksesFilter, setAksesFilter] = useState('')
  const [options, setOptions] = useState<FilterOptions>({ years: [], sumber_modul: [], sub_kategori: {} })
  const [reloadKey, setReloadKey] = useState(0)
  const [previewDoc, setPreviewDoc] = useState<{ title: string; url: string; contentType: string; text?: string; filePath: string } | null>(null)

  // Modals: Edit Metadata, Version History, SKKAAD Access Grants, Audit Log
  const [editDoc, setEditDoc] = useState<Archive | null>(null)
  const [editForm, setEditForm] = useState({
    nama_dokumen: '',
    nomor_dokumen: '',
    kategori: '',
    event: '',
    tanggal_dokumen: '',
    hak_akses: 'internal',
    id_klasifikasi: '',
    lokasi_fisik: '',
    nomor_berkas: '',
    arsip_vital: false,
    legal_hold: false,
    legal_hold_alasan: '',
  })
  const [versionDoc, setVersionDoc] = useState<Archive | null>(null)
  const [versions, setVersions] = useState<Archive[]>([])
  const [versionFile, setVersionFile] = useState<File | null>(null)
  const [versionNote, setVersionNote] = useState('')

  const [grantDoc, setGrantDoc] = useState<Archive | null>(null)
  const [grants, setGrants] = useState<AccessGrantItem[]>([])
  const [grantPegawaiId, setGrantPegawaiId] = useState('')
  const [grantAlasan, setGrantAlasan] = useState('')
  const [grantValidUntil, setGrantValidUntil] = useState('')

  const [auditDoc, setAuditDoc] = useState<Archive | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([])

  const closePreview = () => {
    if (previewDoc?.url) URL.revokeObjectURL(previewDoc.url)
    previewUrlRef.current = null
    setPreviewDoc(null)
  }

  useEffect(() => {
    previewUrlRef.current = previewDoc?.url ?? null
  }, [previewDoc])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  const load = async (overridePage?: number) => {
    const activePage = overridePage ?? page
    const params = new URLSearchParams({ limit: '50', skip: String(activePage * 50), search })
    if (sumber) params.set('sumber_modul', sumber)
    if (subKategori) params.set('sub_kategori', subKategori)
    if (tahun) params.set('year', tahun)
    if (retensiFilter) params.set('status_retensi', retensiFilter)
    if (aksesFilter) params.set('hak_akses', aksesFilter)
    if (trash && onlyRequests) params.set('hapus_status', 'diajukan')
    const { data, total } = await requestWithTotal<Archive[]>(`/arsip/${trash ? 'trash' : ''}?${params}`)
    setItems(data)
    setTotalItems(total)
  }

  const triggerSearch = () => {
    setPage(0)
    void run(() => load(0))
  }

  const loadOptions = () =>
    request<FilterOptions>('/arsip/filter-options')
      .then((o) => setOptions({ years: o.years ?? [], sumber_modul: o.sumber_modul ?? [], sub_kategori: o.sub_kategori ?? {}, status_retensi: o.status_retensi ?? [] }))
      .catch(() => notify('error', 'Pilihan filter arsip gagal dimuat'))

  useEffect(() => {
    void loadOptions()
    request<KlasifikasiOption[]>('/surat/klasifikasi').then(setKlasifikasiList).catch(() => {})
    request<PegawaiOption[]>('/pegawai/?limit=500').then(setPegawaiList).catch(() => {})
  }, [])

  useEffect(() => {
    load().catch((e) => setError(message(e)))
  }, [trash, page, sumber, subKategori, tahun, retensiFilter, aksesFilter, reloadKey, onlyRequests])

  const openEditModal = (doc: Archive) => {
    setEditDoc(doc)
    setEditForm({
      nama_dokumen: doc.nama_dokumen,
      nomor_dokumen: doc.nomor_dokumen,
      kategori: doc.kategori,
      event: doc.event || '',
      tanggal_dokumen: doc.tanggal_dokumen,
      hak_akses: doc.hak_akses,
      id_klasifikasi: doc.id_klasifikasi ? String(doc.id_klasifikasi) : '',
      lokasi_fisik: doc.lokasi_fisik || '',
      nomor_berkas: doc.nomor_berkas || '',
      arsip_vital: Boolean(doc.arsip_vital),
      legal_hold: Boolean(doc.legal_hold),
      legal_hold_alasan: doc.legal_hold_alasan || '',
    })
  }

  const openVersionsModal = async (doc: Archive) => {
    setVersionDoc(doc)
    setVersionFile(null)
    setVersionNote('')
    try {
      const list = await request<Archive[]>(`/arsip/${doc.id_dokumen}/versi`)
      setVersions(list)
    } catch (e) {
      notify('error', message(e))
    }
  }

  const openGrantsModal = async (doc: Archive) => {
    setGrantDoc(doc)
    setGrantPegawaiId('')
    setGrantAlasan('')
    setGrantValidUntil('')
    try {
      const list = await request<AccessGrantItem[]>(`/arsip/${doc.id_dokumen}/access-grants`)
      setGrants(list)
    } catch (e) {
      notify('error', message(e))
    }
  }

  const openAuditModal = async (doc: Archive) => {
    setAuditDoc(doc)
    try {
      const list = await request<AuditLogItem[]>(`/arsip/${doc.id_dokumen}/audit-log`)
      setAuditLogs(list)
    } catch (e) {
      notify('error', message(e))
    }
  }

  const sumberOptions = [...new Set(['surat', 'realisasi', 'arsip', ...options.sumber_modul])]
  const subOptions = sumber ? options.sub_kategori[sumber] ?? [] : []
  const filtersActive = Boolean(sumber || subKategori || tahun || retensiFilter || aksesFilter || search)
  const resetFilters = () => {
    setSumber('')
    setSubKategori('')
    setTahun('')
    setRetensiFilter('')
    setAksesFilter('')
    setSearch('')
    setPage(0)
    setReloadKey((k) => k + 1)
    notify('info', 'Filter arsip direset')
  }

  const fieldCompact =
    'w-full rounded-lg border px-3 py-1.5 text-xs transition-all outline-hidden ' +
    'bg-white border-slate-300 text-slate-800 placeholder:text-slate-400 focus:border-red-600 focus:ring-1 focus:ring-red-600 shadow-2xs ' +
    'dark:bg-[#111827]/80 dark:border-white/10 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-red-500'

  const buttonCompact =
    'btn-kpu-red px-3 py-1.5 text-white font-medium text-xs rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none shrink-0 shadow-2xs'

  const formFields = [
    { key: 'nama_dokumen', label: 'Nama Dokumen', type: 'text', placeholder: 'Masukkan nama dokumen', required: true },
    { key: 'nomor_dokumen', label: 'Nomor Dokumen', type: 'text', placeholder: 'Contoh: 001/KPU/2026', required: true },
    { key: 'kategori', label: 'Kategori Dokumen', type: 'text', placeholder: 'Laporan, Surat, SK, dll.', required: true },
    { key: 'event', label: 'Kegiatan / Event', type: 'text', placeholder: 'Nama kegiatan (opsional)', required: false },
    { key: 'tanggal_dokumen', label: 'Tanggal Dokumen', type: 'date', placeholder: '', required: true },
    { key: 'lokasi_fisik', label: 'Lokasi Fisik (Opsional)', type: 'text', placeholder: 'Lemari B / Rak 2 / Boks 04', required: false },
    { key: 'nomor_berkas', label: 'Nomor Berkas (Opsional)', type: 'text', placeholder: 'BRK-2026-01', required: false },
  ] as const

  return (
    <Workspace
      theme={theme}
      category="Arsip"
      title="Arsip Dokumen"
      description="Repositori Digital, Klasifikasi JRA (PKPU 17/2023), dan Pengamanan SKKAAD (PKPU 7/2021) KPU Provinsi Sulawesi Utara"
    >
      {error && (
        <div role="alert" className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Bar Pencarian & Tombol Aksi */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <input
            aria-label="Cari arsip"
            className={fieldCompact}
            placeholder="Cari judul, nomor dokumen, lokasi fisik, atau isi teks PDF/DOCX..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') triggerSearch()
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <button className={buttonCompact} disabled={busy} onClick={triggerSearch}>
            <Search className="w-3.5 h-3.5" />
            <span>Cari</span>
          </button>
          {isAdmin && (
            <button
              className={buttonCompact}
              disabled={busy}
              title="Salin ulang seluruh dokumen Surat Menyurat dan bukti Realisasi Anggaran ke arsip"
              onClick={() =>
                void run(async () => {
                  const res = await request<{ surat: number; realisasi: number }>('/arsip/sinkronkan', 'POST')
                  notify('success', `Arsip tersinkron: ${res.surat} dokumen surat, ${res.realisasi} bukti realisasi`)
                  await loadOptions()
                  await load()
                })
              }
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
              <span>Sinkronkan</span>
            </button>
          )}
          <button
            className={buttonCompact}
            onClick={() => {
              setTrash(!trash)
              setOnlyRequests(false)
              setRequestFor(null)
              setRejectFor(null)
              setPage(0)
            }}
          >
            {trash ? (
              <>
                <ArchiveIcon className="w-3.5 h-3.5" />
                <span>Arsip Aktif</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Tempat Sampah</span>
              </>
            )}
          </button>
        </div>
      </div>

      {trash && isAdmin && (
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyRequests}
            onChange={(e) => {
              setOnlyRequests(e.target.checked)
              setPage(0)
            }}
          />
          Tampilkan hanya permintaan hapus permanen yang menunggu persetujuan
        </label>
      )}

      {/* Filter Bertingkat: Modul -> Sub-kategori -> Tahun -> JRA -> SKKAAD */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20">
        <span className="flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400">
          <Filter className="w-3.5 h-3.5" /> Filter:
        </span>
        <select
          aria-label="Filter modul asal dokumen"
          className={`${fieldCompact} !w-auto`}
          value={sumber}
          onChange={(e) => {
            setSumber(e.target.value)
            setSubKategori('')
            setPage(0)
          }}
        >
          <option value="">Semua Modul</option>
          {sumberOptions.map((s) => (
            <option key={s} value={s}>{SUMBER_LABEL[s] ?? s}</option>
          ))}
        </select>
        {sumber && (
          <select
            aria-label="Filter sub-kategori dokumen"
            className={`${fieldCompact} !w-auto max-w-xs`}
            value={subKategori}
            disabled={subOptions.length === 0}
            onChange={(e) => {
              setSubKategori(e.target.value)
              setPage(0)
            }}
          >
            <option value="">{subOptions.length ? SUB_LABEL[sumber] ?? 'Semua' : 'Belum ada dokumen pada modul ini'}</option>
            {subOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        <select
          aria-label="Filter tahun dokumen"
          className={`${fieldCompact} !w-auto`}
          value={tahun}
          onChange={(e) => {
            setTahun(e.target.value)
            setPage(0)
          }}
        >
          <option value="">Semua Tahun</option>
          {options.years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          aria-label="Filter status retensi JRA"
          className={`${fieldCompact} !w-auto`}
          value={retensiFilter}
          onChange={(e) => {
            setRetensiFilter(e.target.value)
            setPage(0)
          }}
        >
          <option value="">Semua Retensi JRA</option>
          <option value="aktif">Aktif</option>
          <option value="inaktif">Inaktif</option>
          <option value="siap_susut">Siap Susut</option>
          <option value="disusutkan">Disusutkan</option>
        </select>
        <select
          aria-label="Filter hak akses SKKAAD"
          className={`${fieldCompact} !w-auto`}
          value={aksesFilter}
          onChange={(e) => {
            setAksesFilter(e.target.value)
            setPage(0)
          }}
        >
          <option value="">Semua SKKAAD</option>
          <option value="internal">Internal / Biasa</option>
          <option value="terbatas">Terbatas</option>
          <option value="rahasia">Rahasia</option>
          <option value="sangat_rahasia">Sangat Rahasia</option>
        </select>
        {filtersActive && (
          <button type="button" onClick={resetFilters} className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1 cursor-pointer">
            <X className="w-3.5 h-3.5" /> Reset
          </button>
        )}
      </div>

      {/* Form Unggah Dokumen Baru */}
      {!trash && (
        <details className="group border rounded-xl border-slate-200 dark:border-white/10 overflow-hidden bg-slate-50/50 dark:bg-black/20 transition-all">
          <summary className="cursor-pointer font-semibold text-xs tracking-wide px-4 py-3 select-none flex items-center justify-between text-slate-800 dark:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-white/5 transition-colors">
            <span className="flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-red-600 dark:text-red-500" />
              Unggah Dokumen Baru (JRA & SKKAAD)
            </span>
            <span className="text-[10px] text-slate-400 font-normal group-open:rotate-180 transition-transform">▼</span>
          </summary>

          <form
            className="p-4 sm:p-5 border-t border-slate-200 dark:border-white/10 space-y-4 bg-white/70 dark:bg-slate-900/40"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                if (!file) throw new Error('Silakan pilih berkas dokumen terlebih dahulu')
                await filesApi.uploadThen(file, 'arsip', async (uploaded) => {
                  if ((uploaded as { sha256_hash?: string }).sha256_hash) {
                    const dups = await request<Archive[]>(`/arsip/cek-duplikat?sha256=${(uploaded as { sha256_hash?: string }).sha256_hash}`).catch(() => [])
                    if (dups.length > 0) {
                      notify('info', `Perhatian: ditemukan ${dups.length} arsip lain dengan isi berkas identik (${dups[0].nomor_dokumen})`)
                    }
                  }
                  return request('/arsip/', 'POST', {
                    nama_dokumen: form.nama_dokumen,
                    nomor_dokumen: form.nomor_dokumen,
                    kategori: form.kategori,
                    event: form.event.trim() || null,
                    tanggal_dokumen: form.tanggal_dokumen,
                    hak_akses: form.hak_akses,
                    id_klasifikasi: form.id_klasifikasi ? Number(form.id_klasifikasi) : null,
                    lokasi_fisik: form.lokasi_fisik.trim() || null,
                    nomor_berkas: form.nomor_berkas.trim() || null,
                    arsip_vital: form.arsip_vital,
                    legal_hold: isAdmin ? form.legal_hold : false,
                    legal_hold_alasan: isAdmin && form.legal_hold ? form.legal_hold_alasan.trim() || null : null,
                    id_pegawai: 0,
                    file_path: String(uploaded.file_id),
                    ukuran_file: uploaded.size,
                  })
                })
                setForm({
                  ...form,
                  nama_dokumen: '',
                  nomor_dokumen: '',
                  lokasi_fisik: '',
                  nomor_berkas: '',
                  arsip_vital: false,
                  legal_hold: false,
                  legal_hold_alasan: '',
                })
                setFile(null)
                if (uploadInputRef.current) uploadInputRef.current.value = ''
                await loadOptions()
                await load()
              })
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {formFields.map(({ key, label, type, placeholder, required }) => (
                <div key={key} className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {label} {required && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    required={required}
                    type={type}
                    className={field}
                    placeholder={placeholder}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </div>
              ))}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Kode Klasifikasi (Kep KPU 1257/2024)
                </label>
                <select
                  className={field}
                  value={form.id_klasifikasi}
                  onChange={(e) => setForm({ ...form, id_klasifikasi: e.target.value })}
                >
                  <option value="">-- Tanpa Kode Klasifikasi --</option>
                  {klasifikasiList.map((k) => (
                    <option key={k.id_klasifikasi} value={k.id_klasifikasi}>
                      {k.kode_klasifikasi} — {k.nama_klasifikasi}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Klasifikasi Keamanan (SKKAAD) <span className="text-red-500">*</span>
                </label>
                <select
                  className={field}
                  value={form.hak_akses}
                  onChange={(e) => setForm({ ...form, hak_akses: e.target.value })}
                >
                  <option value="internal">Internal / Biasa (Semua Pegawai)</option>
                  <option value="terbatas">Terbatas (Bagian Pengunggah & Admin)</option>
                  <option value="rahasia">Rahasia (Pemilik, Penerima Izin & Admin)</option>
                  <option value="sangat_rahasia">Sangat Rahasia (Tertutup Ketat)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-5 pt-1 text-xs">
              <label className="inline-flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.arsip_vital}
                  onChange={(e) => setForm({ ...form, arsip_vital: e.target.checked })}
                />
                Tandai sebagai Arsip Vital (dilindungi dari pemusnahan)
              </label>
              {isAdmin && (
                <label className="inline-flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.legal_hold}
                    onChange={(e) => setForm({ ...form, legal_hold: e.target.checked })}
                  />
                  Legal Hold (Tahan untuk Audit / Sengketa)
                </label>
              )}
            </div>

            {isAdmin && form.legal_hold && (
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-amber-700 dark:text-amber-300">Alasan Legal Hold</label>
                <input
                  className={field}
                  placeholder="Contoh: Pemeriksaan BPK / Sengketa PHPU MK"
                  value={form.legal_hold_alasan}
                  onChange={(e) => setForm({ ...form, legal_hold_alasan: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Pilih Berkas Dokumen <span className="text-red-500">*</span>
              </label>
              <input
                ref={uploadInputRef}
                aria-label="Berkas arsip"
                required
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className={`${field} file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-red-600 file:text-white file:cursor-pointer hover:file:bg-red-700`}
              />
            </div>

            <div className="pt-2">
              <button className={button} disabled={busy}>
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{busy ? 'Mengunggah Dokumen...' : 'Unggah dan Simpan'}</span>
              </button>
            </div>
          </form>
        </details>
      )}

      {/* Impor Massal */}
      {!trash && (
        <ArsipBulkImport
          klasifikasiList={klasifikasiList}
          onImported={async () => {
            await loadOptions()
            await load()
          }}
        />
      )}

      {/* List Dokumen Arsip */}
      {busy && !items.length ? (
        <SkeletonTable rows={5} cols={3} />
      ) : !items.length ? (
        <div className="text-center py-8 text-xs text-slate-400 dark:text-slate-500">
          {filtersActive ? 'Tidak ada dokumen yang cocok dengan filter.' : 'Tidak ada dokumen pada halaman ini.'}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((x) => {
            const sk = SKKAAD_META[x.hak_akses] ?? SKKAAD_META.internal
            const ret = RETENSI_META[x.status_retensi ?? 'aktif'] ?? RETENSI_META.aktif
            const canManage = isAdmin || x.id_pegawai === currentUser?.id_pegawai
            return (
              <article
                className="rounded-xl border border-slate-200 dark:border-white/10 p-4 space-y-2 bg-white/40 dark:bg-black/20 hover:border-red-500/30 transition-all shadow-xs"
                key={x.id_dokumen}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100">{x.nama_dokumen}</h2>
                    {(x.versi_dokumen ?? 1) > 1 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                        v{x.versi_dokumen}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 font-mono self-start sm:self-auto">
                    {x.nomor_dokumen}
                  </span>
                </div>

                {/* Badges: Modul, SKKAAD, JRA, Klasifikasi, Vital, Legal Hold */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-600/10 text-red-600 dark:text-red-400">
                    {SUMBER_LABEL[x.sumber_modul ?? 'arsip'] ?? x.sumber_modul}
                  </span>
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${sk.cls}`}>
                    {sk.label}
                  </span>
                  {x.kode_klasifikasi && (
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                      {x.kode_klasifikasi}
                    </span>
                  )}
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ret.cls}`}>
                    {ret.label}{x.nasib_akhir ? ` · ${x.nasib_akhir}` : ''}
                  </span>
                  {x.arsip_vital && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> ARSIP VITAL
                    </span>
                  )}
                  {x.legal_hold && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-600 text-white inline-flex items-center gap-1" title={x.legal_hold_alasan || undefined}>
                      <Lock className="w-3 h-3" /> LEGAL HOLD
                    </span>
                  )}
                  {x.sub_kategori && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                      {x.sub_kategori}
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {x.tanggal_dokumen} · Kategori: {x.kategori}
                  {x.tanggal_retensi_inaktif && ` · JRA s.d. ${x.tanggal_retensi_inaktif}`}
                  {x.lokasi_fisik && ` · Lokasi: ${x.lokasi_fisik}`}
                  {x.nomor_berkas && ` · Berkas: ${x.nomor_berkas}`}
                  {!x.file_path && ' · Tanpa berkas lampiran'}
                </p>

                {(x.event || x.nama_pengunggah || x.sha256_hash) && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 flex flex-wrap items-center gap-x-2">
                    {x.event && <span>Kegiatan: {x.event}</span>}
                    {x.nama_pengunggah && <span>· Pengunggah: {x.nama_pengunggah}</span>}
                    {x.sha256_hash && (
                      <span className="font-mono inline-flex items-center gap-1" title={`SHA-256: ${x.sha256_hash}`}>
                        · <FileCheck2 className="w-3 h-3 text-emerald-500" /> {x.sha256_hash.slice(0, 12)}…
                      </span>
                    )}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {x.file_path && /^\d+$/.test(x.file_path) && (
                    <>
                      <button
                        className={`${button} !px-2.5 !py-1.5 !text-xs`}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const res = await fetchFilePreview(`/files/${x.file_path}`)
                            setPreviewDoc({
                              title: x.nama_dokumen,
                              url: res.url,
                              contentType: res.contentType,
                              text: res.text,
                              filePath: x.file_path!,
                            })
                          })
                        }
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Buka</span>
                      </button>
                      <button
                        className={`${button} !px-2.5 !py-1.5 !text-xs !bg-slate-600 hover:!bg-slate-700`}
                        disabled={busy}
                        onClick={() => void run(() => download(`/files/${x.file_path}`, x.nama_dokumen))}
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Unduh</span>
                      </button>
                    </>
                  )}

                  {!trash && canManage && (
                    <>
                      <button
                        className={`${button} !px-2.5 !py-1.5 !text-xs !bg-slate-700 hover:!bg-slate-800`}
                        disabled={busy}
                        onClick={() => openEditModal(x)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        className={`${button} !px-2.5 !py-1.5 !text-xs !bg-indigo-600 hover:!bg-indigo-700`}
                        disabled={busy}
                        onClick={() => void openVersionsModal(x)}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Versi</span>
                      </button>
                      {['terbatas', 'rahasia', 'sangat_rahasia'].includes(x.hak_akses) && (
                        <button
                          className={`${button} !px-2.5 !py-1.5 !text-xs !bg-amber-600 hover:!bg-amber-700`}
                          disabled={busy}
                          onClick={() => void openGrantsModal(x)}
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Izin Akses</span>
                        </button>
                      )}
                    </>
                  )}

                  <button
                    className={`${button} !px-2.5 !py-1.5 !text-xs !bg-slate-600 hover:!bg-slate-700`}
                    disabled={busy}
                    onClick={() => void openAuditModal(x)}
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Audit</span>
                  </button>

                  <button
                    className={`${button} !px-2.5 !py-1.5 !text-xs !bg-slate-700 hover:!bg-slate-800`}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await request(`/arsip/${x.id_dokumen}/${trash ? 'restore' : 'delete'}`, 'PATCH')
                        await load()
                      })
                    }
                  >
                    {trash ? (
                      <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Pulihkan</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Sampah</span>
                      </>
                    )}
                  </button>

                  {trash && x.ref_tipe && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Dokumen sinkronisasi modul tidak dapat dihapus permanen.
                    </span>
                  )}
                  {trash && !x.ref_tipe && !isAdmin && x.hapus_status !== 'diajukan' && x.id_pegawai === currentUser?.id_pegawai && (
                    <button
                      className={`${button} !px-2.5 !py-1.5 !text-xs !bg-red-700 hover:!bg-red-800`}
                      disabled={busy}
                      onClick={() => {
                        setRequestFor(requestFor === x.id_dokumen ? null : x.id_dokumen)
                        setRequestReason('')
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{x.hapus_status === 'ditolak' ? 'Ajukan Ulang' : 'Ajukan Hapus Permanen'}</span>
                    </button>
                  )}
                  {trash && !x.ref_tipe && isAdmin && (
                    <>
                      <button
                        className={`${button} !px-2.5 !py-1.5 !text-xs !bg-red-700 hover:!bg-red-800`}
                        disabled={busy}
                        onClick={() => {
                          const pesan = x.hapus_status === 'diajukan'
                            ? `Setujui permintaan ${x.nama_pengaju_hapus ?? 'pengguna'} dan hapus "${x.nama_dokumen}" secara permanen?`
                            : `Yakin ingin menghapus dokumen "${x.nama_dokumen}" secara permanen?`
                          if (window.confirm(pesan)) {
                            void run(async () => {
                              await request(`/arsip/${x.id_dokumen}/permanent`, 'DELETE')
                              await loadOptions()
                              await load()
                            })
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{x.hapus_status === 'diajukan' ? 'Setujui & Hapus Permanen' : 'Hapus Permanen'}</span>
                      </button>
                      {x.hapus_status === 'diajukan' && (
                        <button
                          className={`${button} !px-2.5 !py-1.5 !text-xs !bg-slate-700 hover:!bg-slate-800`}
                          disabled={busy}
                          onClick={() => {
                            setRejectFor(rejectFor === x.id_dokumen ? null : x.id_dokumen)
                            setRejectNote('')
                          }}
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Tolak</span>
                        </button>
                      )}
                    </>
                  )}
                </div>

                {trash && x.hapus_status === 'diajukan' && (
                  <p className="text-[11px] font-semibold rounded-lg px-3 py-2 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                    Menunggu persetujuan admin · diajukan oleh {x.nama_pengaju_hapus ?? 'pengguna'}
                    {x.hapus_alasan ? ` · Alasan: ${x.hapus_alasan}` : ''}
                  </p>
                )}
                {trash && x.hapus_status === 'ditolak' && (
                  <p className="text-[11px] font-semibold rounded-lg px-3 py-2 bg-red-500/10 text-red-600 dark:text-red-400">
                    Permintaan hapus permanen ditolak admin{x.hapus_catatan_admin ? `: ${x.hapus_catatan_admin}` : ''}
                  </p>
                )}

                {requestFor === x.id_dokumen && (
                  <form
                    className="space-y-2 rounded-lg border border-slate-200 dark:border-white/10 p-3"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (requestReason.trim().length < 5) {
                        notify('error', 'Tuliskan alasan minimal 5 karakter')
                        return
                      }
                      void run(async () => {
                        await request(`/arsip/${x.id_dokumen}/ajukan-hapus`, 'POST', { alasan: requestReason.trim() })
                        setRequestFor(null)
                        setRequestReason('')
                        await load()
                      })
                    }}
                  >
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Alasan hapus permanen *
                    </label>
                    <textarea
                      autoFocus
                      rows={2}
                      maxLength={255}
                      className={fieldCompact}
                      value={requestReason}
                      onChange={(e) => setRequestReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button className={buttonCompact} disabled={busy}>Kirim Permintaan</button>
                      <button type="button" className="text-xs font-semibold text-slate-500 hover:underline cursor-pointer" onClick={() => setRequestFor(null)}>
                        Batal
                      </button>
                    </div>
                  </form>
                )}

                {rejectFor === x.id_dokumen && (
                  <form
                    className="space-y-2 rounded-lg border border-slate-200 dark:border-white/10 p-3"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (rejectNote.trim().length < 3) {
                        notify('error', 'Tuliskan catatan penolakan minimal 3 karakter')
                        return
                      }
                      void run(async () => {
                        await request(`/arsip/${x.id_dokumen}/tolak-hapus`, 'POST', { catatan: rejectNote.trim() })
                        setRejectFor(null)
                        setRejectNote('')
                        await load()
                      })
                    }}
                  >
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Catatan penolakan *
                    </label>
                    <textarea
                      autoFocus
                      rows={2}
                      maxLength={255}
                      className={fieldCompact}
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button className={buttonCompact} disabled={busy}>Tolak Permintaan</button>
                      <button type="button" className="text-xs font-semibold text-slate-500 hover:underline cursor-pointer" onClick={() => setRejectFor(null)}>
                        Batal
                      </button>
                    </div>
                  </form>
                )}
              </article>
            )
          })}
        </div>
      )}

      {/* Paginasi */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/10 text-xs">
        <button className={`${button} !px-3 !py-1.5 !text-xs`} disabled={page === 0 || busy} onClick={() => setPage(page - 1)}>
          Sebelumnya
        </button>
        <span className="text-slate-500 dark:text-slate-400 font-medium">
          Halaman {page + 1} / {Math.max(1, Math.ceil(totalItems / 50))} · {totalItems} dokumen
        </span>
        <button className={`${button} !px-3 !py-1.5 !text-xs`} disabled={(page + 1) * 50 >= totalItems || busy} onClick={() => setPage(page + 1)}>
          Berikutnya
        </button>
      </div>

      {/* Modal Edit Metadata */}
      {editDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <form
            className={`w-full max-w-2xl rounded-2xl border p-5 space-y-4 max-h-[90vh] overflow-y-auto ${
              isDark ? 'bg-[#0f172a] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                const payload: Record<string, unknown> = {
                  nama_dokumen: editForm.nama_dokumen,
                  nomor_dokumen: editForm.nomor_dokumen,
                  kategori: editForm.kategori,
                  event: editForm.event.trim() || null,
                  tanggal_dokumen: editForm.tanggal_dokumen,
                  id_klasifikasi: editForm.id_klasifikasi ? Number(editForm.id_klasifikasi) : null,
                  lokasi_fisik: editForm.lokasi_fisik.trim() || null,
                  nomor_berkas: editForm.nomor_berkas.trim() || null,
                  arsip_vital: editForm.arsip_vital,
                }
                if (!editDoc.ref_tipe) payload.hak_akses = editForm.hak_akses
                if (isAdmin) {
                  payload.legal_hold = editForm.legal_hold
                  payload.legal_hold_alasan = editForm.legal_hold ? editForm.legal_hold_alasan.trim() || null : null
                }
                await request(`/arsip/${editDoc.id_dokumen}`, 'PUT', payload)
                setEditDoc(null)
                notify('success', 'Metadata arsip diperbarui')
                await load()
              })
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Edit Metadata Arsip</h3>
              <button type="button" onClick={() => setEditDoc(null)} className="p-1 rounded hover:bg-red-500/20"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="space-y-1"><span>Nama Dokumen *</span><input required className={field} value={editForm.nama_dokumen} onChange={(e) => setEditForm({ ...editForm, nama_dokumen: e.target.value })} /></label>
              <label className="space-y-1"><span>Nomor Dokumen *</span><input required className={field} value={editForm.nomor_dokumen} onChange={(e) => setEditForm({ ...editForm, nomor_dokumen: e.target.value })} /></label>
              <label className="space-y-1"><span>Kategori *</span><input required className={field} value={editForm.kategori} onChange={(e) => setEditForm({ ...editForm, kategori: e.target.value })} /></label>
              <label className="space-y-1"><span>Tanggal Dokumen *</span><input type="date" required className={field} value={editForm.tanggal_dokumen} onChange={(e) => setEditForm({ ...editForm, tanggal_dokumen: e.target.value })} /></label>
              <label className="space-y-1">
                <span>Kode Klasifikasi (JRA)</span>
                <select className={field} value={editForm.id_klasifikasi} onChange={(e) => setEditForm({ ...editForm, id_klasifikasi: e.target.value })}>
                  <option value="">Tanpa Klasifikasi</option>
                  {klasifikasiList.map((k) => (
                    <option key={k.id_klasifikasi} value={k.id_klasifikasi}>{k.kode_klasifikasi} — {k.nama_klasifikasi}</option>
                  ))}
                </select>
              </label>
              {!editDoc.ref_tipe && (
                <label className="space-y-1">
                  <span>Hak Akses SKKAAD</span>
                  <select className={field} value={editForm.hak_akses} onChange={(e) => setEditForm({ ...editForm, hak_akses: e.target.value })}>
                    <option value="internal">Internal / Biasa</option>
                    <option value="terbatas">Terbatas</option>
                    <option value="rahasia">Rahasia</option>
                    <option value="sangat_rahasia">Sangat Rahasia</option>
                  </select>
                </label>
              )}
              <label className="space-y-1"><span>Lokasi Fisik</span><input className={field} value={editForm.lokasi_fisik} onChange={(e) => setEditForm({ ...editForm, lokasi_fisik: e.target.value })} /></label>
              <label className="space-y-1"><span>Nomor Berkas</span><input className={field} value={editForm.nomor_berkas} onChange={(e) => setEditForm({ ...editForm, nomor_berkas: e.target.value })} /></label>
            </div>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                <input type="checkbox" checked={editForm.arsip_vital} onChange={(e) => setEditForm({ ...editForm, arsip_vital: e.target.checked })} />
                Arsip Vital
              </label>
              {isAdmin && (
                <label className="inline-flex items-center gap-2 font-semibold text-amber-600 dark:text-amber-300 cursor-pointer">
                  <input type="checkbox" checked={editForm.legal_hold} onChange={(e) => setEditForm({ ...editForm, legal_hold: e.target.checked })} />
                  Legal Hold
                </label>
              )}
            </div>
            {isAdmin && editForm.legal_hold && (
              <input className={field} placeholder="Alasan Legal Hold" value={editForm.legal_hold_alasan} onChange={(e) => setEditForm({ ...editForm, legal_hold_alasan: e.target.value })} />
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-white/15" onClick={() => setEditDoc(null)}>Batal</button>
              <button className={button} disabled={busy}>Simpan Perubahan</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Kelola Versi Dokumen */}
      {versionDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className={`w-full max-w-xl rounded-2xl border p-5 space-y-4 max-h-[85vh] overflow-y-auto ${isDark ? 'bg-[#0f172a] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Riwayat Versi · {versionDoc.nama_dokumen}</h3>
              <button type="button" onClick={() => setVersionDoc(null)} className="p-1 rounded hover:bg-red-500/20"><X className="w-4 h-4" /></button>
            </div>
            <form
              className="space-y-2 p-3 rounded-xl border border-slate-200 dark:border-white/10 text-xs"
              onSubmit={(e) => {
                e.preventDefault()
                if (!versionFile) { notify('error', 'Pilih berkas revisi'); return }
                void run(async () => {
                  await filesApi.uploadThen(versionFile, 'arsip', (up) =>
                    request(`/arsip/${versionDoc.id_dokumen}/versi`, 'POST', {
                      file_path: String(up.file_id),
                      catatan_versi: versionNote.trim() || null,
                    })
                  )
                  notify('success', 'Versi baru berhasil diunggah')
                  await openVersionsModal(versionDoc)
                  await load()
                })
              }}
            >
              <p className="font-semibold">Unggah Versi Revisi Baru</p>
              <input type="file" required className={field} onChange={(e) => setVersionFile(e.target.files?.[0] || null)} />
              <input className={field} placeholder="Catatan revisi (opsional)" value={versionNote} onChange={(e) => setVersionNote(e.target.value)} />
              <button className={buttonCompact} disabled={busy}>Unggah Versi Baru</button>
            </form>
            <div className="space-y-2 text-xs">
              {versions.map((v) => (
                <div key={v.id_dokumen} className="p-3 rounded-lg border border-slate-200 dark:border-white/10 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-bold">Versi v{v.versi_dokumen ?? 1} · {v.tanggal_dokumen}</p>
                    <p className="text-[11px] text-slate-500 font-mono">{v.sha256_hash ? `SHA-256: ${v.sha256_hash.slice(0, 16)}…` : 'Tanpa hash'}</p>
                  </div>
                  {v.file_path && /^\d+$/.test(v.file_path) && (
                    <button className={buttonCompact} onClick={() => void run(() => download(`/files/${v.file_path}`, `${v.nama_dokumen}_v${v.versi_dokumen ?? 1}`))}>
                      <Download className="w-3.5 h-3.5" /> Unduh
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Izin Akses SKKAAD */}
      {grantDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className={`w-full max-w-xl rounded-2xl border p-5 space-y-4 max-h-[85vh] overflow-y-auto ${isDark ? 'bg-[#0f172a] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-amber-500" /> Izin Akses Khusus SKKAAD</h3>
              <button type="button" onClick={() => setGrantDoc(null)} className="p-1 rounded hover:bg-red-500/20"><X className="w-4 h-4" /></button>
            </div>
            <form
              className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-xl border border-slate-200 dark:border-white/10 text-xs"
              onSubmit={(e) => {
                e.preventDefault()
                if (!grantPegawaiId) return
                void run(async () => {
                  await request(`/arsip/${grantDoc.id_dokumen}/access-grants`, 'POST', {
                    id_pegawai: Number(grantPegawaiId),
                    alasan: grantAlasan.trim() || null,
                    valid_until: grantValidUntil || null,
                  })
                  notify('success', 'Izin akses khusus diberikan')
                  await openGrantsModal(grantDoc)
                })
              }}
            >
              <select required className={field} value={grantPegawaiId} onChange={(e) => setGrantPegawaiId(e.target.value)}>
                <option value="">Pilih Pegawai...</option>
                {pegawaiList.map((p) => (
                  <option key={p.id_pegawai} value={p.id_pegawai}>{p.nama} ({p.nip})</option>
                ))}
              </select>
              <input type="date" className={field} value={grantValidUntil} onChange={(e) => setGrantValidUntil(e.target.value)} title="Berlaku hingga (opsional)" />
              <input className={`${field} sm:col-span-2`} placeholder="Alasan pemberian akses (opsional)" value={grantAlasan} onChange={(e) => setGrantAlasan(e.target.value)} />
              <div className="sm:col-span-2">
                <button className={buttonCompact} disabled={busy}>Berikan Izin Akses</button>
              </div>
            </form>
            <div className="space-y-2 text-xs">
              {grants.length === 0 ? (
                <p className="text-slate-500 text-center py-3">Belum ada pegawai lain yang diberi izin khusus.</p>
              ) : (
                grants.map((g) => (
                  <div key={g.id} className="p-3 rounded-lg border border-slate-200 dark:border-white/10 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold">{g.nama_pegawai || `Pegawai #${g.id_pegawai}`}</p>
                      <p className="text-[11px] text-slate-500">
                        {g.alasan || 'Tanpa keterangan'} · Berlaku s.d. {g.valid_until || 'Tidak terbatas'}
                      </p>
                    </div>
                    <button
                      className="text-xs font-bold text-red-500 hover:underline cursor-pointer"
                      onClick={() =>
                        void run(async () => {
                          await request(`/arsip/${grantDoc.id_dokumen}/access-grants/${g.id}`, 'DELETE')
                          await openGrantsModal(grantDoc)
                        })
                      }
                    >
                      Cabut
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Log Audit Dokumen */}
      {auditDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className={`w-full max-w-xl rounded-2xl border p-5 space-y-3 max-h-[85vh] overflow-y-auto ${isDark ? 'bg-[#0f172a] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Jejak Audit · {auditDoc.nama_dokumen}</h3>
              <button type="button" onClick={() => setAuditDoc(null)} className="p-1 rounded hover:bg-red-500/20"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2 text-xs">
              {auditLogs.length === 0 ? (
                <p className="text-slate-500 text-center py-4">Belum ada catatan audit.</p>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-2.5 rounded-lg border border-slate-200 dark:border-white/10">
                    <div className="flex justify-between gap-2">
                      <span className="font-bold uppercase text-[10px] text-red-600 dark:text-red-400">{log.aksi}</span>
                      <span className="text-[10px] text-slate-400">{new Date(log.created_at).toLocaleString('id-ID')}</span>
                    </div>
                    <p className="font-medium mt-0.5">{log.actor_nama || 'Sistem'} — {log.detail || '-'}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pratinjau Berkas */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Pratinjau ${previewDoc.title}`}
        >
          <div
            className={`w-full max-w-4xl h-[85vh] rounded-2xl border shadow-2xl flex flex-col overflow-hidden ${
              isDark ? 'bg-[#0f172a] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className={`px-5 py-3.5 border-b flex items-center justify-between gap-3 ${isDark ? 'border-white/10 bg-[#0a0f1d]' : 'border-slate-200 bg-slate-50'}`}>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                  Pembaca Dokumen Arsip
                </p>
                <h3 className="text-sm font-bold truncate">{previewDoc.title}</h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewDoc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border transition-colors ${
                    isDark
                      ? 'border-white/15 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Tab Baru</span>
                </a>
                <button
                  type="button"
                  onClick={() => void run(() => download(`/files/${previewDoc.filePath}`, previewDoc.title))}
                  className={`${button} !px-3 !py-1.5 !text-xs`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh</span>
                </button>
                <button
                  type="button"
                  onClick={closePreview}
                  aria-label="Tutup pratinjau"
                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto bg-slate-100 dark:bg-[#070b14] p-3 sm:p-5 flex items-center justify-center">
              {previewDoc.contentType.includes('pdf') ? (
                <iframe
                  src={previewDoc.url}
                  title={previewDoc.title}
                  className="w-full h-full min-h-[65vh] rounded-xl border border-slate-200 dark:border-white/10 bg-white"
                />
              ) : previewDoc.contentType.startsWith('image/') ? (
                <img
                  src={previewDoc.url}
                  alt={previewDoc.title}
                  className="w-full h-full object-contain rounded-xl"
                />
              ) : previewDoc.text !== undefined ? (
                <pre className={`w-full h-full overflow-auto p-4 rounded-xl text-xs font-mono whitespace-pre-wrap ${isDark ? 'bg-[#0f172a] text-slate-200' : 'bg-white text-slate-800 border border-slate-200'}`}>
                  {previewDoc.text}
                </pre>
              ) : (
                <div className="text-center space-y-3 p-6 max-w-md">
                  <p className="text-sm font-semibold">Format berkas ini tidak dapat dipratinjau langsung di browser.</p>
                  <button
                    type="button"
                    onClick={() => void run(() => download(`/files/${previewDoc.filePath}`, previewDoc.title))}
                    className={button}
                  >
                    <Download className="w-4 h-4" />
                    <span>Unduh Berkas</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Workspace>
  )
}
