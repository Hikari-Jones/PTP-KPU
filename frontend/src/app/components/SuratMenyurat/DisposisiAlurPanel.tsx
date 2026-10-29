import React, { useState } from "react"
import {
  UserCheck,
  CheckCircle2,
  Building,
  Send,
} from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Badge } from "../ui/badge"
import type { SuratItem, DisposisiFormState } from "./types"

interface DisposisiAlurPanelProps {
  theme: "light" | "dark"
  surat: SuratItem
  onSaveDisposisi: (suratId: string, disposisiData: DisposisiFormState) => void
  onUpdateStatus: (suratId: string, status: SuratItem["status"], keterangan: string) => void
}

export function DisposisiAlurPanel({ theme, surat, onSaveDisposisi, onUpdateStatus }: DisposisiAlurPanelProps) {
  const isDark = theme === "dark"

  const [tujuanUnit, setTujuanUnit] = useState(surat.disposisi?.tujuanUnit || "RENDATIN (Perencanaan, Data dan Informasi)")
  const [catatan, setCatatan] = useState(surat.disposisi?.catatan || "")
  const [prioritas, setPrioritas] = useState<DisposisiFormState["prioritas"]>(
    (surat.disposisi?.prioritas as any) || "penting"
  )
  const [tenggatWaktu, setTenggatWaktu] = useState(
    surat.disposisi?.tenggatWaktu || new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]
  )

  const handleFormDisposisi = (e: React.FormEvent) => {
    e.preventDefault()
    if (!catatan.trim()) {
      alert("Mohon isi catatan instruksi disposisi!")
      return
    }
    onSaveDisposisi(surat.id, {
      tujuanUnit,
      catatan,
      prioritas,
      tenggatWaktu,
    })
  }

  return (
    <div className="space-y-6">
      {/* Visual Workflow Steps (Alur Surat Masuk) */}
      <div className={`p-4 rounded-2xl border ${isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}`}>
        <h4 className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 mb-3">
          Alur Pemrosesan Surat Masuk & Disposisi
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Step 1 */}
          <div
            className={`p-3 rounded-xl border flex items-start gap-3 ${surat.status === "registrasi" || surat.status === "menunggu_disposisi" || surat.status === "dalam_proses" || surat.status === "selesai_disposisi"
                ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
                : "opacity-50 border-gray-700"
              }`}
          >
            <div className="p-2 rounded-lg bg-red-500/20 font-bold text-xs shrink-0">1</div>
            <div>
              <p className="text-xs font-bold">1. Registrasi Surat Masuk</p>
              <p className="text-[10px] opacity-80">Nomor & file PDF terdaftar</p>
            </div>
          </div>

          {/* Step 2 */}
          <div
            className={`p-3 rounded-xl border flex items-start gap-3 ${surat.disposisi
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                : isDark
                  ? "bg-[#131d30] border-[#1e293b] text-gray-400"
                  : "bg-slate-50 border-slate-200 text-slate-500"
              }`}
          >
            <div className="p-2 rounded-lg bg-amber-500/20 font-bold text-xs shrink-0">2</div>
            <div>
              <p className="text-xs font-bold">2. Perekaman Disposisi Pimpinan</p>
              <p className="text-[10px] opacity-80">
                {surat.disposisi ? `Ke ${surat.disposisi.tujuanUnit}` : "Menunggu pengisian instruksi"}
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div
            className={`p-3 rounded-xl border flex items-start gap-3 ${surat.status === "selesai_disposisi"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : surat.status === "dalam_proses"
                  ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400 animate-pulse"
                  : isDark
                    ? "bg-[#131d30] border-[#1e293b] text-gray-400"
                    : "bg-slate-50 border-slate-200 text-slate-500"
              }`}
          >
            <div className="p-2 rounded-lg bg-emerald-500/20 font-bold text-xs shrink-0">3</div>
            <div>
              <p className="text-xs font-bold">3. Verifikasi & Tindak Lanjut Unit</p>
              <p className="text-[10px] opacity-80">
                {surat.status === "selesai_disposisi" ? "Tindak Lanjut Selesai" : "Proses Penyelesaian Terkait"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form Perekaman Disposisi Pimpinan */}
      <Card className={isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}>
        <div className={`p-4 border-b flex items-center justify-between ${isDark ? "border-[#1e293b]" : "border-slate-200"}`}>
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-red-500" />
            <h3 className="text-sm font-bold">Form Perekaman Disposisi (Ketua / Sekretaris KPU)</h3>
          </div>
          {surat.disposisi && <Badge variant="success">Sudah Didisposisikan</Badge>}
        </div>

        <CardContent className="p-5">
          <form onSubmit={handleFormDisposisi} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Unit Tujuan */}
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Disposisikan Ke Unit / Subbagian <span className="text-red-500">*</span>
                </label>
                <select
                  value={tujuanUnit}
                  onChange={(e) => setTujuanUnit(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-none cursor-pointer ${isDark ? "bg-[#131d30] border-[#1e293b] text-white focus:border-red-500" : "bg-slate-50 border-slate-200 focus:border-red-500"
                    }`}
                >
                  <option value="RENDATIN (Perencanaan, Data dan Informasi)">RENDATIN (Perencanaan, Data dan Informasi)</option>
                  <option value="UMLOG (Umum dan Logistik)">UMLOG (Umum dan Logistik)</option>
                  <option value="Teknis Penyelenggaraan Pemilu">Teknis Penyelenggaraan Pemilu</option>
                  <option value="Hukum">Hukum</option>
                  <option value="SDM (Partisipasi Hubungan Masyarakat dan Sumber Daya Manusia)">SDM (Partisipasi Hubungan Masyarakat dan Sumber Daya Manusia)</option>
                  <option value="Kelompok Jabatan Fungsional (JFT)">Kelompok Jabatan Fungsional (JFT)</option>
                </select>
              </div>

              {/* Tenggat Waktu */}
              <div>
                <label className="block text-xs font-semibold mb-1">Tenggat Waktu Penyelesaian (Batas Akhir)</label>
                <input
                  type="date"
                  value={tenggatWaktu}
                  onChange={(e) => setTenggatWaktu(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${isDark ? "bg-[#131d30] border-[#1e293b] text-white focus:border-red-500" : "bg-slate-50 border-slate-200 focus:border-red-500"
                    }`}
                />
              </div>
            </div>

            {/* Prioritas Disposisi */}
            <div>
              <label className="block text-xs font-semibold mb-1">Prioritas Tindak Lanjut</label>
              <div className="flex gap-3">
                {[
                  { id: "biasa", label: "Biasa (Standar)" },
                  { id: "penting", label: "Penting (Segera)" },
                  { id: "sangat_penting", label: "Sangat Penting (Kilat/Hari Ini)" },
                ].map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setPrioritas(p.id as any)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-xl border cursor-pointer transition-all ${prioritas === p.id
                        ? "bg-red-600 text-white border-red-600 shadow-sm"
                        : isDark
                          ? "bg-[#131d30] border-[#1e293b] text-gray-400 hover:text-white"
                          : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                      }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Catatan Disposisi */}
            <div>
              <label className="block text-xs font-semibold mb-1">
                Catatan Instruksi Disposisi Pimpinan <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                placeholder="Tuliskan petunjuk penanganan, tindak lanjut, atau koordinasi yang diperlukan..."
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${isDark ? "bg-[#131d30] border-[#1e293b] text-white focus:border-red-500" : "bg-slate-50 border-slate-200 focus:border-red-500"
                  }`}
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              {surat.disposisi && (
                <div className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Didisposisikan oleh {surat.disposisi.disposisiOleh} ({surat.disposisi.tanggalDisposisi})
                  </span>
                </div>
              )}
              <button
                type="submit"
                className="ml-auto btn-kpu-red px-4 py-2 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Send className="w-4 h-4" />
                <span>Simpan Lembar Disposisi</span>
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Kirim Nota Dinas Lanjutan Modal / Prompt */}
      <div className={`p-4 rounded-2xl border flex items-center justify-between ${isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-red-600/10 text-red-600 dark:text-red-400">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold">Lanjutkan dengan Nota Dinas Internal</h4>
            <p className={`text-[11px] font-medium ${isDark ? "text-gray-400" : "text-slate-600"}`}>
              Jika disposisi membutuhkan nota dinas balasan dari subbagian teknis.
            </p>
          </div>
        </div>
        <button
          onClick={() => alert("Membuka form Nota Dinas internal otomatis terhubung dengan surat ini...")}
          className="btn-kpu-red px-3.5 py-2 text-white text-xs font-bold rounded-xl cursor-pointer transition-all active:scale-95"
        >
          + Buat Nota Dinas
        </button>
      </div>

      {/* Verifikasi & Status Tindak Lanjut oleh Subbag Tujuan */}
      <Card className={isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}>
        <div className={`p-4 border-b flex items-center justify-between ${isDark ? "border-[#1e293b]" : "border-slate-200"}`}>
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Building className="w-4 h-4 text-red-500" />
            <span>Verifikasi & Updates Status Tindak Lanjut Unit Target</span>
          </h3>
        </div>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium">Ubah Status Tindak Lanjut Surat Masuk Ini:</p>
            <p className={`text-[11px] ${isDark ? "text-gray-400" : "text-slate-500"}`}>
              Status saat ini: <strong className="text-red-500 uppercase">{surat.status.replace("_", " ")}</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                onUpdateStatus(surat.id, "dalam_proses", "Unit pelaksana memulai tindak lanjut penyusunan tanggapan.")
              }
              className="btn-kpu-red px-3.5 py-2 text-white text-xs font-bold rounded-xl cursor-pointer transition-all active:scale-95"
            >
              Set Status: Dalam Proses
            </button>
            <button
              onClick={() =>
                onUpdateStatus(surat.id, "selesai_disposisi", "Instruksi disposisi pimpinan telah selesai ditindaklanjuti secara penuh.")
              }
              className="px-3 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-950 hover:bg-slate-800 text-xs font-semibold rounded-xl cursor-pointer transition-all"
            >
              Set Status: Selesai Disposisi
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
