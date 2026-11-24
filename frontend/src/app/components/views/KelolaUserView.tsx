import { useEffect, useState } from 'react'
import { request, message } from '../../../services/operations'
import type { Employee, Department } from '../../../services/operations'
import { Workspace, field, button, buttonSecondary, useOperation, SkeletonTable } from '../ui/operations'
import { UserPlus, Edit3, UserCheck, UserX, Loader2, Clock, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react'

interface AccountRequest {
  id_request: number
  nama: string
  nip: string
  jabatan: string
  unit_bagian: string
  id_bagian: number | null
  nama_subbagian: string | null
  status: string
  catatan_admin?: string | null
  created_at: string
}

export function KelolaUserView({ theme }: { theme: 'light' | 'dark' }) {
  const isDark = theme === 'dark'
  const [users, setUsers] = useState<Employee[]>([])
  const [parts, setParts] = useState<Department[]>([])
  const [requests, setRequests] = useState<AccountRequest[]>([])
  const [showRequests, setShowRequests] = useState(false)
  const [edit, setEdit] = useState<number | null>(null)
  const blank = { nama: '', nip: '', password: '', role: 'Operator', id_bagian: '', jabatan: '' }
  const [form, setForm] = useState(blank)
  const { busy, error, run, setError } = useOperation()

  const load = async () => {
    const [u, b, r] = await Promise.all([
      request<Employee[]>('/pegawai/?limit=1000'),
      request<Department[]>('/bagian/?limit=1000'),
      request<AccountRequest[]>('/pegawai/requests?status=pending'),
    ])
    setUsers(u)
    setParts(b)
    setRequests(r)
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
              autoComplete="off"
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
              autoComplete="new-password"
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
              {[
                { value: 'Operator', label: 'Pegawai' },
                { value: 'Admin', label: 'Admin' },
              ].map(x => (
                <option key={x.value} value={x.value} className="bg-white text-slate-900 dark:bg-slate-900 dark:text-white">
                  {x.label}
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-base text-slate-900 dark:text-white">
              {showRequests
                ? `Permintaan Verifikasi Akun Baru (${requests.length})`
                : `Daftar Akun Pengguna (${users.length})`}
            </h2>
            <button
              type="button"
              onClick={() => setShowRequests(!showRequests)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 border transition-all cursor-pointer active:scale-95 ${
                showRequests
                  ? 'bg-red-700 text-white border-red-700 shadow-xs'
                  : isDark
                  ? 'border-white/15 bg-slate-800/80 text-slate-200 hover:bg-slate-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {showRequests ? (
                <>
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Daftar Akun Pengguna</span>
                </>
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Request</span>
                  {requests.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-red-600 text-white">
                      {requests.length}
                    </span>
                  )}
                </>
              )}
            </button>
          </div>
        </div>

        {showRequests ? (
          requests.length === 0 ? (
            <div
              className={`p-8 rounded-2xl border text-center space-y-2 ${
                isDark ? 'border-white/10 bg-[#111827]/40 text-slate-400' : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              <Clock className="w-8 h-8 mx-auto opacity-40" />
              <p className="text-sm font-semibold">Belum ada permintaan verifikasi akun baru</p>
              <p className="text-xs">Akun yang mendaftar melalui halaman Sign Up akan muncul di sini.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {requests.map((req) => (
                <div
                  key={req.id_request}
                  className={`p-4 sm:p-5 rounded-2xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-all ${
                    isDark
                      ? 'border-white/10 bg-[#111827]/60 text-slate-200'
                      : 'border-slate-200 bg-white text-slate-800 shadow-xs'
                  }`}
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">{req.nama}</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        NIP: {req.nip}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        <Clock className="w-3 h-3" />
                        Menunggu Verifikasi
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs pt-1">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Jabatan</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{req.jabatan}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Unit Bagian</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{req.unit_bagian}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Subbagian</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {req.nama_subbagian || 'Tingkat Bagian (Tanpa Subbagian)'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Waktu Pengajuan</span>
                        <span className="font-medium text-slate-600 dark:text-slate-300">
                          {new Date(req.created_at).toLocaleString('id-ID', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await request(`/pegawai/requests/${req.id_request}/accept`, 'POST')
                          await load()
                        })
                      }
                      className="px-4 py-2 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Accept</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await request(`/pegawai/requests/${req.id_request}/reject`, 'POST', {})
                          await load()
                        })
                      }
                      className="px-3.5 py-2 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-950/30 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Tolak</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : busy && users.length === 0 ? (
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
                      u.role.toLowerCase() === 'admin' || u.role.toLowerCase() === 'administrator'
                        ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                        : 'bg-slate-200/60 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}>
                      {u.role.toLowerCase() === 'admin' || u.role.toLowerCase() === 'administrator' ? 'Admin' : 'Pegawai'}
                    </span>
                  </td>
                  <td className="p-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                      u.is_online
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.is_online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {u.is_online ? 'Aktif' : 'Tidak Aktif'}
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
                          role: u.role.toLowerCase() === 'admin' || u.role.toLowerCase() === 'administrator' ? 'Admin' : 'Operator',
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
