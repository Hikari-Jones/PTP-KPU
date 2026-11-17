import { useEffect, useState } from 'react'
import { request, download, message } from '../../../services/operations'
import { Workspace, button, useOperation } from '../ui/operations'
interface Backup {name:string;size:number}
export function ArsipAdminView({ theme }: { theme: 'light'|'dark' }) {
 const [items,setItems]=useState<Backup[]>([]);const {busy,error,run,setError}=useOperation()
 const load=async()=>setItems(await request<Backup[]>('/backups'))
 useEffect(()=>{load().catch(e=>setError(message(e)))},[])
 return <Workspace theme={theme} title="Cadangan Sistem">
  <p>Cadangan berisi dump MySQL, berkas upload, dan checksum SHA-256. Simpan salinan unduhan pada media terpisah.</p>
  <p>Pemulihan dilakukan administrator server ke database kosong terpisah menggunakan restore_backup.py. Uji hasilnya sebelum mengganti database operasional.</p>
  {error&&<p role="alert" className="text-red-500">{error}</p>}
  <button className={button} disabled={busy} onClick={()=>void run(async()=>{await request('/backups','POST');await load()})}>{busy?'Memproses…':'Buat cadangan'}</button>
  {items.map(x=><div className="border rounded-lg p-3 flex justify-between" key={x.name}><span>{x.name} · {(x.size/1048576).toFixed(2)} MB</span><button className={button} disabled={busy} onClick={()=>void run(()=>download(`/backups/${x.name}`,x.name))}>Unduh</button></div>)}
 </Workspace>
}
