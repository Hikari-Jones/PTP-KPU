import React, { useState } from "react"
import {
  FileEdit,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Badge } from "../ui/badge"
import type { SuratItem } from "./types"

interface VerifikasiDraftPanelProps {
  theme: "light" | "dark"
  surat: SuratItem
  onApproveDraft: (suratId: string, nomorOtomatis: string) => void
  onRejectRevisiDraft: (suratId: string, catatanRevisi: string) => void
}

export function VerifikasiDraftPanel({
  theme,
  surat,
  onApproveDraft,
  onRejectRevisiDraft,
}: VerifikasiDraftPanelProps) {
  const isDark = theme === "dark"

  const [catatanRevisi, setCatatanRevisi] = useState(surat.catatanRevisi || "")
  const [isRevisiMode, setIsRevisiMode] = useState(false)

  // Auto-generate surat registration number helper
  const generateAutoNomor = () => {
    const randomSeq = Math.floor(Math.random() * 899) + 100
    const romanMonths = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]
    const currentMonthRoman = romanMonths[new Date().getMonth()]
    return `${randomSeq}/KPU-PROV/${currentMonthRoman}/2026`
  }

  const handleApprove = () => {
    const nomorOtomatis = generateAutoNomor()
    onApproveDraft(surat.id, nomorOtomatis)
  }

  const handleRejectSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!catatanRevisi.trim()) {
      alert("Mohon sertakan alasan/catatan revisi untuk konseptor!")
      return
    }
    onRejectRevisiDraft(surat.id, catatanRevisi)
    setIsRevisiMode(false)
  }

  return (
    <div className="space-y-6">
      {/* Workflow Visual Banner */}
      <div className={`p-4 rounded-2xl border ${isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}`}>
        <h4 className="text-xs font-bold uppercase tracking-wider text-red-400 mb-3">
          Alur Pemrosesan Surat Keluar & Approval Draft
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Step 1 */}
          <div className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20 font-bold text-xs shrink-0">1</div>
            <div>
              <p className="text-xs font-bold">1. Konsep Draft Dibuat</p>
              <p className="text-[10px] opacity-80">Oleh staf konseptor unit</p>
            </div>
          </div>

          {/* Step 2 */}
          <div
            className={`p-3 rounded-xl border flex items-start gap-3 ${surat.status === "draft" || surat.status === "revisi"
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse"
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              }`}
          >
            <div className="p-2 rounded-lg bg-amber-500/20 font-bold text-xs shrink-0">2</div>
            <div>
              <p className="text-xs font-bold">2. Decision Box (Verifikasi / Approval)</p>
              <p className="text-[10px] opacity-80">
                {surat.status === "revisi"
                  ? "Status: Perlu Revisi Konseptor"
                  : surat.status === "draft"
                    ? "Menunggu Keputusan Pejabat"
                    : "Draft Disetujui"}
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div
            className={`p-3 rounded-xl border flex items-start gap-3 ${surat.status === "menunggu_tte" || surat.status === "terkirim_terarsip"
                ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
                : isDark
                  ? "bg-[#131d30] border-[#1e293b] text-gray-400"
                  : "bg-slate-50 border-slate-200 text-slate-500"
              }`}
          >
            <div className="p-2 rounded-lg bg-red-500/20 font-bold text-xs shrink-0">3</div>
            <div>
              <p className="text-xs font-bold">3. Penomoran Otomatis & TTE</p>
              <p className="text-[10px] opacity-80">Siap untuk pengesahan digital</p>
            </div>
          </div>
        </div>
      </div>

      {/* Draft Review Card */}
      <Card className={isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}>
        <div className={`p-4 border-b flex items-center justify-between ${isDark ? "border-[#1e293b]" : "border-slate-200"}`}>
          <div className="flex items-center gap-2">
            <FileEdit className="w-5 h-5 text-red-500" />
            <h3 className="text-sm font-bold">Substansi Draft Surat yang Diajukan</h3>
          </div>
          <div>{surat.status === "revisi" ? <Badge variant="default">Status: Perlu Revisi</Badge> : <Badge variant="warning">Draft Baru</Badge>}</div>
        </div>

        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-gray-400 font-mono text-[10px]">PENGIRIM / KONSEPTOR</p>
              <p className="font-semibold">{surat.pengirim}</p>
            </div>
            <div>
              <p className="text-gray-400 font-mono text-[10px]">TUJUAN / PENERIMA</p>
              <p className="font-semibold">{surat.penerima}</p>
            </div>
          </div>

          <div>
            <p className="text-gray-400 font-mono text-[10px]">PERIHAL</p>
            <p className="font-bold text-sm text-red-400">{surat.perihal}</p>
          </div>

          <div className={`p-4 rounded-xl border ${isDark ? "bg-[#131d30] border-[#1e293b]" : "bg-slate-50 border-slate-200"}`}>
            <p className="text-[10px] font-mono text-gray-400 uppercase mb-1">DRAF NARASI SURAT</p>
            <p className="text-xs leading-relaxed whitespace-pre-line">{surat.ringkasanIsi || "Tidak ada draf narasi tambahan."}</p>
          </div>

          {/* Warning box if revision requested */}
          {surat.catatanRevisi && (
            <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4" />
                <span>Catatan Revisi dari Pejabat Penyetuju:</span>
              </div>
              <p className="pl-5 italic">{surat.catatanRevisi}</p>
            </div>
          )}

          {/* Decision Box Actions */}
          <div className={`pt-4 border-t ${isDark ? "border-[#1e293b]" : "border-slate-200"}`}>
            <h4 className="text-xs font-bold mb-3 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Decision Box Approval Pejabat (Kabag / Sekretaris / Ketua)</span>
            </h4>

            {!isRevisiMode ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleApprove}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/30 flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Setujui Draft & Penomoran Otomatis</span>
                </button>
                <button
                  onClick={() => setIsRevisiMode(true)}
                  className="px-4 py-2.5 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Tolak / Perlu Revisi Konseptor</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleRejectSubmit} className="space-y-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                <p className="text-xs font-bold text-red-400">Kembalikan ke Konseptor dengan Catatan Revisi:</p>
                <textarea
                  rows={3}
                  required
                  placeholder="Tuliskan poin-poin yang perlu diperbaiki oleh konseptor..."
                  value={catatanRevisi}
                  onChange={(e) => setCatatanRevisi(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${isDark ? "bg-[#131d30] border-[#1e293b] text-white focus:border-red-500" : "bg-white border-slate-300 focus:border-red-500"
                    }`}
                />
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsRevisiMode(false)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-700 text-gray-300 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="btn-kpu-red px-4 py-2 text-xs font-bold rounded-xl text-white cursor-pointer active:scale-95"
                  >
                    Kirim Catatan Revisi
                  </button>
                </div>
              </form>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
