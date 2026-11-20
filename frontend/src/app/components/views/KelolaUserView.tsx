import { useEffect, useState } from 'react'
import { request, message } from '../../../services/operations'
import type { Employee, Department } from '../../../services/operations'
import { Workspace, field, button, buttonSecondary, useOperation, SkeletonTable } from '../ui/operations'
import { UserPlus, Edit3, UserCheck, UserX, RefreshCw, Loader2 } from 'lucide-react'

export function KelolaUserView({ theme }: { theme: 'light' | 'dark' }) {
  const isDark = theme === 'dark'
  const [users, setUsers] = useState<Employee[]>([])
  const [parts, setParts] = useState<Department[]>([])
  const [edit, setEdit] = useState<number | null>(null)
  const blank = { nama: '', nip: '', password: '', role: 'Pegawai', id_bagian: '', jabatan: '' }
  const [form, setForm] = useState(blank)
  const { busy, error, run, setError } = useOperation()

  const load = async () => {
    const [u, b] = await Promise.all([
      request<Employee[]>('/pegawai/?limit=1000'),
      request<Department[]>('/bagian/?limit=1000'),
    ])
    setUsers(u)
    setParts(b)
  }

  useEffect(() => {
    load().catch(e => setError(message(e)))
  }, [])

  return (
    <Workspace
      theme={theme}
      category="Administrator"
      title="Kelola Pengguna"
      description="Manajemen Akun Pegawai, Hak Akses Peran, dan Penugasan Subbagian KPU Provinsi Sulawesi Utara"
    >
      {error && (
        <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Form Card */}
      <form
        onSubmit={e => {
          e.preventDefault()
          void run(async () => {
            const { password, nip, ...rest } = form
            const data = {
              ...rest,
              id_bagian: form.id_bagian ? Number(form.id_bagian) : null,
              ...(password ? { password } : {}),
              ...(edit ? {} : { nip }),
            }
            await request(edit ? `/pegawai/${edit}` : '/pegawai/', edit ? 'PUT' : 'POST', data)
            setForm(blank)
            setEdit(null)
            await load()
          })
        }}
        className={`p-5 sm:p-6 rounded-2xl border transition-all ${
          isDark
            ? 'bg-[#111827]/70 border-white/10 shadow-md'
            : 'bg-slate-50 border-slate-200 shadow-xs'
        }`}
      >
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-5 h-5 text-red-600 dark:text-red-500" />
          <h2 className="font-bold text-base text-slate-900 dark:text-white">
            {edit ? 'Ubah Akun Pengguna' : 'Tambah Pengguna Baru'}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Nama
            </label>
            <input
              className={field}
              type="text"
              required
              placeholder="Contoh: Drs. Nama Lengkap, M.Si"
              value={form.nama}
              onChange={e => setForm({ ...form, nama: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              NIP
            </label>
            <input
              className={field}
              type="text"
              disabled={edit !== null}
              required
              placeholder="Nomor Induk Pegawai (18 digit)"
              value={form.nip}
              onChange={e => setForm({ ...form, nip: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Jabatan
            </label>
            <input
              className={field}
              type="text"
              placeholder="Contoh: Kepala Bagian / Staf Pengelola"
              value={form.jabatan}
              onChange={e => setForm({ ...form, jabatan: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Kata sandi (minimal 8 karakter)
            </label>
            <input
              className={field}
              type="password"
              required={!edit}
              minLength={8}
              placeholder={edit ? 'Kosongkan jika tidak ingin mengubah kata sandi' : 'Minimal 8 karakter'}
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Bagian / Subbagian
            </label>
            <select
              required
              className={field}
              value={form.id_bagian}
              onChange={e => setForm({ ...form, id_bagian: e.target.value })}
            >
              <option value="" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white">
                Pilih bagian
              </option>
              {parts.map(p => (
                <option key={p.id_bagian} value={p.id_bagian} className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white">
                  {p.nama_bagian}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Peran Akun
            </label>
            <select
              className={field}
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
            >
              {['Pegawai', 'Operator', 'Admin'].map(x => (
                <option key={x} className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white">
                  {x}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 mt-2 flex items-center gap-3">
          <button disabled={busy} className={button}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{busy ? 'Menyimpan…' : edit ? 'Simpan Perubahan' : 'Tambah Pengguna'}</span>
          </button>
          {edit && (
            <button
              type="button"
              className={buttonSecondary}
              onClick={() => {
                setEdit(null)
                setForm(blank)
              }}
            >
              Batal
            </button>
          )}
        </div>
      </form>

      {/* Table Section */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base text-slate-900 dark:text-white">
            Daftar Akun Pengguna ({users.length})
          </h2>
          <button disabled={busy} className={buttonSecondary} onClick={() => void run(load)}>
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
            <span>Muat ulang</span>
          </button>
        </div>

        {busy && users.length === 0 ? (
          <SkeletonTable rows={5} cols={4} />
        ) : (
          <div className={`overflow-x-auto rounded-2xl border ${
          isDark ? 'border-white/10 bg-[#111827]/40' : 'border-slate-200 bg-white shadow-xs'
        }`}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className={`border-b text-xs font-bold uppercase tracking-wider ${
                isDark ? 'border-white/10 text-gray-300 bg-slate-800/60' : 'border-slate-200 text-slate-700 bg-slate-100/70'
              }`}>
                <th className="p-3.5">Nama / NIP</th>
                <th className="p-3.5">Peran</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-slate-200'}`}>
              {users.map(u => (
                <tr
                  key={u.id_pegawai}
                  className={`transition-colors ${
                    isDark ? 'hover:bg-slate-800/40 text-gray-200' : 'hover:bg-slate-50/80 text-slate-800'
                  }`}
                >
                  <td className="p-3.5">
                    <div className="font-bold">{u.nama}</div>
                    <div className="text-xs font-mono text-slate-400">{u.nip}</div>
                  </td>
                  <td className="p-3.5">
                    <span className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-semibold border ${
                      u.role.toLowerCase() === 'admin'
                        ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                        : 'bg-slate-200/60 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="p-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                      u.is_active
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {u.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="p-3.5 text-right space-x-2 whitespace-nowrap">
                    <button
                      className={buttonSecondary}
                      onClick={() => {
                        setEdit(u.id_pegawai)
                        setForm({
                          nama: u.nama,
                          nip: u.nip || '',
                          role: u.role.toLowerCase() === 'admin' ? 'Admin' : 'Pegawai',
                          id_bagian: String(u.id_bagian || ''),
                          jabatan: u.jabatan || '',
                          password: '',
                        })
                      }}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Ubah</span>
                    </button>
                    <button
                      className={`px-3 py-2 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 border ${
                        u.is_active
                          ? 'border-red-300 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-950/30'
                          : 'border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-950/30'
                      }`}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await request(`/pegawai/${u.id_pegawai}`, 'PUT', { is_active: !u.is_active })
                          await load()
                        })
                      }
                    >
                      {u.is_active ? (
                        <>
                          <UserX className="w-3.5 h-3.5" />
                          <span>Nonaktifkan</span>
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Aktifkan</span>
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </Workspace>
  )
}
