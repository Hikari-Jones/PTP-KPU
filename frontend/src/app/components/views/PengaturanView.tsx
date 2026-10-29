import { UserIcon, Shield, Moon, Sun } from "lucide-react"
import { useAuth } from "../../context/AuthContext"
import { Card, CardContent } from "../ui/card"

export function PengaturanView({ theme, onToggleTheme }: { theme: "light" | "dark"; onToggleTheme: () => void }) {
  const { currentUser, userRole } = useAuth()
  const isDark = theme === "dark"

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div>
        <h1 className={`text-2xl font-bold tracking-tight my-0 ${isDark ? "text-white" : "text-black"}`}>
          Pengaturan Aplikasi
        </h1>
        <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
          Kelola preferensi akun, tampilan tema, dan opsi notifikasi PTP-KPU
        </p>
      </div>

      {/* Account Profile Card */}
      <Card className={isDark ? "bg-[#0c1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}>
        <div className={`p-5 border-b flex items-center gap-3 ${isDark ? "border-[#1e293b]" : "border-slate-200"}`}>
          <div className="p-2.5 rounded-xl bg-red-600 text-white shadow-xs">
            <UserIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-black"}`}>
              Informasi Pengguna
            </h3>
            <p className={`text-xs font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
              Detail profil operator PTP-KPU
            </p>
          </div>
        </div>
        <CardContent className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={`font-bold block mb-1 ${isDark ? "text-white" : "text-black"}`}>Nama Lengkap</label>
              <input
                type="text"
                readOnly
                value={currentUser?.name || "Ahmad Kurniawan"}
                className={`w-full rounded-lg px-3 py-2 border font-semibold ${isDark ? "bg-[#111827] border-[#1e293b] text-white" : "bg-slate-50 border-slate-300 text-black"}`}
              />
            </div>
            <div>
              <label className={`font-bold block mb-1 ${isDark ? "text-white" : "text-black"}`}>Email Instansi</label>
              <input
                type="email"
                readOnly
                value={currentUser?.email || "ahmad.kurniawan@kpu.go.id"}
                className={`w-full rounded-lg px-3 py-2 border font-semibold ${isDark ? "bg-[#111827] border-[#1e293b] text-white" : "bg-slate-50 border-slate-300 text-black"}`}
              />
            </div>
            <div>
              <label className={`font-bold block mb-1 ${isDark ? "text-white" : "text-black"}`}>Jabatan / Subbagian</label>
              <input
                type="text"
                readOnly
                value={currentUser?.subbagian || "Teknis Penyelenggaraan Pemilu"}
                className={`w-full rounded-lg px-3 py-2 border font-semibold ${isDark ? "bg-[#111827] border-[#1e293b] text-white" : "bg-slate-50 border-slate-300 text-black"}`}
              />
            </div>
            <div>
              <label className={`font-bold block mb-1 ${isDark ? "text-white" : "text-black"}`}>Akses Keamanan</label>
              <div className="flex items-center gap-2 pt-1 text-red-600 dark:text-red-400 font-bold">
                <Shield className="w-4 h-4" />
                <span>Terverifikasi ({userRole || "Operator"})</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preferences & Appearance Card */}
      <Card className={isDark ? "bg-[#0c1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}>
        <div className={`p-5 border-b flex items-center justify-between ${isDark ? "border-[#1e293b]" : "border-slate-200"}`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-xs">
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </div>
            <div>
              <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-black"}`}>
                Tampilan Tema Aplikasi
              </h3>
              <p className={`text-xs font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                Ganti antara Light Mode dan Dark Mode
              </p>
            </div>
          </div>
          <button
            onClick={onToggleTheme}
            className="btn-kpu-red px-4 py-2 rounded-xl text-white text-xs font-bold cursor-pointer active:scale-95 transition-all"
          >
            Switch to {isDark ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
      </Card>
    </div>
  )
}
