import { useEffect, useState } from 'react'
import { request, download, message } from '../../../services/operations'
import { filesApi } from '../../../services/api'
import { Workspace, field, button, useOperation, SkeletonTable } from '../ui/operations'
import { Search, Trash2, Archive as ArchiveIcon, UploadCloud, Download, RotateCcw, Loader2 } from 'lucide-react'

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

  const load = async () =>
    setItems(
      await request<Archive[]>(
        `/arsip/${trash ? 'trash' : ''}?limit=50&skip=${page * 50}&search=${encodeURIComponent(search)}`
      )
    )

  useEffect(() => {
    load().catch((e) => setError(message(e)))
  }, [trash, page])

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
          <button
            className={buttonCompact}
            onClick={() => {
              setTrash(!trash)
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

      {/* List Dokumen Arsip */}
      {busy && !items.length ? (
        <SkeletonTable rows={5} cols={3} />
      ) : !items.length ? (
        <div className="text-center py-8 text-xs text-slate-400 dark:text-slate-500">
          Tidak ada dokumen pada halaman ini.
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
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {x.tanggal_dokumen} · Kategori: {x.kategori} · Akses: {x.hak_akses}
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
                {trash && (
                  <button
                    className={`${button} !px-3 !py-1.5 !text-xs !bg-red-700 hover:!bg-red-800`}
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Yakin ingin menghapus dokumen "${x.nama_dokumen}" secara permanen? Dokumen tidak dapat dikembalikan.`)) {
                        void run(async () => {
                          await request(`/arsip/${x.id_dokumen}/permanent`, 'DELETE')
                          await load()
                        })
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Permanen</span>
                  </button>
                )}
              </div>
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
