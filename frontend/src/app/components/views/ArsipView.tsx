import { useEffect, useState } from 'react'
import { request, download, message } from '../../../services/operations'
import { filesApi } from '../../../services/api'
import { showToast as notify } from '../../../services/activity'
import { useAuth } from '../../context/AuthContext'
import { Workspace, field, button, useOperation, SkeletonTable } from '../ui/operations'
import { ArsipBulkImport } from './ArsipBulkImport'
import { Search, Trash2, Archive as ArchiveIcon, UploadCloud, Download, RotateCcw, Loader2, Filter, RefreshCw, X } from 'lucide-react'

interface Archive {
  id_dokumen: number
  nama_dokumen: string
  nomor_dokumen: string
  kategori: string
  event: string
  hak_akses: string
  tanggal_dokumen: string
  file_path: string | null
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
}

const SUMBER_LABEL: Record<string, string> = {
  arsip: 'Arsip Umum (Unggahan)',
  surat: 'Surat Menyurat',
  realisasi: 'Realisasi Anggaran',
}

/** Label for the second-level filter, depending on the chosen module. */
const SUB_LABEL: Record<string, string> = {
  arsip: 'Semua Sub-Kategori',
  surat: 'Semua Jenis Surat',
  realisasi: 'Semua Akun Anggaran',
}

