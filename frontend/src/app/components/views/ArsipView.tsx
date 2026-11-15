import { useEffect, useState } from 'react'
import { request, download, message } from '../../../services/operations'
import { filesApi } from '../../../services/api'
import { Workspace, field, button, useOperation } from '../ui/operations'
interface Archive { id_dokumen:number;nama_dokumen:string;nomor_dokumen:string;kategori:string;event:string;hak_akses:string;tanggal_dokumen:string;file_path:string|null;nama_pengunggah?:string }
export function ArsipView({theme}:{theme:'light'|'dark'}) {
 const [items,setItems]=useState<Archive[]>([]);const [trash,setTrash]=useState(false);const [search,setSearch]=useState('');const [page,setPage]=useState(0)
 const [file,setFile]=useState<File|null>(null); const [form,setForm]=useState({nama_dokumen:'',nomor_dokumen:'',kategori:'Laporan',event:'',tanggal_dokumen:new Date().toLocaleDateString('en-CA'),hak_akses:'internal'})
 const {busy,error,run,setError}=useOperation()
 const load=async()=>setItems(await request<Archive[]>(`/arsip/${trash?'trash':''}?limit=50&skip=${page*50}&search=${encodeURIComponent(search)}`))
 useEffect(()=>{load().catch(e=>setError(message(e)))},[trash,page])
 return <Workspace theme={theme} title="Arsip Dokumen">
  {error&&<p role="alert" className="text-red-500">{error}</p>}
  <div className="flex gap-2"><input aria-label="Cari arsip" className={field} placeholder="Cari nama atau nomor" value={search} onChange={e=>setSearch(e.target.value)}/><button className={button} disabled={busy} onClick={()=>void run(load)}>Cari</button><button className={button} onClick={()=>{setTrash(!trash);setPage(0)}}>{trash?'Arsip aktif':'Tempat sampah'}</button></div>
  {!trash&&<details className="border rounded-lg p-3"><summary>Unggah dokumen</summary><form onSubmit={e=>{e.preventDefault();void run(async()=>{
    if(!file)throw new Error('Pilih berkas')
    const uploaded=await filesApi.upload(file,'arsip')
    await request('/arsip/','POST',{...form,id_pegawai:0,file_path:String(uploaded.file_id),ukuran_file:uploaded.size})
    setForm({...form,nama_dokumen:'',nomor_dokumen:''});await load()
  })}}>
   {(['nama_dokumen','nomor_dokumen','kategori','event','tanggal_dokumen'] as const).map(k=><label className="block" key={k}>{k.replaceAll('_',' ')}<input required={k!=='event'} type={k==='tanggal_dokumen'?'date':'text'} className={field} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}
   <label>Akses<select className={field} value={form.hak_akses} onChange={e=>setForm({...form,hak_akses:e.target.value})}><option value="internal">Internal</option><option value="terbatas">Terbatas — bagian pengunggah dan admin</option></select></label>
   <input aria-label="Berkas arsip" required type="file" onChange={e=>setFile(e.target.files?.[0]||null)} className={field}/>
   <button className={button} disabled={busy}>Unggah dan simpan</button>
  </form></details>}
  {!items.length&&<p>Tidak ada dokumen pada halaman ini.</p>}
  {items.map(x=><article className="rounded-xl border border-slate-400/30 p-4 space-y-2" key={x.id_dokumen}><h2 className="font-bold">{x.nama_dokumen}</h2><p>{x.nomor_dokumen} · {x.tanggal_dokumen} · {x.kategori} · {x.hak_akses}</p><p>{x.event} · {x.nama_pengunggah}</p><div className="flex gap-2">
   {x.file_path&&/^\d+$/.test(x.file_path)&&<button className={button} disabled={busy} onClick={()=>void run(()=>download(`/files/${x.file_path}`,x.nama_dokumen))}>Unduh</button>}
   <button className={button} disabled={busy} onClick={()=>void run(async()=>{await request(`/arsip/${x.id_dokumen}/${trash?'restore':'delete'}`,'PATCH');await load()})}>{trash?'Pulihkan':'Pindah ke sampah'}</button>
  </div></article>)}
  <div className="flex gap-2"><button className={button} disabled={page===0||busy} onClick={()=>setPage(page-1)}>Sebelumnya</button><span>Halaman {page+1}</span><button className={button} disabled={items.length<50||busy} onClick={()=>setPage(page+1)}>Berikutnya</button></div>
 </Workspace>
}
