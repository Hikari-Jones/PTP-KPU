import { useEffect, useState } from "react"
import { BookOpen, Download, ExternalLink, FileText, X } from "lucide-react"
import type { SuratItem } from "./types"

interface SuratDokumenViewerProps {
  theme: "light" | "dark"
  surat: SuratItem
}

const PRIORITAS_LABEL: Record<SuratItem["prioritas"], string> = {
  biasa: "Biasa",
  penting: "Penting",
  sangat_penting: "Sangat Segera",
  rahasia: "Rahasia",
}

function formatTanggal(tanggal: string) {
  const date = new Date(tanggal)
  if (Number.isNaN(date.getTime())) return tanggal
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
}

function fileKind(surat: SuratItem): "pdf" | "image" | "other" | "none" {
  if (!surat.fileUrl) return "none"
  const name = (surat.fileName || "").toLowerCase()
  if (name.endsWith(".pdf")) return "pdf"
  if (/\.(png|jpe?g|gif|webp)$/.test(name)) return "image"
  return "other"
}

/** Naskah surat yang dirender dari data surat, dipakai bila berkas asli belum tersedia di sistem. */
function NaskahSurat({ surat }: { surat: SuratItem }) {
  return (
    <div className="mx-auto w-full max-w-[720px] bg-white text-slate-900 shadow-lg border border-slate-300 px-6 py-8 sm:px-12 sm:py-10 font-serif text-[13px] leading-relaxed">
      <div className="text-center border-b-[3px] border-double border-slate-900 pb-3 mb-6">
        <p className="font-bold uppercase tracking-wide text-sm">
          {surat.jenis === "masuk" ? surat.pengirim : "Komisi Pemilihan Umum Provinsi Sulawesi Utara"}
        </p>
        {surat.jenis !== "masuk" && <p className="text-[11px]">Jl. Pomorow No. 30, Manado, Sulawesi Utara</p>}
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 mb-6">
        <table className="text-[13px]">
          <tbody>
            <tr><td className="pr-3 align-top">Nomor</td><td className="pr-2 align-top">:</td><td>{surat.nomorSurat}</td></tr>
            <tr><td className="pr-3 align-top">Sifat</td><td className="pr-2 align-top">:</td><td>{PRIORITAS_LABEL[surat.prioritas]}</td></tr>
            <tr><td className="pr-3 align-top">Lampiran</td><td className="pr-2 align-top">:</td><td>-</td></tr>
            <tr><td className="pr-3 align-top">Perihal</td><td className="pr-2 align-top">:</td><td className="font-semibold">{surat.perihal}</td></tr>
          </tbody>
        </table>
        <p className="shrink-0">Manado, {formatTanggal(surat.tanggal)}</p>
      </div>

      <div className="mb-6">
        <p>Yth.</p>
        <p className="font-semibold">{surat.penerima}</p>
        <p>di Tempat</p>
      </div>

      <p className="whitespace-pre-line text-justify indent-10 mb-4">
        {surat.ringkasanIsi || "Isi surat belum dicatat pada sistem."}
      </p>
      <p className="text-justify indent-10 mb-10">
        Demikian disampaikan, atas perhatian dan kerja samanya diucapkan terima kasih.
      </p>

      <div className="ml-auto w-fit text-center">
        <p>{surat.jenis === "masuk" ? "Pengirim," : "Ketua KPU Provinsi Sulawesi Utara,"}</p>
        <div className="h-16" />
        <p className="font-semibold underline">
          {surat.tteInfo?.penandatangan || (surat.jenis === "masuk" ? surat.pengirim : "........................")}
        </p>
      </div>
    </div>
  )
}

export function SuratDokumenViewer({ theme, surat }: SuratDokumenViewerProps) {
  const isDark = theme === "dark"
  const [isOpen, setIsOpen] = useState(false)
  const kind = fileKind(surat)

  useEffect(() => {
    if (!isOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [isOpen])

  const btnSecondary = `px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
    isDark ? "bg-[#131d30] border-[#1e293b] text-gray-200 hover:bg-[#1a2540]" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
  }`

  return (
    <>
      <div
        className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"
        }`}
      >
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-3 min-w-0 text-left cursor-pointer group"
        >
          <div className="p-2.5 rounded-xl bg-red-600 text-white shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase text-gray-400">Dokumen Surat</p>
            <p className={`text-xs font-bold truncate group-hover:underline ${isDark ? "text-white" : "text-slate-900"}`}>
              {surat.fileName || `${surat.nomorSurat}.pdf`}
            </p>
            <p className={`text-[11px] ${isDark ? "text-gray-400" : "text-slate-500"}`}>
              {surat.fileSize ? `${surat.fileSize} · ` : ""}
              {kind === "none" ? "Pratinjau naskah dari data surat" : "Berkas unggahan"}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {surat.fileUrl && (
            <a href={surat.fileUrl} download={surat.fileName} className={btnSecondary}>
              <Download className="w-4 h-4" />
              <span>Unduh</span>
            </a>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="btn-kpu-red px-4 py-2 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <BookOpen className="w-4 h-4" />
            <span>Baca Surat</span>
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Dokumen ${surat.perihal}`}>
          <div className="absolute inset-0" onClick={() => setIsOpen(false)} />
          <div
            className={`relative z-10 flex flex-col w-full max-w-5xl h-[92vh] rounded-2xl border shadow-2xl overflow-hidden ${
              isDark ? "bg-[#0d1322] border-[#1e293b] text-white" : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            <div className={`flex items-center justify-between gap-3 px-4 py-3 border-b ${isDark ? "border-[#1e293b]" : "border-slate-200"}`}>
              <div className="min-w-0">
                <p className="font-mono text-xs font-bold text-red-500 truncate">{surat.nomorSurat}</p>
                <p className="text-sm font-bold truncate">{surat.perihal}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {surat.fileUrl && (
                  <a href={surat.fileUrl} target="_blank" rel="noreferrer" className={btnSecondary}>
                    <ExternalLink className="w-4 h-4" />
                    <span className="hidden sm:inline">Buka di Tab Baru</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Tutup dokumen"
                  className={`p-2 rounded-lg cursor-pointer ${isDark ? "hover:bg-slate-800 text-gray-300" : "hover:bg-slate-100 text-slate-600"}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className={`flex-1 overflow-auto ${isDark ? "bg-[#070b14]" : "bg-slate-200"} ${kind === "pdf" ? "" : "p-3 sm:p-6"}`}>
              {kind === "pdf" && <iframe src={surat.fileUrl} title={surat.fileName} className="w-full h-full border-0" />}
              {kind === "image" && <img src={surat.fileUrl} alt={surat.fileName} className="mx-auto max-w-full shadow-lg" />}
              {kind === "other" && (
                <div className="space-y-4">
                  <p className={`text-xs text-center ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                    Format berkas ini tidak dapat ditampilkan langsung di browser. Gunakan tombol Unduh untuk membuka berkas asli.
                  </p>
                  <NaskahSurat surat={surat} />
                </div>
              )}
              {kind === "none" && <NaskahSurat surat={surat} />}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
