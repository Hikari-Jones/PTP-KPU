import { useState } from "react"
import { UserPlus, X, CheckCircle2, Shield, Mail, Building, Key } from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"

export function KelolaUserView({ theme }: { theme: "light" | "dark" }) {
  const isDark = theme === "dark"
  const [users, setUsers] = useState([
    { id: 1, name: "Admin KPU Sulut", email: "admin@kpu.go.id", role: "Admin", status: "Aktif", subbagian: "RENDATIN (Perencanaan, Data dan Informasi)" },
    { id: 2, name: "Ahmad Kurniawan", email: "ahmad.kurniawan@kpu.go.id", role: "Pegawai", status: "Aktif", subbagian: "Teknis Penyelenggaraan Pemilu" },
    { id: 3, name: "Siti Rahmawati", email: "siti.rahma@kpu.go.id", role: "Pegawai", status: "Aktif", subbagian: "Hukum" },
    { id: 4, name: "Budi Santoso", email: "budi.santoso@kpu.go.id", role: "Pegawai", status: "Non-Aktif", subbagian: "UMLOG (Umum dan Logistik)" },
  ])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [name, setName] = useState("")
  const [nip, setNip] = useState("")
  const [email, setEmail] = useState("")
  const [subbagian, setSubbagian] = useState("RENDATIN (Perencanaan, Data dan Informasi)")
  const [role, setRole] = useState<"Admin" | "Pegawai">("Pegawai")
  const [successToast, setSuccessToast] = useState<string | null>(null)

  const toggleStatus = (id: number) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, status: u.status === "Aktif" ? "Non-Aktif" : "Aktif" } : u))
    )
  }

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return

    const newUser = {
      id: Date.now(),
      name: name.trim(),
      email: email.trim(),
      role,
      status: "Aktif",
      subbagian,
    }

    setUsers((prev) => [...prev, newUser])
    setSuccessToast(`User ${newUser.name} berhasil didaftarkan ke sistem.`)
    setTimeout(() => setSuccessToast(null), 4000)

    // Reset & Close
    setName("")
    setNip("")
    setEmail("")
    setIsModalOpen(false)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight my-0 ${isDark ? "text-white" : "text-black"}`}>
            Manajemen User & Hak Akses
          </h1>
          <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
            Kelola daftar pegawai instansi dan penetapan role Admin/Pegawai PTP-KPU
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-kpu-red px-4 py-2 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer shrink-0 transition-all active:scale-95 shadow-md"
        >
          <UserPlus className="w-4 h-4" />
          <span>Tambah User Baru</span>
        </button>
      </div>

      {successToast && (
        <div className="flex items-center gap-2 p-3 text-xs font-bold rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500">
          <CheckCircle2 className="w-4 h-4" />
          <span>{successToast}</span>
        </div>
      )}

      <Card className={isDark ? "bg-[#0d1322] border-white/10" : "bg-white border-slate-200 shadow-sm"}>
        <div className={`p-4 border-b ${isDark ? "border-white/10" : "border-slate-200"}`}>
          <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-black"}`}>Daftar Akun Terdaftar</h3>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className={isDark ? "border-b border-white/30 bg-[#0a0e1a]" : "border-b border-slate-200 bg-slate-100"}>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Nama Pengguna</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Email</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Subbagian</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Role</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Status</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className={isDark ? "border-b border-white/20" : "border-b border-slate-100"}>
                  <TableCell className={`font-bold text-xs ${isDark ? "text-white" : "text-black"}`}>{u.name}</TableCell>
                  <TableCell className={`text-xs font-mono font-semibold ${isDark ? "text-gray-300" : "text-slate-800"}`}>{u.email}</TableCell>
                  <TableCell className={`text-xs font-bold ${isDark ? "text-gray-200" : "text-black"}`}>{u.subbagian}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${u.role === "Admin" ? "bg-red-600 text-white" : isDark ? "bg-white text-black font-bold" : "bg-slate-900 text-white font-bold"}`}>
                      {u.role}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`status-badge px-2.5 py-0.5 rounded-full border text-[10px] font-semibold ${u.status === "Aktif" ? "bg-black text-white border-black dark:border-slate-700" : isDark ? "bg-slate-800 text-slate-300 border-slate-600" : "bg-slate-100 text-slate-700 border-slate-300"}`}>
                      {u.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => toggleStatus(u.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${isDark ? "bg-slate-800 hover:bg-slate-700 text-white border border-slate-700" : "bg-slate-100 hover:bg-slate-200 text-black border border-slate-300"
                        }`}
                    >
                      {u.status === "Aktif" ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal Tambah User */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl animate-in zoom-in-95 duration-150 ${isDark ? "bg-[#0f172a] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-red-600" />
                <h3 className="text-base font-bold">Tambah Pengguna Baru</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 pt-4 text-xs font-semibold">
              <div>
                <label className="block mb-1">Nama Lengkap & Gelar</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Michael Senduk, S.Kom"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 outline-none ${isDark ? "bg-[#1e293b] border-white/10 text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-slate-900 focus:border-red-500"}`}
                />
              </div>

              <div>
                <label className="block mb-1">NIP (Nomor Induk Pegawai)</label>
                <input
                  type="text"
                  placeholder="Misal: 199304122022011005"
                  value={nip}
                  onChange={(e) => setNip(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 outline-none ${isDark ? "bg-[#1e293b] border-white/10 text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-slate-900 focus:border-red-500"}`}
                />
              </div>

              <div>
                <label className="block mb-1">Email Instansi KPU</label>
                <input
                  type="email"
                  required
                  placeholder="nama@kpu.go.id"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 outline-none ${isDark ? "bg-[#1e293b] border-white/10 text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-slate-900 focus:border-red-500"}`}
                />
              </div>

              <div>
                <label className="block mb-1">Subbagian / Unit Kerja</label>
                <select
                  value={subbagian}
                  onChange={(e) => setSubbagian(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 outline-none ${isDark ? "bg-[#1e293b] border-white/10 text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-slate-900 focus:border-red-500"}`}
                >
                  <option value="RENDATIN (Perencanaan, Data dan Informasi)">RENDATIN (Perencanaan, Data dan Informasi)</option>
                  <option value="Teknis Penyelenggaraan Pemilu">Teknis Penyelenggaraan Pemilu</option>
                  <option value="Hukum dan Pengawasan">Hukum dan Pengawasan</option>
                  <option value="SDM dan Partisipasi Masyarakat">SDM dan Partisipasi Masyarakat</option>
                  <option value="UMLOG (Umum dan Logistik)">UMLOG (Umum dan Logistik)</option>
                  <option value="Keuangan">Keuangan</option>
                </select>
              </div>

              <div>
                <label className="block mb-1">Hak Akses Role</label>
                <div className="flex gap-4 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="role"
                      value="Pegawai"
                      checked={role === "Pegawai"}
                      onChange={() => setRole("Pegawai")}
                    />
                    <span>Pegawai</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="role"
                      value="Admin"
                      checked={role === "Admin"}
                      onChange={() => setRole("Admin")}
                    />
                    <span>Administrator</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-white/10 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-kpu-red px-5 py-2 rounded-xl text-white text-xs font-bold shadow-md cursor-pointer"
                >
                  Simpan User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
