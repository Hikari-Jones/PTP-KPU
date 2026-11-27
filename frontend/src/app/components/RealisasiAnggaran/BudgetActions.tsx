import { useEffect, useState } from 'react'
import { request, download, message } from '../../../services/operations'
import { filesApi } from '../../../services/api'
import type { RealisasiAnggaranResponse } from './types'

type HistoryEvent = {
  id: number
  actor_id: number
  actor_nama?: string | null
  action: string
  recorded_at: string
  snapshot: Record<string, unknown>
}

type Props = { item: RealisasiAnggaranResponse; userId: number; canReview: boolean; onSuccess: () => void }

export function BudgetActions({ item, userId, canReview, onSuccess }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  const [history, setHistory] = useState<HistoryEvent[] | null>(null)
  const [form, setForm] = useState({
    tanggal_transaksi: item.tanggal_transaksi,
    nomor_dokumen: item.nomor_dokumen,
    uraian_kegiatan: item.uraian_kegiatan,
    jumlah_realisasi: String(item.jumlah_realisasi),
  })
  const [file, setFile] = useState<File | null>(null)

  // Keep form synchronized whenever item props update after refresh/edit
  useEffect(() => {
    setForm({
      tanggal_transaksi: item.tanggal_transaksi,
      nomor_dokumen: item.nomor_dokumen,
      uraian_kegiatan: item.uraian_kegiatan,
      jumlah_realisasi: String(item.jumlah_realisasi),
    })
  }, [item.id_realisasi, item.tanggal_transaksi, item.nomor_dokumen, item.uraian_kegiatan, item.jumlah_realisasi])

  const own = item.id_pegawai === userId
  const run = async (work: () => Promise<unknown>, refresh = true) => {
    setBusy(true)
    setError('')
    try {
      await work()
      setEditing(false)
      if (refresh) onSuccess()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  const action = (name: string) =>
    run(() =>
      request(
        `/realisasi-anggaran/${item.id_realisasi}/${name}`,
        'POST',
        name === 'submit' ? undefined : { catatan_verifikasi: note },
      ),
    )

  const deleteDraft = () => {
    if (!window.confirm(`Hapus draft realisasi ${item.nomor_dokumen}?`)) return
    void run(() => request(`/realisasi-anggaran/${item.id_realisasi}`, 'DELETE'))
  }

  const save = () =>
    run(async () => {
      const submitPut = (fileId: number | null) =>
        request(`/realisasi-anggaran/${item.id_realisasi}`, 'PUT', {
          ...form,
          jumlah_realisasi: form.jumlah_realisasi,
          ...(fileId ? { bukti_file_path: `/api/v1/files/${fileId}` } : {}),
        })
      return file ? filesApi.uploadThen(file, 'realisasi', (uploaded) => submitPut(uploaded.file_id)) : submitPut(null)
    })

  const inputCls =
    'mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-white'

  return (
    <fieldset disabled={busy} className="mt-1.5 space-y-2 text-left text-xs">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          className="cursor-pointer font-semibold text-slate-600 underline hover:text-red-600 dark:text-slate-300 dark:hover:text-red-400"
          onClick={() =>
            void run(async () => {
              setHistory(await request<HistoryEvent[]>(`/realisasi-anggaran/${item.id_realisasi}/history`))
            }, false)
          }
        >
          Riwayat pemeriksaan
        </button>
        {item.bukti_file_path?.match(/^\/api\/v1\/files\/\d+$/) && (
          <button
            type="button"
            className="cursor-pointer font-semibold text-blue-600 underline hover:text-blue-700 dark:text-blue-400"
            onClick={() =>
              void run(() => download(item.bukti_file_path!.replace('/api/v1', ''), item.bukti_file_nama || 'bukti'), false)
            }
          >
            Unduh bukti
          </button>
        )}
        {own && ['draft', 'rejected'].includes(item.status) && (
          <>
            <button
              type="button"
              className="cursor-pointer font-semibold text-amber-600 underline hover:text-amber-700 dark:text-amber-400"
              onClick={() => setEditing(!editing)}
            >
              {editing ? 'Tutup edit' : 'Ubah draft / bukti'}
            </button>
            {item.status === 'draft' && (
              <>
                <button
                  type="button"
                  className="cursor-pointer rounded-md bg-red-600 px-2 py-0.5 font-bold text-white hover:bg-red-700"
                  onClick={() => void action('submit')}
                >
                  Ajukan
                </button>
                <button
                  type="button"
                  className="cursor-pointer font-semibold text-rose-600 underline hover:text-rose-700 dark:text-rose-400"
                  onClick={deleteDraft}
                >
                  Hapus draft
                </button>
              </>
            )}
          </>
        )}
      </div>

      {history && (
        <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-white/10 dark:bg-slate-950/50">
          {history.length === 0 && <p className="text-[11px] text-slate-500">Belum ada riwayat pemeriksaan.</p>}
          {history.map((event) => (
            <details key={event.id} className="text-[11px]">
              <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-200">
                {new Date(event.recorded_at).toLocaleString('id-ID')} · {event.action} ·{' '}
                {event.actor_nama || `Pegawai #${event.actor_id}`}
              </summary>
              <p className="mt-1 pl-2 text-slate-600 dark:text-slate-400">
                Dokumen: {String(event.snapshot.nomor_dokumen || '—')}
                <br />
                Status: {String(event.snapshot.status || '—')}
                <br />
                Jumlah: Rp {String(event.snapshot.jumlah_realisasi || '0')}
                <br />
                Uraian: {String(event.snapshot.uraian_kegiatan || '—')}
                <br />
                Catatan: {String(event.snapshot.catatan_verifikasi || '—')}
              </p>
            </details>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="font-semibold text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {own && ['draft', 'rejected'].includes(item.status) && editing && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-white/10 dark:bg-slate-900/60">
          <label className="block font-semibold">
            Tanggal
            <input
              required
              type="date"
              className={inputCls}
              value={form.tanggal_transaksi}
              onChange={(e) => setForm({ ...form, tanggal_transaksi: e.target.value })}
            />
          </label>
          <label className="block font-semibold">
            Nomor dokumen
            <input
              required
              className={inputCls}
              value={form.nomor_dokumen}
              onChange={(e) => setForm({ ...form, nomor_dokumen: e.target.value })}
            />
          </label>
          <label className="block font-semibold">
            Uraian
            <textarea
              required
              rows={2}
              className={inputCls}
              value={form.uraian_kegiatan}
              onChange={(e) => setForm({ ...form, uraian_kegiatan: e.target.value })}
            />
          </label>
          <label className="block font-semibold">
            Jumlah (Rp)
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              className={inputCls}
              value={form.jumlah_realisasi}
              onChange={(e) => setForm({ ...form, jumlah_realisasi: e.target.value })}
            />
          </label>
          <label className="block font-semibold">
            Ganti bukti
            <input type="file" className={inputCls} onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <button
            type="button"
            className="cursor-pointer rounded-lg bg-red-600 px-3 py-1 font-bold text-white hover:bg-red-700"
            onClick={() => void save()}
          >
            Simpan perubahan
          </button>
        </div>
      )}

      {canReview && !own && item.status === 'submitted' && (
        <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
          <label className="block font-semibold text-slate-700 dark:text-slate-200">
            Catatan pemeriksaan
            <textarea
              rows={2}
              className={inputCls}
              placeholder="Catatan persetujuan (opsional) atau alasan pengembalian (wajib min. 3 karakter)..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-1 font-bold text-white hover:bg-emerald-700"
              onClick={() => void action('verify')}
            >
              Verifikasi internal
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-lg bg-rose-600 px-3 py-1 font-bold text-white hover:bg-rose-700 disabled:opacity-40"
              disabled={note.trim().length < 3}
              onClick={() => void action('reject')}
            >
              Kembalikan
            </button>
          </div>
        </div>
      )}
      {busy && (
        <span role="status" className="text-[11px] font-semibold text-slate-500">
          Memproses…
        </span>
      )}
    </fieldset>
  )
}
