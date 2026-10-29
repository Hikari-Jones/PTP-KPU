import { useState } from "react"
import { Bug, Plus, X, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "../ui/card"

export function BugReportView({ theme }: { theme: "light" | "dark" }) {
  const isDark = theme === "dark"

  const [reports, setReports] = useState([
    { id: "BUG-101", title: "Format tanggal pada export CSV rekap surat perlu penyesuaian ISO", priority: "Sedang", status: "Selesai", reportedBy: "Ahmad K.", date: "05 Aug 2026" },
    { id: "BUG-102", title: "Gagal memuat preview PDF pada browser layar kecil", priority: "Tinggi", status: "Diproses", reportedBy: "Siti R.", date: "04 Aug 2026" },
    { id: "BUG-103", title: "Respons bot KIRANA sedikit terlambat pada perintah jadwal", priority: "Rendah", status: "Terbuka", reportedBy: "Budi S.", date: "02 Aug 2026" },
  ])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [priority, setPriority] = useState<"Rendah" | "Sedang" | "Tinggi">("Sedang")
  const [reportedBy, setReportedBy] = useState("")
  const [toast, setToast] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    const newBug = {
      id: `BUG-${Math.floor(104 + Math.random() * 50)}`,
      title: title.trim(),
      priority,
      status: "Terbuka",
      reportedBy: reportedBy.trim() || "Operator",
      date: new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
    }

    setReports((prev) => [newBug, ...prev])
    setToast(`Kendala ${newBug.id} berhasil dilaporkan ke tim IT KPU Sulut.`)
    setTimeout(() => setToast(null), 4000)

    setTitle("")
    setReportedBy("")
    setIsModalOpen(false)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight my-0 ${isDark ? "text-white" : "text-black"}`}>
            Laporan Kendala System & Bug
          </h1>
          <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
            Monitoring isu teknis, log error, dan feedback pengguna aplikasi PTP-KPU Sulut
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-kpu-red px-4 py-2 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer shrink-0 transition-all active:scale-95 shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>Laporkan Kendala Baru</span>
        </button>
      </div>

      {toast && (
        <div className="flex items-center gap-2 p-3 text-xs font-bold rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toast}</span>
        </div>
      )}

      <div className="space-y-3">
        {reports.map((bug) => (
          <Card key={bug.id} className={isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}>
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-red-600 text-white shadow-xs">
                  <Bug className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] font-black text-red-600 dark:text-red-400">{bug.id}</span>
                    <span className={`text-[10px] font-bold ${isDark ? "text-gray-300" : "text-black"}`}>Prioritas: {bug.priority}</span>
                  </div>
                  <h3 className={`text-xs font-bold mt-0.5 ${isDark ? "text-white" : "text-black"}`}>{bug.title}</h3>
                  <p className={`text-[10px] font-semibold mt-1 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                    Dilaporkan oleh {bug.reportedBy} • {bug.date}
                  </p>
                </div>
              </div>

              <span className={`status-badge px-2.5 py-1 rounded-full border text-xs font-semibold ${bug.status === "Selesai" ? "bg-black text-white border-black dark:border-slate-700" : "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800"}`}>
                {bug.status}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal Input Bug Report */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl animate-in zoom-in-95 duration-150 ${isDark ? "bg-[#0f172a] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-2">
                <Bug className="h-5 w-5 text-red-600" />
                <h3 className="text-base font-bold">Form Laporan Kendala Sistem</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 pt-4 text-xs font-semibold">
              <div>
                <label className="block mb-1">Judul / Ringkasan Kendala</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Tombol finalisasi surat tidak merespons"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 outline-none ${isDark ? "bg-[#1e293b] border-white/10 text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-slate-900 focus:border-red-500"}`}
                />
              </div>

              <div>
                <label className="block mb-1">Tingkat Prioritas</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className={`w-full rounded-xl border px-3 py-2 outline-none ${isDark ? "bg-[#1e293b] border-white/10 text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-slate-900 focus:border-red-500"}`}
                >
                  <option value="Rendah">Rendah (Pertanyaan / Saran Tampilan)</option>
                  <option value="Sedang">Sedang (Fungsi terlambat / lambat)</option>
                  <option value="Tinggi">Tinggi (Fitur macet / Error data)</option>
                </select>
              </div>

              <div>
                <label className="block mb-1">Nama Pelapor</label>
                <input
                  type="text"
                  placeholder="Nama staf operator yang mengalami kendala"
                  value={reportedBy}
                  onChange={(e) => setReportedBy(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 outline-none ${isDark ? "bg-[#1e293b] border-white/10 text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-slate-900 focus:border-red-500"}`}
                />
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
                  Kirim Laporan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
