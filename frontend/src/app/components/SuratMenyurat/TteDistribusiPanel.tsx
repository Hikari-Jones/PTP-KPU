import React, { useState } from "react"
import {
  QrCode,
  ShieldCheck,
  Printer,
  Mail,
  Send,
  Download,
  KeyRound,
  Building,
  CheckCircle2,
} from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Badge } from "../ui/badge"
import type { SuratItem } from "./types"

interface TteDistribusiPanelProps {
  theme: "light" | "dark"
  surat: SuratItem
  onSignTte: (suratId: string, passphrase: string, penandatangan: string) => void
  onDistribusi: (suratId: string, metode: "email" | "cetak" | "internal") => void
}

export function TteDistribusiPanel({ theme, surat, onSignTte, onDistribusi }: TteDistribusiPanelProps) {
  const isDark = theme === "dark"

  const [passphrase, setPassphrase] = useState("")
  const [penandatangan, setPenandatangan] = useState("Drs. Meidy Tinangon, M.Si (Ketua KPU)")
  const [isSigning, setIsSigning] = useState(false)
  const [signedSuccess, setSignedSuccess] = useState(!!surat.tteInfo)

  const handleSignSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!passphrase.trim()) {
      alert("Mohon masukkan Passphrase TTE BSrE / KPU Anda!")
      return
    }
    setIsSigning(true)
    setTimeout(() => {
      onSignTte(surat.id, passphrase, penandatangan)
      setIsSigning(false)
      setSignedSuccess(true)
    }, 1000)
  }

  const handleDownloadPDF = () => {
    const pdfContent = `
================================================================
KPU PROVINSI SULAWESI UTARA
SISTEM INFORMASI PERSURATAN DIGITAL (PTP-KPU)
================================================================
Nomor Surat : ${surat.nomorSurat}
Tanggal     : ${surat.tanggal}
Perihal     : ${surat.perihal}
Pengirim    : ${surat.pengirim}
Penerima    : ${surat.penerima}

RINGKASAN SUBSTANSI SURAT:
${surat.ringkasanIsi || "Dokumen resmi persuratan elektronik KPU Provinsi Sulawesi Utara."}

----------------------------------------------------------------
STATUS OTORISASI TANDA TANGAN DIGITAL (TTE BSrE KPU)
----------------------------------------------------------------
Penandatangan : ${surat.tteInfo?.penandatangan || penandatangan}
Jabatan       : Ketua KPU Provinsi Sulawesi Utara
Tanggal TTE   : ${surat.tteInfo?.tanggalTte || new Date().toLocaleString()}
Status BSrE   : VERIFIED & VALIDATED ELECTRONIC SIGNATURE
QR Hash Code  : ${surat.tteInfo?.barcodeData || "KPU-SULUT-TTE-SECURE-HASH-2026-X99"}
================================================================
`
    const blob = new Blob([pdfContent], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${surat.nomorSurat.replace(/\//g, "_")}_SIGNED.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Workflow Header Banner */}
      <div className={`p-4 rounded-2xl border ${isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}`}>
        <h4 className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 mb-3">
          Alur Tanda Tangan Digital (TTE) & Distribusi Berkas
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Step 1 */}
          <div
            className={`p-3 rounded-xl border flex items-start gap-3 ${surat.tteInfo || signedSuccess
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400 animate-pulse"
              }`}
          >
            <div className="p-2 rounded-lg bg-red-500/20 font-bold text-xs shrink-0">1</div>
            <div>
              <p className="text-xs font-bold">1. Passphrase & Otorisasi TTE</p>
              <p className="text-[10px] opacity-80">
                {surat.tteInfo || signedSuccess ? "TTE Berhasil Dibubuhkan" : "Masuk Passphrase Pejabat"}
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div
            className={`p-3 rounded-xl border flex items-start gap-3 ${surat.tteInfo || signedSuccess
                ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
                : isDark
                  ? "bg-[#131d30] border-[#1e293b] text-gray-400"
                  : "bg-slate-50 border-slate-200 text-slate-500"
              }`}
          >
            <div className="p-2 rounded-lg bg-red-500/20 font-bold text-xs shrink-0">2</div>
            <div>
              <p className="text-xs font-bold">2. Generate Final PDF + Barcode</p>
              <p className="text-[10px] opacity-80">Nomor registrasi & QR tersemat</p>
            </div>
          </div>

          {/* Step 3 */}
          <div
            className={`p-3 rounded-xl border flex items-start gap-3 ${surat.status === "terkirim_terarsip"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : isDark
                  ? "bg-[#131d30] border-[#1e293b] text-gray-400"
                  : "bg-slate-50 border-slate-200 text-slate-500"
              }`}
          >
            <div className="p-2 rounded-lg bg-emerald-500/20 font-bold text-xs shrink-0">3</div>
            <div>
              <p className="text-xs font-bold">3. Pengiriman & Arsip Otomatis</p>
              <p className="text-[10px] opacity-80">Email / Cetak & Bukti Kirim</p>
            </div>
          </div>
        </div>
      </div>

      {/* Box 1: Otorisasi TTE Digital */}
      <Card className={isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}>
        <div className={`p-4 border-b flex items-center justify-between ${isDark ? "border-[#1e293b]" : "border-slate-200"}`}>
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-red-500" />
            <h3 className="text-sm font-bold">Otorisasi Tanda Tangan Elektronik (TTE BSrE BSSN)</h3>
          </div>
          {surat.tteInfo && <Badge variant="success">Terverifikasi BSrE</Badge>}
        </div>

        <CardContent className="p-5">
          {!surat.tteInfo && !signedSuccess ? (
            <form onSubmit={handleSignSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Pejabat Penandatangan</label>
                  <select
                    value={penandatangan}
                    onChange={(e) => setPenandatangan(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border outline-none cursor-pointer ${isDark ? "bg-[#131d30] border-[#1e293b] text-white" : "bg-slate-50 border-slate-200"
                      }`}
                  >
                    <option value="Drs. Meidy Tinangon, M.Si (Ketua KPU)">Drs. Meidy Tinangon, M.Si (Ketua KPU)</option>
                    <option value="Dr. Salman S., M.Si (Sekretaris KPU)">Dr. Salman S., M.Si (Sekretaris KPU)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">
                    Passphrase Keamanan TTE (Pin BSrE) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Masukkan Passphrase PIN TTE..."
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-mono ${isDark ? "bg-[#131d30] border-[#1e293b] focus:border-red-500" : "bg-slate-50 border-slate-200 focus:border-red-500"
                      }`}
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 shrink-0 text-red-500" />
                <span>
                  Sistem terhubung secara real-time ke Certification Authority (CA) Balai Sertifikasi Elektronik (BSrE) BSSN.
                </span>
              </div>

              <button
                type="submit"
                disabled={isSigning}
                className="w-full py-2.5 btn-kpu-red text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98"
              >
                {isSigning ? (
                  <span>Proses Verifikasi Enkripsi Hash BSrE...</span>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Bubuhkan Tanda Tangan Digital (TTE) Sekarang</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Certificate Details preview */
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400">
                    <QrCode className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold">Tanda Tangan Digital (TTE) Keabsahan Sah</h4>
                    <p className="text-xs opacity-90">Sertifikat BSrE BSSN Indonesia Active & Valid</p>
                    <p className="text-[10px] font-mono opacity-75 mt-1">
                      Hash Code: {surat.tteInfo?.barcodeData || "KPU-SULUT-TTE-2026-SECURE-9921"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleDownloadPDF}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-2 cursor-pointer shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>Generate & Unduh Final PDF</span>
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Box 2: Pengiriman & Distribusi */}
      <Card className={isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}>
        <div className={`p-4 border-b flex items-center justify-between ${isDark ? "border-[#1e293b]" : "border-slate-200"}`}>
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-red-500" />
            <h3 className="text-sm font-bold">Pengiriman & Distribusi Surat</h3>
          </div>
          {surat.pengiriman && <Badge variant="terkirim">Surat Terkirim & Terarsip</Badge>}
        </div>

        <CardContent className="p-5 space-y-4">
          <p className={`text-xs ${isDark ? "text-gray-400" : "text-slate-600"}`}>
            Pilih kanal distribusi surat resmi. Setelah pengiriman berhasil, status surat otomatis diperbarui menjadi{" "}
            <strong className="text-emerald-500">"Surat Terkirim & Terarsip"</strong>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => onDistribusi(surat.id, "email")}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-2 ${surat.pengiriman?.metode === "email"
                  ? "bg-red-600 text-white border-red-600"
                  : isDark
                    ? "bg-[#131d30] border-[#1e293b] hover:border-red-500"
                    : "bg-slate-50 border-slate-200 hover:border-red-500"
                }`}
            >
              <Mail className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-xs font-bold">Email Otomatis</p>
                <p className="text-[10px] opacity-80">Kirim attachment PDF via server SMTP KPU</p>
              </div>
            </button>

            <button
              onClick={() => onDistribusi(surat.id, "cetak")}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-2 ${surat.pengiriman?.metode === "cetak"
                  ? "bg-red-600 text-white border-red-600"
                  : isDark
                    ? "bg-[#131d30] border-[#1e293b] hover:border-red-500"
                    : "bg-slate-50 border-slate-200 hover:border-red-500"
                }`}
            >
              <Printer className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              <div>
                <p className="text-xs font-bold">Cetak Fisik / Kurir</p>
                <p className="text-[10px] opacity-80">Cetak lembar tanda terima kurir expedisi</p>
              </div>
            </button>

            <button
              onClick={() => onDistribusi(surat.id, "internal")}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-2 ${surat.pengiriman?.metode === "internal"
                  ? "bg-red-600 text-white border-red-600"
                  : isDark
                    ? "bg-[#131d30] border-[#1e293b] hover:border-red-500"
                    : "bg-slate-50 border-slate-200 hover:border-red-500"
                }`}
            >
              <Building className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              <div>
                <p className="text-xs font-bold">Kirim Internal PTP</p>
                <p className="text-[10px] opacity-80">Notifikasi dashboard unit/subbag internal</p>
              </div>
            </button>
          </div>

          {surat.pengiriman && (
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Bukti Resi Pengiriman & Terarsip Digital</span>
              </div>
              <p className="font-mono text-[11px]">Metode: {surat.pengiriman.metode.toUpperCase()}</p>
              <p className="font-mono text-[11px]">Tanggal Kirim: {surat.pengiriman.tanggalKirim}</p>
              <p className="font-mono text-[11px]">Resi / Reference ID: {surat.pengiriman.nomorResiAtauBukti}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
