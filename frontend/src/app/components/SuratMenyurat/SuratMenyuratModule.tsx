import { useEffect, useState, useRef } from 'react'
import { request, download, message } from '../../../services/operations'
import type { Employee } from '../../../services/operations'
import { filesApi } from '../../../services/api'
import { Workspace, field, button, useOperation } from '../ui/operations'
import { useAuth } from '../../context/AuthContext'
interface Letter {id:number;kind:string;subject:string;sender:string;recipient:string;number:string|null;content:string;date:string;status:string;file_id:number|null;version:number;history:{at:string;actor:string;action:string;note:string}[]}
export interface SuratMenyuratModuleProps {theme:'light'|'dark';subTab?:'ringkasan'|'masuk'|'keluar'}
const statuses:Record<string,string>={registered:'Terdaftar',draft:'Draft',submitted:'Menunggu verifikasi',revision:'Revisi',approved:'Lolos pemeriksaan internal',assigned:'Dalam disposisi',completed:'Disposisi selesai',archived:'Terarsip'}
export function SuratMenyuratModule({theme,subTab='ringkasan'}:SuratMenyuratModuleProps){
 const requestId=useRef(0)
 const [page,setPage]=useState(0);const [hasNext,setHasNext]=useState(false)
 const [items,setItems]=useState<Letter[]>([]);const [people,setPeople]=useState<Employee[]>([]);const [selected,setSelected]=useState<number|null>(null)
 const [note,setNote]=useState('');const [assignee,setAssignee]=useState('');const [content,setContent]=useState('');const [file,setFile]=useState<File|null>(null)
 const blank={kind:'masuk',subject:'',sender:'',recipient:'',number:'',content:'',date:new Date().toLocaleDateString('en-CA')};const [form,setForm]=useState(blank)
 const {userRole,canEdit}=useAuth();const admin=userRole==='Admin';const {busy,error,run,setError}=useOperation()
 const load=async()=>{const activeRequest=++requestId.current;const rows=await request<Letter[]>(`/operations/letters?skip=${page*50}&limit=51${subTab==='ringkasan'?'':`&kind=${subTab}`}`);if(activeRequest!==requestId.current)return;setHasNext(rows.length>50);setItems(rows.slice(0,50));if(admin)setPeople(await request<Employee[]>('/pegawai/?limit=1000'))}
 useEffect(()=>{setPage(0);setSelected(null)},[subTab])
 useEffect(()=>{load().catch(e=>setError(message(e)));return()=>{requestId.current++}},[page,subTab])
 const item=items.find(x=>x.id===selected)
 const act=(action:string)=>void run(async()=>{if(!item)return;await request(`/operations/letters/${item.id}/actions`,'POST',{action,version:item.version,note,assignee_id:assignee?Number(assignee):null,...(action==='edit'?{content}:{})});setNote('');await load()})
 return <Workspace theme={theme} title="Alur Persuratan">
  <p>Registrasi, disposisi, revisi, dan persetujuan tersimpan di server. Nomor ALUR adalah register internal. Penerbitan nomor surat resmi belum diaktifkan sampai format dan kewenangan KPU divalidasi. Persetujuan ini bukan TTE tersertifikasi.</p>
  {error&&<p role="alert" className="text-red-500">{error}</p>}
  <button className={button} disabled={busy} onClick={()=>void run(load)}>Muat ulang</button>
  {canEdit('surat')&&<details className="border rounded-lg p-3"><summary>Registrasi / buat draft</summary><form onSubmit={e=>{e.preventDefault();void run(async()=>{const uploaded=file?await filesApi.upload(file,'surat'):null;await request('/operations/letters','POST',{...form,file_id:uploaded?.file_id||null});setForm(blank);setFile(null);await load()})}}>
   <label>Jenis<select className={field} value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}><option value="masuk">Surat masuk</option><option value="keluar">Draft keluar</option></select></label>
   {(['subject','sender','recipient','number','date'] as const).map((k,i)=><label className="block" key={k}>{['Perihal','Pengirim','Penerima','Nomor surat masuk (opsional)','Tanggal'][i]}<input className={field} required={k!=='number'} disabled={k==='number'&&form.kind==='keluar'} type={k==='date'?'date':'text'} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}
   <label>Isi surat<textarea className={field} value={form.content} onChange={e=>setForm({...form,content:e.target.value})}/></label>
   <label>Lampiran<input className={field} type="file" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><button disabled={busy} className={button}>Simpan</button>
  </form></details>}
  <div className="grid md:grid-cols-2 gap-4"><div className="space-y-2">{items.filter(x=>subTab==='ringkasan'||x.kind===subTab).map(x=><button key={x.id} className={`block text-left w-full border rounded-xl p-4 ${selected===x.id?'border-red-600':'border-slate-400/30'}`} onClick={()=>{setSelected(x.id);setContent(x.content)}}><strong>{x.subject}</strong><p>{x.number||`Draft #${x.id}`} · {statuses[x.status]} · {x.date}</p></button>)}</div>
   {item&&<article className="space-y-3 border rounded-xl p-4"><h2 className="font-bold">{item.subject}</h2><p>{item.sender} → {item.recipient}</p><p className="whitespace-pre-wrap">{item.content}</p>
    {item.file_id&&<button className={button} disabled={busy} onClick={()=>void run(()=>download(`/files/${item.file_id}`,`lampiran-${item.id}`))}>Unduh lampiran</button>}
    <label>Catatan tindakan<textarea className={field} value={note} onChange={e=>setNote(e.target.value)}/></label>
    {['draft','revision'].includes(item.status)&&<><label>Perbaiki isi<textarea className={field} value={content} onChange={e=>setContent(e.target.value)}/></label><button className={button} disabled={busy} onClick={()=>act('edit')}>Simpan revisi</button> <button className={button} disabled={busy} onClick={()=>act('submit')}>Ajukan verifikasi</button></>}
    {admin&&item.status==='submitted'&&<div className="flex gap-2"><button className={button} disabled={busy} onClick={()=>act('approve')}>Lolos pemeriksaan internal</button><button className={button} disabled={busy} onClick={()=>act('revise')}>Minta revisi</button></div>}
    {admin&&['registered','assigned'].includes(item.status)&&<><label>Penerima disposisi<select className={field} value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">Pilih pegawai</option>{people.filter(p=>p.is_active).map(p=><option key={p.id_pegawai} value={p.id_pegawai}>{p.nama}</option>)}</select></label><button className={button} disabled={busy||!assignee} onClick={()=>act('assign')}>Kirim disposisi internal</button></>}
    {item.status==='assigned'&&<button className={button} disabled={busy} onClick={()=>act('complete')}>Selesaikan disposisi</button>}
    {['approved','completed'].includes(item.status)&&<button className={button} disabled={busy} onClick={()=>act('archive')}>Arsipkan alur</button>}
    <h3 className="font-bold">Riwayat server</h3>{item.history.map((h,i)=><p className="text-sm border-t pt-2" key={i}>{new Date(h.at).toLocaleString('id-ID')} · {h.actor} · {h.action}<br/>{h.note}</p>)}
   </article>}
  </div>
 <nav className="flex gap-4"><button disabled={busy||page===0} onClick={()=>{setSelected(null);setPage(page-1)}}>Sebelumnya</button><span>Halaman {page+1}</span><button disabled={busy||!hasNext} onClick={()=>{setSelected(null);setPage(page+1)}}>Berikutnya</button></nav>
 </Workspace>
}