export function ArsipView({ theme }: { theme: 'light' | 'dark' }) {
  const [items, setItems] = useState<Archive[]>([])
  const [trash, setTrash] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [form, setForm] = useState({
    nama_dokumen: '',
    nomor_dokumen: '',
    kategori: 'Laporan',
    event: '',
    tanggal_dokumen: new Date().toLocaleDateString('en-CA'),
    hak_akses: 'internal',
  })
  const { busy, error, run, setError } = useOperation()
  const { userRole, currentUser } = useAuth()
  const isAdmin = userRole === 'Admin'
  // Permanent deletion: users request it with a reason, an administrator approves or rejects.
  const [onlyRequests, setOnlyRequests] = useState(false)
  const [requestFor, setRequestFor] = useState<number | null>(null)
  const [requestReason, setRequestReason] = useState('')
  const [rejectFor, setRejectFor] = useState<number | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [sumber, setSumber] = useState('')
  const [subKategori, setSubKategori] = useState('')
  const [tahun, setTahun] = useState('')
  const [options, setOptions] = useState<FilterOptions>({ years: [], sumber_modul: [], sub_kategori: {} })
  const [reloadKey, setReloadKey] = useState(0)

  const load = async () => {
    const params = new URLSearchParams({ limit: '50', skip: String(page * 50), search })
    if (sumber) params.set('sumber_modul', sumber)
    if (subKategori) params.set('sub_kategori', subKategori)
    if (tahun) params.set('year', tahun)
    if (trash && onlyRequests) params.set('hapus_status', 'diajukan')
    setItems(await request<Archive[]>(`/arsip/${trash ? 'trash' : ''}?${params}`))
  }

  const loadOptions = () =>
    request<FilterOptions>('/arsip/filter-options')
      .then((o) => setOptions({ years: o.years ?? [], sumber_modul: o.sumber_modul ?? [], sub_kategori: o.sub_kategori ?? {} }))
      .catch(() => notify('error', 'Pilihan filter arsip gagal dimuat'))

  useEffect(() => {
    void loadOptions()
  }, [])

  useEffect(() => {
    load().catch((e) => setError(message(e)))
  }, [trash, page, sumber, subKategori, tahun, reloadKey, onlyRequests])

  // Always offer the three modules; the second filter lists what actually exists.
  const sumberOptions = [...new Set(['surat', 'realisasi', 'arsip', ...options.sumber_modul])]
  const subOptions = sumber ? options.sub_kategori[sumber] ?? [] : []
  const filtersActive = Boolean(sumber || subKategori || tahun || search)
  const resetFilters = () => {
    setSumber('')
    setSubKategori('')
    setTahun('')
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
  ] as const

  return (
    <Workspace
      theme={theme}
      category="Arsip"
      title="Arsip Dokumen"
      description="Manajemen Dokumen Digital, Repositori Berkas, dan Pengelolaan Arsip KPU Provinsi Sulawesi Utara"
    >
      {error && (
        <div role="alert" className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Bar Pencarian & Tombol Aksi (Dibuat Lebih Tipis & Ramping) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1">
          <input
            aria-label="Cari arsip"
            className={fieldCompact}
            placeholder="Cari nama atau nomor dokumen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void run(load)
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <button className={buttonCompact} disabled={busy} onClick={() => void run(load)}>
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

      {/* Admin: antrean persetujuan hapus permanen */}
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

      {/* Filter bertingkat: modul asal -> sub-kategori -> tahun */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20">
        <span className="flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400">
          <Filter className="w-3.5 h-3.5" /> Filter Dokumen:
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
          <option value="">Semua Dokumen</option>
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
        {filtersActive && (
          <button type="button" onClick={resetFilters} className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1 cursor-pointer">
            <X className="w-3.5 h-3.5" /> Reset
          </button>
        )}
      </div>

      {/* Form Unggah Dokumen - Tata Letak Rapi, Berjarak & Berhuruf Kapital di Tiap Kata */}
      {!trash && (
        <details className="group border rounded-xl border-slate-200 dark:border-white/10 overflow-hidden bg-slate-50/50 dark:bg-black/20 transition-all">
          <summary className="cursor-pointer font-semibold text-xs tracking-wide px-4 py-3 select-none flex items-center justify-between text-slate-800 dark:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-white/5 transition-colors">
            <span className="flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-red-600 dark:text-red-500" />
              Unggah Dokumen Baru
            </span>
            <span className="text-[10px] text-slate-400 font-normal group-open:rotate-180 transition-transform">▼</span>
          </summary>

          <form
            className="p-4 sm:p-5 border-t border-slate-200 dark:border-white/10 space-y-4 bg-white/70 dark:bg-slate-900/40"
            onSubmit={(e) => {
              e.preventDefault()
              void run(async () => {
                if (!file) throw new Error('Silakan pilih berkas dokumen terlebih dahulu')
                // If saving the record fails, the uploaded file is rolled back.
                await filesApi.uploadThen(file, 'arsip', (uploaded) =>
                  request('/arsip/', 'POST', {
                    ...form,
                    id_pegawai: 0,
                    file_path: String(uploaded.file_id),
                    ukuran_file: uploaded.size,
                  })
                )
                setForm({ ...form, nama_dokumen: '', nomor_dokumen: '' })
                setFile(null)
                await loadOptions()
                await load()
              })
            }}
          >
            {/* Input Grid 2 Kolom untuk Tata Letak Rapi dan Tidak Berdempetan */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  Hak Akses Dokumen <span className="text-red-500">*</span>
                </label>
                <select
                  className={field}
                  value={form.hak_akses}
                  onChange={(e) => setForm({ ...form, hak_akses: e.target.value })}
                >
                  <option value="internal">Internal (Semua Pegawai)</option>
                  <option value="terbatas">Terbatas (Bagian Pengunggah & Admin Saja)</option>
                </select>
              </div>
            </div>

            {/* Input Berkas File */}
            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Pilih Berkas Dokumen <span className="text-red-500">*</span>
              </label>
              <input
                aria-label="Berkas arsip"
                required
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className={`${field} file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-red-600 file:text-white file:cursor-pointer hover:file:bg-red-700`}
              />
            </div>

            {/* Tombol Simpan */}
            <div className="pt-2">
              <button className={button} disabled={busy}>
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{busy ? 'Mengunggah Dokumen...' : 'Unggah dan Simpan'}</span>
              </button>
            </div>
          </form>
        </details>
      )}

      {/* Impor massal: banyak berkas sekaligus dengan data bersama */}
      {!trash && (
        <ArsipBulkImport
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
          {items.map((x) => (
            <article
              className="rounded-xl border border-slate-200 dark:border-white/10 p-4 space-y-2 bg-white/40 dark:bg-black/20 hover:border-red-500/30 transition-all shadow-xs"
              key={x.id_dokumen}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100">{x.nama_dokumen}</h2>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 font-mono self-start sm:self-auto">
                  {x.nomor_dokumen}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-600/10 text-red-600 dark:text-red-400">
                  {SUMBER_LABEL[x.sumber_modul ?? 'arsip'] ?? x.sumber_modul}
                </span>
                {x.sub_kategori && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                    {x.sub_kategori}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {x.tanggal_dokumen} · Kategori: {x.kategori} · Akses: {x.hak_akses}
                {!x.file_path && ' · Tanpa berkas lampiran'}
              </p>
              {(x.event || x.nama_pengunggah) && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {x.event && `Kegiatan: ${x.event}`}
                  {x.event && x.nama_pengunggah && ' · '}
                  {x.nama_pengunggah && `Pengunggah: ${x.nama_pengunggah}`}
                </p>
              )}
              <div className="flex items-center gap-2 pt-1">
                {x.file_path && /^\d+$/.test(x.file_path) && (
                  <button
                    className={`${button} !px-3 !py-1.5 !text-xs`}
                    disabled={busy}
                    onClick={() => void run(() => download(`/files/${x.file_path}`, x.nama_dokumen))}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh</span>
                  </button>
                )}
                <button
                  className={`${button} !px-3 !py-1.5 !text-xs !bg-slate-700 hover:!bg-slate-800`}
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
                      <span>Pindah ke Sampah</span>
                    </>
                  )}
                </button>
                {trash && x.ref_tipe && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Dokumen dari modul {SUMBER_LABEL[x.sumber_modul ?? ''] ?? 'asal'} tidak dapat dihapus permanen.
                  </span>
                )}
                {/* Pengguna: ajukan hapus permanen (perlu persetujuan admin) */}
                {trash && !x.ref_tipe && !isAdmin && x.hapus_status !== 'diajukan' &&
                  (x.id_pegawai === currentUser?.id_pegawai || x.dihapus_oleh === currentUser?.id_pegawai) && (
                  <button
                    className={`${button} !px-3 !py-1.5 !text-xs !bg-red-700 hover:!bg-red-800`}
                    disabled={busy}
                    onClick={() => {
                      setRequestFor(requestFor === x.id_dokumen ? null : x.id_dokumen)
                      setRequestReason('')
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{x.hapus_status === 'ditolak' ? 'Ajukan Ulang Hapus Permanen' : 'Ajukan Hapus Permanen'}</span>
                  </button>
                )}
                {/* Admin: setujui atau tolak permintaan; atau hapus langsung */}
                {trash && !x.ref_tipe && isAdmin && (
                  <>
                    <button
                      className={`${button} !px-3 !py-1.5 !text-xs !bg-red-700 hover:!bg-red-800`}
                      disabled={busy}
                      onClick={() => {
                        const pesan = x.hapus_status === 'diajukan'
                          ? `Setujui permintaan ${x.nama_pengaju_hapus ?? 'pengguna'} dan hapus "${x.nama_dokumen}" secara permanen? Dokumen tidak dapat dikembalikan.`
                          : `Yakin ingin menghapus dokumen "${x.nama_dokumen}" secara permanen? Dokumen tidak dapat dikembalikan.`
                        if (window.confirm(pesan)) {
                          void run(async () => {
                            await request(`/arsip/${x.id_dokumen}/permanent`, 'DELETE')
                            await loadOptions()
                            await load()
                          })
                        } else {
                          notify('info', 'Hapus permanen dibatalkan')
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{x.hapus_status === 'diajukan' ? 'Setujui & Hapus Permanen' : 'Hapus Permanen'}</span>
                    </button>
                    {x.hapus_status === 'diajukan' && (
                      <button
                        className={`${button} !px-3 !py-1.5 !text-xs !bg-slate-700 hover:!bg-slate-800`}
                        disabled={busy}
                        onClick={() => {
                          setRejectFor(rejectFor === x.id_dokumen ? null : x.id_dokumen)
                          setRejectNote('')
                        }}
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Tolak Permintaan</span>
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Status permintaan hapus permanen */}
              {trash && x.hapus_status === 'diajukan' && (
                <p className="text-[11px] font-semibold rounded-lg px-3 py-2 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                  Menunggu persetujuan admin untuk hapus permanen
                  {x.nama_pengaju_hapus ? ` · diajukan oleh ${x.nama_pengaju_hapus}` : ''}
                  {x.hapus_diajukan_pada ? ` · ${new Date(x.hapus_diajukan_pada).toLocaleString('id-ID')}` : ''}
                  {x.hapus_alasan ? ` · Alasan: ${x.hapus_alasan}` : ''}
                </p>
              )}
              {trash && x.hapus_status === 'ditolak' && (
                <p className="text-[11px] font-semibold rounded-lg px-3 py-2 bg-red-500/10 text-red-600 dark:text-red-400">
                  Permintaan hapus permanen ditolak admin{x.hapus_catatan_admin ? `: ${x.hapus_catatan_admin}` : ''}
                </p>
              )}

              {/* Form alasan pengajuan (pengguna) */}
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
                    Alasan hapus permanen (akan diperiksa admin) <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    autoFocus
                    rows={2}
                    maxLength={255}
                    className={fieldCompact}
                    value={requestReason}
                    onChange={(e) => setRequestReason(e.target.value)}
                    placeholder="Contoh: dokumen duplikat dari unggahan sebelumnya"
                  />
                  <div className="flex gap-2">
                    <button className={buttonCompact} disabled={busy}>Kirim Permintaan</button>
                    <button type="button" className="text-xs font-semibold text-slate-500 hover:underline cursor-pointer" onClick={() => setRequestFor(null)}>
                      Batal
                    </button>
                  </div>
                </form>
              )}

              {/* Form catatan penolakan (admin) */}
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
                    Catatan penolakan untuk pengaju <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    autoFocus
                    rows={2}
                    maxLength={255}
                    className={fieldCompact}
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="Contoh: masih dalam masa retensi aktif"
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
          ))}
        </div>
      )}

      {/* Navigasi Paginasi */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/10 text-xs">
        <button
          className={`${button} !px-3 !py-1.5 !text-xs`}
          disabled={page === 0 || busy}
          onClick={() => setPage(page - 1)}
        >
          Sebelumnya
        </button>
        <span className="text-slate-500 dark:text-slate-400 font-medium">Halaman {page + 1}</span>
        <button
          className={`${button} !px-3 !py-1.5 !text-xs`}
          disabled={items.length < 50 || busy}
          onClick={() => setPage(page + 1)}
        >
          Berikutnya
        </button>
      </div>
    </Workspace>
  )
}
