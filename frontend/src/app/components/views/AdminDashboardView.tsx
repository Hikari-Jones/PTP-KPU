import { Users, Server, Activity, Database, Shield } from "lucide-react"
import { Card, CardContent } from "../ui/card"

export function AdminDashboardView({ theme }: { theme: "light" | "dark" }) {
  const isDark = theme === "dark"

  const systemStats = [
    { title: "Pengguna Aktif", val: "28 Operator", icon: Users, isRed: true },
    { title: "Status Server", val: "99.9% Online", icon: Server, isRed: false },
    { title: "Kirim KIRANA Bot", val: "142 Query/Hari", icon: Activity, isRed: true },
    { title: "Total Database", val: "1.4 GB", icon: Database, isRed: false },
  ]

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-red-600" />
          <h1 className={`text-2xl font-bold tracking-tight my-0 ${isDark ? "text-white" : "text-black"}`}>
            Dashboard Administrator
          </h1>
        </div>
        <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
          Panel kontrol pusat pengawasan infrastruktur dan akun pengguna Sistem Informasi KPU Sulut
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {systemStats.map((item, idx) => {
          const Icon = item.icon
          return (
            <Card key={idx} className={isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? "text-gray-300" : "text-slate-800"}`}>{item.title}</p>
                  <h3 className={`text-lg font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>{item.val}</h3>
                </div>
                <div className={`p-3 rounded-xl shadow-xs ${item.isRed ? "bg-red-600 text-white" : "bg-slate-900 text-white dark:bg-white dark:text-slate-950"}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Admin Audit Log */}
      <Card className={isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}>
        <div className={`p-4 border-b ${isDark ? "border-[#1e293b]" : "border-slate-200"}`}>
          <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-black"}`}>Audit Log Sistem Terkini</h3>
        </div>
        <CardContent className="p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between p-3 rounded-lg border border-red-600/30 bg-red-600/10">
            <span className="font-bold text-red-600 dark:text-red-400">[ADMIN] Sesi login baru dideteksi dari IP 180.252.12.9</span>
            <span className={`text-[10px] font-mono font-bold ${isDark ? "text-gray-300" : "text-slate-800"}`}>10:55 WITA</span>
          </div>
          <div className={`flex items-center justify-between p-3 rounded-lg border ${isDark ? "border-slate-800 bg-[#111827]" : "border-slate-200 bg-slate-50"}`}>
            <span className={`font-bold ${isDark ? "text-white" : "text-black"}`}>[SYSTEM] Backup database otomatis selesai disimpan</span>
            <span className={`text-[10px] font-mono font-bold ${isDark ? "text-gray-400" : "text-slate-600"}`}>06:00 WITA</span>
          </div>
          <div className={`flex items-center justify-between p-3 rounded-lg border ${isDark ? "border-slate-800 bg-[#111827]" : "border-slate-200 bg-slate-50"}`}>
            <span className={`font-bold ${isDark ? "text-white" : "text-black"}`}>[BOT] KIRANA Agent memproses 45 draf dokumen otomatis</span>
            <span className={`text-[10px] font-mono font-bold ${isDark ? "text-gray-400" : "text-slate-600"}`}>Kemarin</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
