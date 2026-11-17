import { useEffect, useState } from 'react'
import { request, message } from '../../../services/operations'
import type { Employee, Department } from '../../../services/operations'
import { Workspace, field, button, useOperation } from '../ui/operations'
export function KelolaUserView({ theme }: { theme: 'light' | 'dark' }) {
  const [users,setUsers]=useState<Employee[]>([]); const [parts,setParts]=useState<Department[]>([])
  const [edit,setEdit]=useState<number|null>(null)
  const blank={nama:'',nip:'',password:'',role:'Pegawai',id_bagian:'',jabatan:''}
  const [form,setForm]=useState(blank); const {busy,error,run,setError}=useOperation()
  const load=async()=> { const [u,b]=await Promise.all([request<Employee[]>('/pegawai/?limit=1000'),request<Department[]>('/bagian/?limit=1000')]);setUsers(u);setParts(b) }
  useEffect(()=>{load().catch(e=>setError(message(e)))},[])
  return <Workspace theme={theme} title="Kelola Pengguna">
    {error&&<p role="alert" className="text-red-500">{error}</p>}
    <form onSubmit={e=>{e.preventDefault();void run(async()=>{
      const {password,nip,...rest}=form
      const data={...rest,id_bagian:form.id_bagian?Number(form.id_bagian):null,...(password?{password}:{}),...(edit?{}:{nip})}
      await request(edit?`/pegawai/${edit}`:'/pegawai/',edit?'PUT':'POST',data)
      setForm(blank);setEdit(null);await load()
    })}}>
      <h2 className="font-bold">{edit?'Ubah pengguna':'Tambah pengguna'}</h2>
      {(['nama','nip','jabatan','password'] as const).map(k=><label className="block" key={k}>{k === 'password' ? 'Kata sandi (minimal 8 karakter; kosongkan untuk mempertahankan saat edit)' : k}<input className={field} type={k==='password'?'password':'text'} disabled={k==='nip'&&edit!==null} required={k==='nama'||k==='nip'||(k==='password'&&!edit)} minLength={k==='password'?8:undefined} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}
      <label>Bagian<select required className={field} value={form.id_bagian} onChange={e=>setForm({...form,id_bagian:e.target.value})}><option value="">Pilih bagian</option>{parts.map(p=><option key={p.id_bagian} value={p.id_bagian}>{p.nama_bagian}</option>)}</select></label>
      <label>Peran<select className={field} value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{['Pegawai','Operator','Admin'].map(x=><option key={x}>{x}</option>)}</select></label>
      <button disabled={busy} className={button}>Simpan</button> <button type="button" className={button} onClick={()=>{setEdit(null);setForm(blank)}}>Batal</button>
    </form>
    <button disabled={busy} className={button} onClick={()=>void run(load)}>Muat ulang</button>
    <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{['Nama / NIP','Peran','Status','Tindakan'].map(x=><th className="p-2" key={x}>{x}</th>)}</tr></thead><tbody>{users.map(u=><tr className="border-t border-slate-400/30" key={u.id_pegawai}><td className="p-2">{u.nama}<br/>{u.nip}</td><td>{u.role}</td><td>{u.is_active?'Aktif':'Nonaktif'}</td><td className="space-x-2 p-2"><button className={button} onClick={()=>{setEdit(u.id_pegawai);setForm({nama:u.nama,nip:u.nip||'',role:u.role.toLowerCase()==='admin'?'Admin':'Pegawai',id_bagian:String(u.id_bagian||''),jabatan:u.jabatan||'',password:''})}}>Ubah</button><button className={button} disabled={busy} onClick={()=>void run(async()=>{await request(`/pegawai/${u.id_pegawai}`,'PUT',{is_active:!u.is_active});await load()})}>{u.is_active?'Nonaktifkan':'Aktifkan'}</button></td></tr>)}</tbody></table></div>
  </Workspace>
}
