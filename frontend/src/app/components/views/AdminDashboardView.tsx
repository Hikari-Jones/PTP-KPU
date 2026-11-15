import { useEffect, useState } from 'react'
import { request, message } from '../../../services/operations'
import { Workspace, button } from '../ui/operations'
type Status = { users:number; active_users:number; letters:number; budget_events:number; official_issuance_enabled:boolean; checked_at:string }
export function AdminDashboardView({theme}: {theme:'light'|'dark'}) {
  const [status,setStatus] = useState<Status|null>(null)
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  const load = async () => {
    setBusy(true);setError('')
    try { setStatus(await request<Status>('/operations/admin-status')) }
    catch(e) { setError(message(e));setStatus(null) }
    finally {setBusy(false)}
  }
  useEffect(()=>{void load()},[])
  return <Workspace theme={theme} title="Dashboard Administrator">
    <button className={button} disabled={busy} onClick={load}>Muat ulang</button>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Memuat status database…</p>}
    {status && <>
      <div className="grid grid-cols-2 gap-4">
        <p>Akun terdaftar: <strong>{status.users}</strong></p>
        <p>Akun aktif: <strong>{status.active_users}</strong></p>
        <p>Alur surat tersimpan: <strong>{status.letters}</strong></p>
        <p>Peristiwa audit anggaran: <strong>{status.budget_events}</strong></p>
      </div>
      <p>Penerbitan resmi: {status.official_issuance_enabled?'Diaktifkan dalam konfigurasi':'Dinonaktifkan'}</p>
      <p>Diambil dari database: {new Date(status.checked_at).toLocaleString('id-ID')}</p>
    </>}
    <p>Uptime, penggunaan disk, dan beban server perlu dipantau melalui monitoring server. Angka tersebut tidak diperkirakan oleh halaman ini.</p>
  </Workspace>
}
