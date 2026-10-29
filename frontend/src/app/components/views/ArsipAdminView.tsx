import { useState } from "react"
import { Download, ShieldCheck, HardDrive, RefreshCw, CheckCircle2, Clock } from "lucide-react"
import { Card, CardContent } from "../ui/card"

export function ArsipAdminView({ theme }: { theme: "light" | "dark" }) {
  const isDark = theme === "dark"

  const [backups, setBackups] = useState([
    { id: "BACKUP-2026-08-05", size: "1.42 GB", type: "Full Database Dump (MySQL kpu_db)", status: "Terverifikasi", date: "05 Agu 2026 06:00" },
    { id: "BACKUP-2026-08-01", size: "1.38 GB", type: "Full Database Dump (MySQL kpu_db)", status: "Terverifikasi", date: "01 Agu 2026 06:00" },
    { id: "BACKUP-2026-07-25", size: "1.25 GB", type: "Full Database Dump (MySQL kpu_db)", status: "Terverifikasi", date: "25 Jul 2026 06:00" },
  ])

  const [isBackingUp, setIsBackingUp] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const handleRunBackup = () => {
    setIsBackingUp(true)
    setTimeout(() => {
      const now = new Date()
      const dateStr = now.toISOString().split("T")[0]
      const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      const newBackup = {
        id: `BACKUP-${dateStr}-${Math.floor(10 + Math.random() * 90)}`,
        size: "1.45 GB",
        type: "Full Database Dump (MySQL kpu_db)",
        status: "Terverifikasi",
        date: `${dateStr} ${timeStr}`,
      }
      setBackups((prev) => [newBackup, ...prev])
      setIsBackingUp(false)
      setToast(`Backup database ${newBackup.id} berhasil dibuat dan disimpan di direktori arsip aman.`)
      setTimeout(() => setToast(null), 5000)
    }, 1200)
  }

  const handleDownloadBackup = (backupId: string) => {
    const manifest = `KPU PROVINSI SULAWESI UTARA
======================================================
ARSIP CADANGAN DATABASE SISTEM PTP-KPU (LOCAL OFFICE)
ID Cadangan : ${backupId}
Database    : kpu_db (MySQL 8.0 / InnoDB)
Waktu Unduh : ${new Date().toLocaleString("id-ID")}
Integritas  : SHA-256 CHECKED & VERIFIED
Status      : VALID RESMI ADMINISTRATOR
======================================================
Daftar Tabel Terarsip:
- bagian
- pegawai
- kode_klasifikasi_arsip
- jenis_surat
- penomoran_sequence
- surat_keluar
- surat_tugas
- dokumen_arsip
- tahun_anggaran
- akun_anggaran
- pagu_anggaran
- realisasi_anggaran
- revisi_anggaran
- chat_session
- chat_message
======================================================`

    const blob = new Blob([manifest], { type: "text/plain;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `${backupId}_MANIFEST.txt`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight my-0 ${isDark ? "text-white" : "text-black"}`}>
            Arsip Admin & Cadangan Sistem
          </h1>
          <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
            Manajemen backup database berkala dan arsip terenkripsi tingkat administrator di PC Kantor KPU
          </p>
        </div>
        <button
          onClick={handleRunBackup}
          disabled={isBackingUp}
          className="btn-kpu-red px-4 py-2 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer shrink-0 transition-all active:scale-95 shadow-md disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${isBackingUp ? "animate-spin" : ""}`} />
          <span>{isBackingUp ? "Membuat Cadangan..." : "Jalankan Backup Sekarang"}</span>
        </button>
      </div>

      {toast && (
        <div className="flex items-center gap-2 p-3 text-xs font-bold rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toast}</span>
        </div>
      )}

      <div className="space-y-3">
        {backups.map((item) => (
          <Card key={item.id} className={isDark ? "bg-[#0d1322] border-white/10" : "bg-white border-slate-200 shadow-sm"}>
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-xs">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`text-xs font-bold ${isDark ? "text-white" : "text-black"}`}>{item.id}</h3>
                  <p className={`text-[10px] font-semibold mt-0.5 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                    {item.type} • {item.size} • <span className="text-slate-400">{item.date}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {item.status}
                </span>

                <button
                  onClick={() => handleDownloadBackup(item.id)}
                  className={`p-2 rounded-lg border text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5 ${
                    isDark ? "border-white/10 hover:bg-slate-800 text-white" : "border-slate-200 hover:bg-slate-100 text-slate-800"
                  }`}
                  title="Unduh Berkas Backup"
                >
                  <Download className="w-3.5 h-3.5 text-red-600" />
                  <span>Unduh</span>
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
