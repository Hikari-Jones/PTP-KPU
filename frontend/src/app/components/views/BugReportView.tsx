import { useEffect, useState } from 'react'
import { request, message } from '../../../services/operations'
import { Workspace, field, button, useOperation } from '../ui/operations'
import { useAuth } from '../../context/AuthContext'
interface Report { id: number; title: string; priority: string; status: string; owner_id: number; created_at: string }
export function BugReportView({ theme }: { theme: 'light' | 'dark' }) {
  const [items, setItems] = useState<Report[]>([])
  const [title, setTitle] = useState(''); const [priority, setPriority] = useState('Sedang')
  const { userRole } = useAuth(); const {busy, error, run, setError} = useOperation()
  const load = async () => setItems(await request<Report[]>('/operations/bugs'))
  useEffect(() => { load().catch(e => setError(message(e))) }, [])
  return <Workspace theme={theme} title="Laporan Kendala">
    {error && <p role="alert" className="text-red-500">{error}</p>}
    <form className="space-y-2" onSubmit={e => { e.preventDefault(); void run(async () => {
      await request('/operations/bugs', 'POST', {title, priority}); setTitle(''); await load()
    }) }}>
      <label>Ringkasan kendala<input required maxLength={500} value={title} onChange={e => setTitle(e.target.value)} className={field}/></label>
      <label>Prioritas<select className={field} value={priority} onChange={e => setPriority(e.target.value)}>{['Rendah','Sedang','Tinggi'].map(x => <option key={x}>{x}</option>)}</select></label>
      <button className={button} disabled={busy}>Simpan laporan</button>
    </form>
    <button disabled={busy} className={button} onClick={() => void run(load)}>Muat ulang</button>
    {!items.length && <p>Belum ada laporan yang dapat ditampilkan.</p>}
    {items.map(x => <article className="rounded-xl border border-slate-400/30 p-4" key={x.id}>
      <h2 className="font-bold">BUG-{x.id}: {x.title}</h2><p>{x.priority} · {new Date(x.created_at + 'Z').toLocaleString('id-ID')} · Pengguna #{x.owner_id}</p>
      {userRole === 'Admin' ? <select aria-label={`Status BUG-${x.id}`} className={field} value={x.status} disabled={busy} onChange={e => void run(async () => { await request(`/operations/bugs/${x.id}`, 'PATCH', {status:e.target.value}); await load() })}>{['Terbuka','Diproses','Selesai'].map(s => <option key={s}>{s}</option>)}</select> : <p>{x.status}</p>}
    </article>)}
  </Workspace>
}
