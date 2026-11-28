import { useRef, useState } from 'react'
import { Files, Loader2, Trash2, UploadCloud, CheckCircle2, AlertCircle, X, RotateCcw } from 'lucide-react'
import { request, message } from '../../../services/operations'
import { filesApi } from '../../../services/api'
import { showToast as notify, withQuietFeedback } from '../../../services/activity'
import { field, button } from '../ui/operations'

/** Must match backend/app/api/v1/endpoints/files.py and MAX_UPLOAD_SIZE_MB. */
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.jpg', '.jpeg', '.png']
const MAX_SIZE_MB = 25
const MAX_FILES = 50
const PARALLEL_UPLOADS = 3

type RowStatus = 'pending' | 'uploading' | 'done' | 'error'

interface Row {
  key: string
  file: File
  nama_dokumen: string
  nomor_dokumen: string
  status: RowStatus
  error?: string
}

const today = () => new Date().toLocaleDateString('en-CA')
const baseName = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim()
const extension = (name: string) => (name.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase()
const formatSize = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

export interface KlasifikasiOption {
  id_klasifikasi: number
  kode_klasifikasi: string
  nama_klasifikasi: string
}

export function ArsipBulkImport({
  onImported,
  klasifikasiList = [],
}: {
  onImported: () => Promise<void> | void
  klasifikasiList?: KlasifikasiOption[]
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef(false)
  const [rows, setRows] = useState<Row[]>([])
  const [running, setRunning] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [prefix, setPrefix] = useState(`IMPOR/${today().replace(/-/g, '')}/`)
  const [meta, setMeta] = useState({
    kategori: 'Laporan',
    event: '',
    tanggal_dokumen: today(),
    hak_akses: 'internal',
    id_klasifikasi: '',
    lokasi_fisik: '',
  })

  const done = rows.filter((r) => r.status === 'done').length
  const failed = rows.filter((r) => r.status === 'error').length
  const remaining = rows.filter((r) => r.status === 'pending' || r.status === 'error').length
  const processed = rows.filter((r) => r.status === 'done' || r.status === 'error').length

  const updateRow = (key: string, patch: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const addFiles = (incoming: FileList | File[]) => {
    const files = Array.from(incoming)
    const rejected: string[] = []
    const accepted: Row[] = []
    const room = MAX_FILES - rows.length
    for (const file of files) {
      if (!ALLOWED_EXTENSIONS.includes(extension(file.name))) {
        rejected.push(`${file.name} (jenis berkas tidak didukung)`)
      } else if (file.size > MAX_SIZE_MB * 1048576) {
        rejected.push(`${file.name} (lebih dari ${MAX_SIZE_MB} MB)`)
      } else if (rows.some((r) => r.file.name === file.name && r.file.size === file.size) ||
                 accepted.some((r) => r.file.name === file.name && r.file.size === file.size)) {
        rejected.push(`${file.name} (sudah ada di daftar)`)
      } else if (accepted.length >= room) {
        rejected.push(`${file.name} (melebihi batas ${MAX_FILES} berkas per impor)`)
      } else {
        const n = rows.length + accepted.length + 1
        accepted.push({
          key: `${file.name}-${file.size}-${file.lastModified}-${n}`,
          file,
          nama_dokumen: baseName(file.name).slice(0, 255) || file.name,
          nomor_dokumen: `${prefix}${String(n).padStart(3, '0')}`.slice(0, 100),
          status: 'pending',
        })
      }
    }
    if (accepted.length) {
      setRows((list) => [...list, ...accepted])
      notify('info', `${accepted.length} berkas ditambahkan ke daftar impor`)
    }
    if (rejected.length) {
      notify('error', `${rejected.length} berkas ditolak: ${rejected.slice(0, 3).join('; ')}${rejected.length > 3 ? '; …' : ''}`)
    }
  }

  const renumber = () => {
    setRows((list) => list.map((r, i) => (r.status === 'done' ? r : { ...r, nomor_dokumen: `${prefix}${String(i + 1).padStart(3, '0')}`.slice(0, 100) })))
    notify('info', 'Nomor dokumen diperbarui sesuai awalan')
  }

  const importOne = async (row: Row) => {
    updateRow(row.key, { status: 'uploading', error: undefined })
    for (let attempt = 1; ; attempt++) {
      const ok = await importAttempt(row)
      if (ok === true) return true
      // The server's rate limiter asks us to slow down: wait and retry instead of failing the file.
      if (ok === 'busy' && attempt < 4 && !cancelRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
        continue
      }
      if (ok === 'busy') updateRow(row.key, { status: 'error', error: 'Server sedang sibuk; tekan "Ulangi yang Gagal".' })
      return false
    }
  }

  const importAttempt = async (row: Row): Promise<true | false | 'busy'> => {
    try {
      // If saving the archive record fails, the uploaded file is rolled back.
      await filesApi.uploadThen(row.file, 'arsip', (uploaded) =>
        request('/arsip/', 'POST', {
          kategori: meta.kategori,
          tanggal_dokumen: meta.tanggal_dokumen,
          hak_akses: meta.hak_akses,
          id_klasifikasi: meta.id_klasifikasi ? Number(meta.id_klasifikasi) : null,
          lokasi_fisik: meta.lokasi_fisik.trim() || null,
          event: meta.event.trim() || null,
          nama_dokumen: row.nama_dokumen.trim(),
          nomor_dokumen: row.nomor_dokumen.trim(),
          id_pegawai: 0,
          file_path: String(uploaded.file_id),
          ukuran_file: uploaded.size,
        })
      )
      updateRow(row.key, { status: 'done' })
      return true
    } catch (e) {
      const text = message(e)
      if (/429|Terlalu banyak permintaan/i.test(text)) return 'busy'
      updateRow(row.key, { status: 'error', error: text })
      return false
    }
  }

  const startImport = async () => {
    const queue = rows.filter((r) => r.status === 'pending' || r.status === 'error')
    if (!queue.length) {
      notify('info', 'Tidak ada berkas yang perlu diimpor')
      return
    }
    const invalid = queue.find((r) => !r.nama_dokumen.trim() || !r.nomor_dokumen.trim())
    if (invalid) {
      notify('error', `Nama dan nomor dokumen wajib diisi (${invalid.file.name})`)
      return
    }
    if (!meta.kategori.trim() || !meta.tanggal_dokumen) {
      notify('error', 'Kategori dan tanggal dokumen wajib diisi')
      return
    }
    cancelRef.current = false
    setRunning(true)
    notify('info', `Mengimpor ${queue.length} berkas…`)
    let ok = 0
    let bad = 0
    await withQuietFeedback(async () => {
      let next = 0
      const worker = async () => {
        while (next < queue.length && !cancelRef.current) {
          const row = queue[next++]
          if (await importOne(row)) ok++
          else bad++
        }
      }
      await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, queue.length) }, worker))
    })
    setRunning(false)
    const skipped = queue.length - ok - bad
    if (bad === 0 && skipped === 0) notify('success', `Impor selesai: ${ok} dokumen tersimpan di arsip`)
    else notify(bad ? 'error' : 'info', `Impor selesai: ${ok} berhasil, ${bad} gagal${skipped ? `, ${skipped} dibatalkan` : ''}. Periksa daftar untuk detail.`)
    if (ok) await onImported()
  }

  const statusBadge = (row: Row) => {
    if (row.status === 'uploading') return <span className="inline-flex items-center gap-1 text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mengunggah</span>
    if (row.status === 'done') return <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> Tersimpan</span>
    if (row.status === 'error') return <span className="inline-flex items-start gap-1 text-red-600 dark:text-red-400" title={row.error}><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {row.error}</span>
    return <span className="text-slate-400">Menunggu</span>
  }

  const small = `${field} !py-1.5 !text-xs`

  return (
    <details className="group border rounded-xl border-slate-200 dark:border-white/10 overflow-hidden bg-slate-50/50 dark:bg-black/20 transition-all">
      <summary className="cursor-pointer font-semibold text-xs tracking-wide px-4 py-3 select-none flex items-center justify-between text-slate-800 dark:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-white/5 transition-colors">
        <span className="flex items-center gap-2">
          <Files className="w-4 h-4 text-red-600 dark:text-red-500" />
          Impor Massal Dokumen
          {rows.length > 0 && <span className="text-[10px] font-normal text-slate-500">({rows.length} berkas di daftar)</span>}
        </span>
        <span className="text-[10px] text-slate-400 font-normal group-open:rotate-180 transition-transform">▼</span>
      </summary>

      <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-white/10 space-y-4 bg-white/70 dark:bg-slate-900/40 text-xs">
        {/* 1. Pilih berkas */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Pilih atau seret berkas untuk diimpor"
          onClick={() => !running && inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !running && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (!running) addFiles(e.dataTransfer.files)
          }}
          className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-red-500 bg-red-50/60 dark:bg-red-950/20' : 'border-slate-300 dark:border-white/15 hover:border-red-400'
          } ${running ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <UploadCloud className="w-7 h-7 mx-auto text-red-600 dark:text-red-500" />
          <p className="mt-2 font-semibold text-slate-700 dark:text-slate-200">Seret berkas ke sini atau klik untuk memilih beberapa berkas</p>
          <p className="mt-1 text-[11px] text-slate-500">
            PDF, Word, Excel, CSV, JPG, PNG · maks. {MAX_SIZE_MB} MB per berkas · maks. {MAX_FILES} berkas per impor
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            accept={ALLOWED_EXTENSIONS.join(',')}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        {/* 2. Data bersama untuk semua berkas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="space-y-1 font-semibold text-slate-700 dark:text-slate-300">
            <span>Kategori Dokumen *</span>
            <input className={small} value={meta.kategori} disabled={running} onChange={(e) => setMeta({ ...meta, kategori: e.target.value })} />
          </label>
          <label className="space-y-1 font-semibold text-slate-700 dark:text-slate-300">
            <span>Kegiatan / Event</span>
            <input className={small} value={meta.event} disabled={running} placeholder="Opsional" onChange={(e) => setMeta({ ...meta, event: e.target.value })} />
          </label>
          <label className="space-y-1 font-semibold text-slate-700 dark:text-slate-300">
            <span>Tanggal Dokumen *</span>
            <input type="date" className={small} value={meta.tanggal_dokumen} disabled={running} onChange={(e) => setMeta({ ...meta, tanggal_dokumen: e.target.value })} />
          </label>
          <label className="space-y-1 font-semibold text-slate-700 dark:text-slate-300">
            <span>Hak Akses SKKAAD *</span>
            <select className={small} value={meta.hak_akses} disabled={running} onChange={(e) => setMeta({ ...meta, hak_akses: e.target.value })}>
              <option value="internal">Internal / Biasa (Semua Pegawai)</option>
              <option value="terbatas">Terbatas (Bagian Pengunggah & Admin)</option>
              <option value="rahasia">Rahasia (Pemilik, Izin Khusus & Admin)</option>
              <option value="sangat_rahasia">Sangat Rahasia (Tertutup Ketat)</option>
            </select>
          </label>
          <label className="space-y-1 font-semibold text-slate-700 dark:text-slate-300">
            <span>Klasifikasi Arsip (Kep KPU 1257/2024)</span>
            <select className={small} value={meta.id_klasifikasi} disabled={running} onChange={(e) => setMeta({ ...meta, id_klasifikasi: e.target.value })}>
              <option value="">Tanpa Kode Klasifikasi</option>
              {klasifikasiList.map((k) => (
                <option key={k.id_klasifikasi} value={k.id_klasifikasi}>
                  {k.kode_klasifikasi} — {k.nama_klasifikasi}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 font-semibold text-slate-700 dark:text-slate-300">
            <span>Lokasi Fisik (Opsional)</span>
            <input className={small} value={meta.lokasi_fisik} disabled={running} placeholder="Lemari / Rak / Boks" onChange={(e) => setMeta({ ...meta, lokasi_fisik: e.target.value })} />
          </label>
          <label className="space-y-1 font-semibold text-slate-700 dark:text-slate-300 md:col-span-2">
            <span>Awalan Nomor Dokumen Otomatis</span>
            <div className="flex gap-2">
              <input className={small} value={prefix} disabled={running} onChange={(e) => setPrefix(e.target.value)} />
              <button type="button" className={`${button} !px-3 !py-1.5 !text-xs !bg-slate-700 hover:!bg-slate-800 shrink-0`} disabled={running || rows.length === 0} onClick={renumber}>
                Terapkan
              </button>
            </div>
          </label>
        </div>

        {/* 3. Daftar berkas (nama & nomor dapat diubah per berkas) */}
        {rows.length > 0 && (
          <div className="space-y-2">
            {(running || processed > 0) && (
              <div className="space-y-1">
                <div className="flex justify-between font-semibold text-slate-600 dark:text-slate-300">
                  <span>{running ? 'Mengimpor…' : 'Hasil impor'}: {processed} dari {rows.length} diproses</span>
                  <span>{done} berhasil · {failed} gagal</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-red-600 transition-all" style={{ width: `${rows.length ? (processed / rows.length) * 100 : 0}%` }} />
                </div>
              </div>
            )}
            <div className="max-h-80 overflow-auto rounded-xl border border-slate-200 dark:border-white/10">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-100 dark:bg-[#0a0e1a] text-left">
                  <tr>
                    <th className="px-3 py-2 font-bold">Berkas</th>
                    <th className="px-3 py-2 font-bold">Nama Dokumen *</th>
                    <th className="px-3 py-2 font-bold">Nomor Dokumen *</th>
                    <th className="px-3 py-2 font-bold">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {rows.map((row) => {
                    const locked = running || row.status === 'done' || row.status === 'uploading'
                    return (
                      <tr key={row.key} className={row.status === 'done' ? 'opacity-70' : ''}>
                        <td className="px-3 py-2 max-w-[180px]">
                          <span className="block truncate font-medium" title={row.file.name}>{row.file.name}</span>
                          <span className="text-[10px] text-slate-500">{formatSize(row.file.size)}</span>
                        </td>
                        <td className="px-3 py-2 min-w-[180px]">
                          <input aria-label={`Nama dokumen ${row.file.name}`} className={small} value={row.nama_dokumen} maxLength={255} disabled={locked} onChange={(e) => updateRow(row.key, { nama_dokumen: e.target.value })} />
                        </td>
                        <td className="px-3 py-2 min-w-[160px]">
                          <input aria-label={`Nomor dokumen ${row.file.name}`} className={small} value={row.nomor_dokumen} maxLength={100} disabled={locked} onChange={(e) => updateRow(row.key, { nomor_dokumen: e.target.value })} />
                        </td>
                        <td className="px-3 py-2 min-w-[120px] max-w-[220px]">{statusBadge(row)}</td>
                        <td className="px-3 py-2 text-right">
                          {!locked && (
                            <button
                              type="button"
                              aria-label={`Hapus ${row.file.name} dari daftar`}
                              className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-500/10 cursor-pointer"
                              onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="button" className={button} disabled={running || remaining === 0} onClick={() => void startImport()}>
                {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : failed ? <RotateCcw className="w-3.5 h-3.5" /> : <UploadCloud className="w-3.5 h-3.5" />}
                <span>{running ? 'Mengimpor…' : failed && !rows.some((r) => r.status === 'pending') ? `Ulangi ${failed} yang Gagal` : `Impor ${remaining} Berkas`}</span>
              </button>
              {running && (
                <button
                  type="button"
                  className={`${button} !bg-slate-700 hover:!bg-slate-800`}
                  onClick={() => {
                    cancelRef.current = true
                    notify('info', 'Impor akan berhenti setelah berkas yang sedang diunggah selesai')
                  }}
                >
                  Batalkan
                </button>
              )}
              {!running && done > 0 && (
                <button
                  type="button"
                  className={`${button} !bg-slate-700 hover:!bg-slate-800`}
                  onClick={() => setRows((list) => list.filter((r) => r.status !== 'done'))}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Bersihkan yang Berhasil
                </button>
              )}
              {!running && (
                <button
                  type="button"
                  className="text-xs font-semibold text-slate-500 hover:text-red-600 inline-flex items-center gap-1 cursor-pointer"
                  onClick={() => {
                    setRows([])
                    notify('info', 'Daftar impor dikosongkan')
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Kosongkan daftar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </details>
  )
}
