import { useState } from 'react'
import { request, download, message } from '../../../services/operations'
import { filesApi } from '../../../services/api'
import type { RealisasiAnggaranResponse } from './types'

type Props = { item: RealisasiAnggaranResponse; userId: number; canReview: boolean; onSuccess: () => void }
export function BudgetActions({ item, userId, canReview, onSuccess }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState('')
  const [history, setHistory] = useState<{id:number;actor_id:number;action:string;recorded_at:string;snapshot:Record<string, unknown>}[] | null>(null)
  const [form, setForm] = useState({ tanggal_transaksi: item.tanggal_transaksi,
    nomor_dokumen: item.nomor_dokumen, uraian_kegiatan: item.uraian_kegiatan,
    jumlah_realisasi: String(item.jumlah_realisasi) })
  const [file, setFile] = useState<File | null>(null)
  const own = item.id_pegawai === userId
  const run = async (work: () => Promise<unknown>, refresh = true) => {
    setBusy(true); setError('')
    try { await work(); setEditing(false); if (refresh) onSuccess() }
    catch (e) { setError(message(e)) }
    finally { setBusy(false) }
  }
  const action = (name: string) => run(() => request(`/realisasi-anggaran/${item.id_realisasi}/${name}`, 'POST',
    name === 'submit' ? undefined : { catatan_verifikasi: note }))
  const save = () => run(async () => {
    const uploaded = file ? await filesApi.upload(file, 'realisasi') : null
    return request(`/realisasi-anggaran/${item.id_realisasi}`, 'PUT', { ...form,
      jumlah_realisasi: form.jumlah_realisasi,
      ...(uploaded ? { bukti_file_path: `/api/v1/files/${uploaded.file_id}` } : {}) })
  })
  return <fieldset disabled={busy} className="space-y-2 text-xs">
    <button type="button" className="underline mr-2" onClick={() => run(async () => {
      setHistory(await request(`/realisasi-anggaran/${item.id_realisasi}/history`))
    }, false)}>Riwayat pemeriksaan</button>
    {history && <div>{history.length === 0 && <p>Belum ada riwayat; data lama perlu rekonsiliasi.</p>}
      {history.map(event => <details key={event.id}><summary>{new Date(event.recorded_at).toLocaleString('id-ID')} · {event.action} · Pegawai #{event.actor_id}</summary><p>Dokumen: {String(event.snapshot.nomor_dokumen || '—')}<br/>Status: {String(event.snapshot.status || '—')}<br/>Jumlah: Rp {String(event.snapshot.jumlah_realisasi || '0')}<br/>Uraian: {String(event.snapshot.uraian_kegiatan || '—')}<br/>Catatan: {String(event.snapshot.catatan_verifikasi || '—')}</p></details>)}
    </div>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {item.bukti_file_path?.match(/^\/api\/v1\/files\/\d+$/) && <button type="button" className="underline" onClick={() => run(() =>
      download(item.bukti_file_path!.replace('/api/v1', ''), item.bukti_file_nama || 'bukti'), false)}>Unduh bukti</button>}
    {own && ['draft', 'rejected'].includes(item.status) && <>
      <button type="button" className="underline mx-2" onClick={() => setEditing(!editing)}>Ubah draft / bukti</button>
      {item.status === 'draft' && <button type="button" className="underline" onClick={() => action('submit')}>Ajukan</button>}
      {editing && <div className="space-y-2">
        <label className="block">Tanggal<input required type="date" value={form.tanggal_transaksi} onChange={e => setForm({ ...form, tanggal_transaksi: e.target.value })} /></label>
        <label className="block">Nomor dokumen<input required value={form.nomor_dokumen} onChange={e => setForm({ ...form, nomor_dokumen: e.target.value })} /></label>
        <label className="block">Uraian<textarea required value={form.uraian_kegiatan} onChange={e => setForm({ ...form, uraian_kegiatan: e.target.value })} /></label>
        <label className="block">Jumlah<input required type="number" min="0.01" step="0.01" value={form.jumlah_realisasi} onChange={e => setForm({ ...form, jumlah_realisasi: e.target.value })} /></label>
        <label className="block">Ganti bukti<input type="file" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
        <button type="button" className="underline" onClick={save}>Simpan perubahan</button>
      </div>}
    </>}
    {canReview && !own && item.status === 'submitted' && <>
      <label className="block">Catatan pemeriksaan<textarea value={note} onChange={e => setNote(e.target.value)} /></label>
      <button type="button" className="underline mr-3" onClick={() => action('verify')}>Verifikasi internal</button>
      <button type="button" className="underline" disabled={note.trim().length < 3} onClick={() => action('reject')}>Kembalikan</button>
    </>}
    {busy && <span role="status">Memproses…</span>}
  </fieldset>
}
