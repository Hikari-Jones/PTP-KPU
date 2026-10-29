import React, { useState } from "react"
import { X, Upload, AlertCircle, FileText, Save, Send } from "lucide-react"
import type { AkunAnggaran, TransaksiRealisasi } from "./types"
import { Card, CardContent } from "../ui/card"
import { Button } from "../ui/button"
import { Input } from "../ui/input"

interface Props {
  isOpen: boolean
  onClose: () => void
  akunList: AkunAnggaran[]
  onSave: (transaksi: Omit<TransaksiRealisasi, "id">, status: "Draft" | "Menunggu Verifikasi") => void
  theme: "light" | "dark"
}

export function TambahRealisasiModal({ isOpen, onClose, akunList, onSave, theme }: Props) {
  const isDark = theme === "dark"

  const [tanggal, setTanggal] = useState(new Date().toISOString().split("T")[0])
  const [noDokumen, setNoDokumen] = useState(`SPD-KPU/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`)
  const [selectedKodeAkun, setSelectedKodeAkun] = useState(akunList[0]?.kode || "")
  const [subbagian, setSubbagian] = useState("Teknis Penyelenggaraan Pemilu")
  const [periode, setPeriode] = useState("Agustus 2026")
  const [usulanKegiatan, setUsulanKegiatan] = useState("")
  const [jumlahStr, setJumlahStr] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!isOpen) return null

  const selectedAkun = akunList.find((a) => a.kode === selectedKodeAkun)
  const jumlah = parseFloat(jumlahStr) || 0

  const isOverBudget = selectedAkun ? jumlah > selectedAkun.sisa : false

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFileName(e.target.files[0].name)
    }
  }

  const validateForm = (): boolean => {
    if (!tanggal || !noDokumen || !selectedKodeAkun || !usulanKegiatan.trim() || jumlah <= 0) {
      setErrorMessage("Mohon lengkapi seluruh kolom formulir transaksi yang wajib diisi.")
      return false
    }
    if (isOverBudget) {
      setErrorMessage("Jumlah realisasi melebihi sisa anggaran akun terpilih. Transaksi tidak dapat diproses.")
      return false
    }
    setErrorMessage(null)
    return true
  }

  const handleSimpanDraft = () => {
    setErrorMessage(null)
    if (!usulanKegiatan.trim() || jumlah <= 0) {
      setErrorMessage("Mohon isi usulan kegiatan dan jumlah realisasi sebelum menyimpan draft.")
      return
    }
    if (isOverBudget) {
      setErrorMessage("Jumlah melebihi sisa anggaran akun!")
      return
    }

    onSave(
      {
        tanggal,
        noDokumen,
        kodeAkun: selectedKodeAkun,
        namaAkun: selectedAkun?.nama || "",
        subbagian,
        usulanKegiatan,
        jumlah,
        buktiFile: fileName || "Bukti_Transaksi_Draft.pdf",
        status: "Draft",
        periode,
      },
      "Draft"
    )
    onClose()
  }

  const handleKirimVerifikasi = () => {
    if (!validateForm()) return

    onSave(
      {
        tanggal,
        noDokumen,
        kodeAkun: selectedKodeAkun,
        namaAkun: selectedAkun?.nama || "",
        subbagian,
        usulanKegiatan,
        jumlah,
        buktiFile: fileName || "Bukti_Transaksi_Verified.pdf",
        status: "Menunggu Verifikasi",
        periode,
      },
      "Menunggu Verifikasi"
    )
    onClose()
  }

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${isDark ? "bg-[#0c1220] border-[#1e293b] text-gray-100" : "bg-white border-slate-200 text-slate-800"
          }`}
      >
        {/* Modal Header */}
        <div
          className={`p-4 border-b flex items-center justify-between ${isDark ? "border-[#1e293b] bg-[#11192b]" : "border-slate-200 bg-slate-50"
            }`}
        >
          <div>
            <h2 className={`text-base font-bold my-0 ${isDark ? "text-white" : "text-slate-900"}`}>
              Form Tambah Data Realisasi Anggaran
            </h2>
            <p className={`text-[11px] ${isDark ? "text-gray-400" : "text-slate-500"}`}>
              Input usulan belanja operasional dan lampiran dokumen bukti transaksi
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isDark ? "hover:bg-[#1e293b] text-gray-400" : "hover:bg-slate-200 text-slate-500"
              }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Toast / Error Alert */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-500 font-semibold flex items-center gap-2 animate-in zoom-in-95">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-semibold block">Tanggal Transaksi</label>
              <Input
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className={`text-xs ${isDark ? "bg-[#131b2e] border-[#1e293b]" : "bg-slate-50 border-slate-300"}`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold block">Nomor Dokumen / SPD</label>
              <Input
                type="text"
                value={noDokumen}
                onChange={(e) => setNoDokumen(e.target.value)}
                className={`text-xs ${isDark ? "bg-[#131b2e] border-[#1e293b]" : "bg-slate-50 border-slate-300"}`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold block">Subbagian Pengaju</label>
              <select
                value={subbagian}
                onChange={(e) => setSubbagian(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 border text-xs ${isDark ? "bg-[#131b2e] border-[#1e293b] text-gray-200" : "bg-slate-50 border-slate-300 text-slate-800"
                  }`}
              >
                <option value="Keuangan">Keuangan</option>
                <option value="Teknis Penyelenggaraan Pemilu">Teknis Penyelenggaraan Pemilu</option>
                <option value="SDM (Partisipasi Hubungan Masyarakat dan Sumber Daya Manusia)">SDM (Partisipasi Hubungan Masyarakat dan Sumber Daya Manusia)</option>
                <option value="RENDATIN (Perencanaan, Data dan Informasi)">RENDATIN (Perencanaan, Data dan Informasi)</option>
                <option value="Hukum">Hukum</option>
                <option value="UMLOG (Umum dan Logistik)">UMLOG (Umum dan Logistik)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold block">Periode Anggaran</label>
              <select
                value={periode}
                onChange={(e) => setPeriode(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 border text-xs ${isDark ? "bg-[#131b2e] border-[#1e293b] text-gray-200" : "bg-slate-50 border-slate-300 text-slate-800"
                  }`}
              >
                <option value="Agustus 2026">Agustus 2026</option>
                <option value="Juli 2026">Juli 2026</option>
                <option value="Q2 2026">Q2 2026</option>
                <option value="Q1 2026">Q1 2026</option>
              </select>
            </div>
          </div>

          {/* Account Selection */}
          <div className="space-y-1.5">
            <label className="font-semibold block">Pilih Akun Anggaran</label>
            <select
              value={selectedKodeAkun}
              onChange={(e) => setSelectedKodeAkun(e.target.value)}
              className={`w-full rounded-lg px-3 py-2 border text-xs font-mono ${isDark ? "bg-[#131b2e] border-[#1e293b] text-gray-200" : "bg-slate-50 border-slate-300 text-slate-800"
                }`}
            >
              {akunList.map((akun) => (
                <option key={akun.kode} value={akun.kode}>
                  {akun.kode} - {akun.nama}
                </option>
              ))}
            </select>
          </div>

          {/* Dynamic Budget Info Card */}
          {selectedAkun && (
            <Card className={`p-3 border ${isDark ? "bg-[#11192b] border-red-600/30" : "bg-red-50/50 border-red-200"}`}>
              <CardContent className="p-0 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] uppercase font-black text-red-600 dark:text-red-400 block">Informasi Pagu Akun:</span>
                  <p className={`font-bold ${isDark ? "text-white" : "text-black"}`}>{selectedAkun.nama}</p>
                </div>
                <div className="text-right">
                  <span className={`text-[10px] font-medium block ${isDark ? "text-gray-300" : "text-slate-700"}`}>Total Pagu: {formatRupiah(selectedAkun.pagu)}</span>
                  <span className={`font-black text-red-600 dark:text-red-400`}>
                    Sisa Anggaran: {formatRupiah(selectedAkun.sisa)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Usulan Kegiatan & Jumlah Realisasi */}
          <div className="space-y-1.5">
            <label className={`font-bold block ${isDark ? "text-white" : "text-black"}`}>Usulan Kegiatan / Keterangan Belanja</label>
            <Input
              type="text"
              placeholder="Contoh: Pengadaan Alat Tulis Rapat Pleno Rekapitulasi"
              value={usulanKegiatan}
              onChange={(e) => setUsulanKegiatan(e.target.value)}
              className={`text-xs font-semibold ${isDark ? "bg-[#131b2e] border-[#1e293b] text-white placeholder-gray-400" : "bg-slate-50 border-slate-300 text-black placeholder-slate-500"}`}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className={`font-bold block ${isDark ? "text-white" : "text-black"}`}>Jumlah Realisasi (Rp)</label>
              {isOverBudget && (
                <span className="text-[10px] font-extrabold text-white bg-red-600 px-2 py-0.5 rounded shadow-xs animate-pulse">
                  ⚠️ Peringatan: Jumlah Melebihi Anggaran!
                </span>
              )}
            </div>
            <Input
              type="number"
              placeholder="0"
              value={jumlahStr}
              onChange={(e) => setJumlahStr(e.target.value)}
              className={`text-xs font-mono font-bold ${isOverBudget
                  ? "border-red-600 text-red-600 bg-red-600/10 focus:border-red-600"
                  : isDark
                    ? "bg-[#131b2e] border-[#1e293b] text-white"
                    : "bg-slate-50 border-slate-300 text-black"
                }`}
            />
          </div>

          {/* Melampirkan Bukti Transaksi */}
          <div className="space-y-1.5">
            <label className={`font-bold block ${isDark ? "text-white" : "text-black"}`}>Melampirkan Bukti Transaksi (Image / PDF)</label>
            <div
              className={`p-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${fileName
                  ? "border-red-600 bg-red-600/10 text-red-600 dark:text-red-400 font-bold"
                  : isDark
                    ? "border-[#1e293b] bg-[#11192b] hover:border-red-600/50"
                    : "border-slate-300 bg-slate-50 hover:border-red-600/50"
                }`}
            >
              <input type="file" onChange={handleFileChange} accept="image/*,.pdf" className="hidden" id="bukti-file-input" />
              <label htmlFor="bukti-file-input" className="cursor-pointer flex flex-col items-center gap-1 w-full">
                {fileName ? (
                  <>
                    <FileText className="w-6 h-6 text-red-600 dark:text-red-400" />
                    <span className="font-bold text-xs text-red-600 dark:text-red-400">{fileName}</span>
                    <span className={`text-[10px] ${isDark ? "text-gray-300" : "text-slate-600"}`}>Klik untuk mengganti berkas</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-red-600" />
                    <span className={`font-bold text-xs ${isDark ? "text-white" : "text-black"}`}>Pilih File Bukti Transaksi</span>
                    <span className={`text-[10px] ${isDark ? "text-gray-400" : "text-slate-600"}`}>Format: JPG, PNG, PDF (Maks. 10MB)</span>
                  </>
                )}
              </label>
            </div>
          </div>
        </div>

        {/* Modal Footer (Action Buttons) */}
        <div
          className={`p-4 border-t flex items-center justify-between shrink-0 ${isDark ? "border-[#1e293b] bg-[#090e1a]" : "border-slate-200 bg-slate-50"
            }`}
        >
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-all ${isDark ? "border-[#1e293b] bg-[#131b2e] text-white hover:bg-[#1e293b]" : "border-slate-300 bg-white text-black hover:bg-slate-100"
              }`}
          >
            Batal
          </button>

          <div className="flex items-center gap-2">
            {/* Simpan Draft */}
            <Button
              type="button"
              onClick={handleSimpanDraft}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border cursor-pointer transition-all active:scale-95 ${isDark
                  ? "bg-slate-900 border-slate-700 text-white hover:bg-slate-800"
                  : "bg-slate-100 border-slate-300 text-black hover:bg-slate-200"
                }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>Simpan Draft</span>
            </Button>

            {/* Kirim untuk Verifikasi */}
            <Button
              type="button"
              disabled={isOverBudget}
              onClick={handleKirimVerifikasi}
              className="btn-kpu-red px-5 py-2.5 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Kirim untuk Verifikasi</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
