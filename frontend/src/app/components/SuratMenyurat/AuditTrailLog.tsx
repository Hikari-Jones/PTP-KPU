import { History, User, Calendar, Clock, ShieldCheck, FileEdit, FileText, Send } from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Badge } from "../ui/badge"
import type { SuratItem } from "./types"

interface AuditTrailLogProps {
  theme: "light" | "dark"
  surat: SuratItem
}

export function AuditTrailLog({ theme, surat }: AuditTrailLogProps) {
  const isDark = theme === "dark"

  const getActionIcon = (aksi: string) => {
    if (aksi.includes("Registrasi")) return <FileText className="w-4 h-4 text-red-500" />
    if (aksi.includes("Disposisi")) return <User className="w-4 h-4 text-red-600 dark:text-red-400" />
    if (aksi.includes("Draft") || aksi.includes("Revisi")) return <FileEdit className="w-4 h-4 text-red-500" />
    if (aksi.includes("TTE") || aksi.includes("Approval")) return <ShieldCheck className="w-4 h-4 text-emerald-500" />
    if (aksi.includes("Pengiriman")) return <Send className="w-4 h-4 text-emerald-500" />
    return <History className="w-4 h-4 text-slate-400" />
  }

  return (
    <Card className={isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}>
      <div className={`p-4 border-b flex items-center justify-between ${isDark ? "border-[#1e293b]" : "border-slate-200"}`}>
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-red-500" />
          <h3 className="text-sm font-bold">Arsip & Riwayat Audit Trail Persuratan (Log History)</h3>
        </div>
        <Badge variant="outline">{surat.history.length} Catatan Log</Badge>
      </div>

      <CardContent className="p-5">
        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-red-500 before:via-red-400 before:to-emerald-500">
          {surat.history.map((log, index) => (
            <div key={log.id || index} className="relative group">
              {/* Point Indicator */}
              <div className="absolute -left-[27px] top-1.5 w-3 h-3 rounded-full border-2 border-[#0d1322] bg-red-500 shadow-sm group-hover:scale-125 transition-transform" />

              <div
                className={`p-4 rounded-xl border transition-all ${isDark ? "bg-[#131d30]/60 border-[#1e293b] hover:border-slate-700" : "bg-slate-50 border-slate-200 hover:border-slate-300"
                  }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                  <div className="flex items-center gap-2">
                    {getActionIcon(log.aksi)}
                    <h4 className="text-xs font-bold">{log.aksi}</h4>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400 font-mono">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {log.tanggal}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {log.waktu}
                    </span>
                  </div>
                </div>

                <p className={`text-xs mb-2 ${isDark ? "text-gray-300" : "text-slate-700"}`}>{log.keterangan}</p>

                <div className="flex items-center justify-between text-[10px] text-gray-400 pt-2 border-t border-gray-700/20">
                  <span>
                    Oleh: <strong className={isDark ? "text-gray-200" : "text-slate-800"}>{log.aktor}</strong> ({log.jabatan})
                  </span>
                  <span className="font-mono text-emerald-400">LOG-VERIFIED ✓</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
