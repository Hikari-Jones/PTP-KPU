import React, { useState, useEffect } from "react"
import { X, Upload, AlertCircle, FileText, CheckCircle2, Loader2, Sparkles } from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import {
  paguAnggaranApi,
  realisasiAnggaranApi,
  tahunAnggaranApi,
  filesApi,
} from "../../../services/api"
import type { PaguAnggaranResponse, TahunAnggaranResponse, FileUploadResponse } from "./types"

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  theme: "light" | "dark"
}

export function TambahRealisasiModal({ isOpen, onClose, onSuccess, theme }: Props) {
  const isDark = theme === "dark"

  const [paguList, setPaguList] = useState<PaguAnggaranResponse[]>([])
  const [activeTahun, setActiveTahun] = useState<TahunAnggaranResponse | null>(null)
  const [selectedPaguId, setSelectedPaguId] = useState<number | null>(null)

  const [tanggal, setTanggal] = useState(new Date().toISOString().split("T")[0])
  const [noDokumen, setNoDokumen] = useState(
    `SPD-KPU/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`
  )
  const [uraian, setUraian] = useState("")
  const [jumlahStr, setJumlahStr] = useState("")
  const [periode, setPeriode] = useState("Agustus 2026")
  const [fileName, setFileName] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadedFileData, setUploadedFileData] = useState<FileUploadResponse | null>(null)
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [loadingPagu, setLoadingPagu] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Fetch active Tahun Anggaran and active Paguary
  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    const initData = async () => {
      setLoadingPagu(true)
      setErrorMessage(null)
      setSuccessMessage(null)

      try {
        const taRes = await tahunAnggaranApi.getAll({ status: "active", limit: 1 })
        const active = taRes.items[0] || null
        if (!isMounted) return
        setActiveTahun(active)

        if (active) {
          const paguRes = await paguAnggaranApi.getAll({
            id_tahun_anggaran: active.id_tahun_anggaran,
            limit: 200,
          })
          if (!isMounted) return
          setPaguList(paguRes.items)
          if (paguRes.items.length > 0) {
            setSelectedPaguId(paguRes.items[0].id_pagu)
          }
        } else {
          setErrorMessage("Tidak ada Tahun Anggaran aktif. Transaksi realisasi tidak dapat diproses.")
        }
      } catch (err: any) {
        if (isMounted) setErrorMessage(err.message || "Gagal memuat data pagu anggaran")
      } finally {
        if (isMounted) setLoadingPagu(false)
      }
    }

    initData()
    return () => {
      isMounted = false
    }
  }, [isOpen])

  if (!isOpen) return null

  const selectedPagu = paguList.find((p) => p.id_pagu === selectedPaguId)
  const sisaPagu = selectedPagu ? Number(selectedPagu.sisa_anggaran) || 0 : 0
  const nominal = parseFloat(jumlahStr) || 0
  const isOverBudget = selectedPagu ? nominal > sisaPagu : false

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null)
    if (!e.target.files || !e.target.files[0]) return

    const file = e.target.files[0]
    const allowed = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".jpg", ".jpeg", ".png"]
    const ext = "." + file.name.split(".").pop()?.toLowerCase()

    if (!allowed.includes(ext)) {
      setUploadError("Format berkas tidak didukung. Harap pilih PDF, Word, Excel, CSV, atau Gambar.")
      return
    }

    if (file.size > 25 * 1024 * 1024) {
      setUploadError("Ukuran berkas melebihi batas maksimal 25 MB.")
      return
    }

    setSelectedFile(file)
    setFileName(file.name)
    setIsUploading(true)

    try {
      const uploadRes = await filesApi.upload(file, "realisasi")
      setUploadedFileData(uploadRes)
    } catch (err: any) {
      setUploadError(err.message || "Gagal mengunggah berkas ke server.")
    } finally {
      setIsUploading(false)
    }
  }

  const handleHapusFile = () => {
    setSelectedFile(null)
    setFileName(null)
    setUploadedFileData(null)
    setUploadError(null)
  }

  const formatRupiah = (val: number) => {
    return `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(val))}`
  }

  const handleSimpanDirect = async () => {
    setErrorMessage(null)
    setSuccessMessage(null)

    if (isUploading) {
      setErrorMessage("Mohon tunggu hingga proses unggah berkas selesai.")
      return
    }

    if (uploadError) {
      setErrorMessage("Unggah berkas gagal. Harap perbaiki atau hapus berkas sebelum menyimpan.")
      return
    }

    if (!selectedPaguId) {
      setErrorMessage("Silakan pilih Pagu Anggaran terlebih dahulu.")
      return
    }

    if (!tanggal || !noDokumen.trim() || !uraian.trim() || nominal <= 0) {
      setErrorMessage("Mohon lengkapi seluruh kolom formulir transaksi yang wajib diisi.")
      return
    }

    if (isOverBudget) {
      setErrorMessage("Jumlah realisasi melebihi sisa anggaran pagu terpilih. Transaksi ditolak sistem.")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await realisasiAnggaranApi.createDirect({
        id_pagu: selectedPaguId,
        tanggal_transaksi: tanggal,
        nomor_dokumen: noDokumen.trim(),
        uraian_kegiatan: uraian.trim(),
        jumlah_realisasi: nominal,
        periode,
        bukti_file_path: uploadedFileData ? `/api/v1/files/${uploadedFileData.file_id}` : (fileName ? `uploads/realisasi/${fileName}` : null),
        bukti_file_nama: uploadedFileData ? uploadedFileData.filename : (fileName || null),
        bukti_file_ukuran: uploadedFileData ? uploadedFileData.size : (selectedFile ? selectedFile.size : null),
        bukti_file_mime: uploadedFileData ? uploadedFileData.mime_type : (selectedFile ? selectedFile.type : null),
      })

      setSuccessMessage(
        `Transaksi berhasil diverifikasi otomatis oleh sistem! Nomor: ${res.nomor_dokumen} (Status: ${res.status})`
      )

      // Trigger server-side refresh in parent component
      if (onSuccess) {
        onSuccess()
      }

      // Close modal smoothly after brief feedback
      setTimeout(() => {
        onClose()
      }, 1000)
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal memproses direct realisasi anggaran")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${
          isDark ? "bg-[#0c1220] border-[#1e293b] text-gray-100" : "bg-white border-slate-200 text-slate-800"
        }`}
      >
        {/* Modal Header: Direct Realisasi Phase 7 Style */}
        <div
          className={`p-4 border-b flex items-center justify-between ${
            isDark ? "border-[#1e293b] bg-[#11192b]" : "border-slate-200 bg-slate-50"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-600 text-white shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-base font-bold my-0 ${isDark ? "text-white" : "text-slate-900"}`}>
                Input Transaksi Realisasi Anggaran
              </h2>
              <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                Langsung Terverifikasi (Direct Approved System)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isDark ? "hover:bg-[#1e293b] text-gray-400" : "hover:bg-slate-200 text-slate-500"
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Success Alert */}
          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-2 animate-in zoom-in-95">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Error Alert */}
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
                disabled={isSubmitting}
                className={`text-xs ${isDark ? "bg-[#131b2e] border-[#1e293b]" : "bg-slate-50 border-slate-300"}`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold block">Nomor Dokumen / SPD</label>
              <Input
                type="text"
                value={noDokumen}
                onChange={(e) => setNoDokumen(e.target.value)}
                disabled={isSubmitting}
                className={`text-xs ${isDark ? "bg-[#131b2e] border-[#1e293b]" : "bg-slate-50 border-slate-300"}`}
              />
            </div>
          </div>

          {/* Pagu Selection */}
          <div className="space-y-1.5">
            <label className="font-semibold block">
              Pilih Alokasi Pagu Anggaran {activeTahun ? `(TA ${activeTahun.tahun})` : ""}
            </label>
            {loadingPagu ? (
              <div className="p-2 text-xs text-slate-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                <span>Memuat pagu anggaran aktif...</span>
              </div>
            ) : paguList.length === 0 ? (
              <div className="p-2 text-xs text-red-500 font-semibold border rounded-lg border-red-500/20">
                Tidak ada alokasi Pagu pada Tahun Anggaran aktif. Silakan buat Pagu terlebih dahulu.
              </div>
            ) : (
              <select
                value={selectedPaguId ?? ""}
                onChange={(e) => setSelectedPaguId(Number(e.target.value))}
                disabled={isSubmitting}
                className={`w-full rounded-lg px-3 py-2 border text-xs font-mono font-semibold cursor-pointer ${
                  isDark ? "bg-[#131b2e] border-[#1e293b] text-gray-200" : "bg-slate-50 border-slate-300 text-slate-800"
                }`}
              >
                {paguList.map((p) => (
                  <option key={p.id_pagu} value={p.id_pagu}>
                    {p.kode_akun} - {p.nama_akun} ({p.nama_bagian || "Umum"}) — Sisa: {formatRupiah(Number(p.sisa_anggaran) || 0)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Dynamic Budget Info Card */}
          {selectedPagu && (
            <Card className={`p-3.5 border rounded-xl ${isDark ? "bg-[#11192b] border-red-600/30" : "bg-red-50/50 border-red-200"}`}>
              <CardContent className="p-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-black text-red-600 dark:text-red-400 block">
                    Alokasi Pagu Terpilih:
                  </span>
                  <p className={`font-bold my-0.5 ${isDark ? "text-white" : "text-black"}`}>
                    {selectedPagu.nama_akun} ({selectedPagu.nama_bagian || "Umum"})
                  </p>
                  <span className="text-[10px] text-slate-400">Kode: {selectedPagu.kode_akun}</span>
                </div>
                <div className="sm:text-right">
                  <span className={`text-[10px] font-medium block ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                    Pagu Aktif: {formatRupiah(Number(selectedPagu.pagu_aktif) || 0)}
                  </span>
                  <span className="font-black text-red-600 dark:text-red-400 text-sm">
                    Sisa Anggaran: {formatRupiah(sisaPagu)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Periode Anggaran */}
          <div className="space-y-1.5">
            <label className="font-semibold block">Periode Anggaran</label>
            <Input
              type="text"
              value={periode}
              onChange={(e) => setPeriode(e.target.value)}
              disabled={isSubmitting}
              placeholder="Contoh: Triwulan I 2026 / Bulan Agustus"
              className={`text-xs ${isDark ? "bg-[#131b2e] border-[#1e293b]" : "bg-slate-50 border-slate-300"}`}
            />
          </div>

          {/* Uraian Kegiatan / Belanja */}
          <div className="space-y-1.5">
            <label className={`font-bold block ${isDark ? "text-white" : "text-black"}`}>
              Uraian Kegiatan / Keterangan Belanja
            </label>
            <Input
              type="text"
              placeholder="Contoh: Honorarium Rapat Pleno Rekapitulasi Pemilu"
              value={uraian}
              onChange={(e) => setUraian(e.target.value)}
              disabled={isSubmitting}
              className={`text-xs font-semibold ${
                isDark
                  ? "bg-[#131b2e] border-[#1e293b] text-white placeholder-gray-400"
                  : "bg-slate-50 border-slate-300 text-black placeholder-slate-500"
              }`}
            />
          </div>

          {/* Jumlah Realisasi */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className={`font-bold block ${isDark ? "text-white" : "text-black"}`}>
                Jumlah Realisasi (Rp)
              </label>
              {isOverBudget && (
                <span className="text-[10px] font-extrabold text-white bg-red-600 px-2 py-0.5 rounded shadow-xs animate-pulse">
                  ⚠️ Peringatan: Melebihi Sisa Anggaran Pagu!
                </span>
              )}
            </div>
            <Input
              type="number"
              placeholder="0"
              value={jumlahStr}
              onChange={(e) => setJumlahStr(e.target.value)}
              disabled={isSubmitting}
              className={`text-xs font-mono font-bold ${
                isOverBudget
                  ? "border-red-600 text-red-600 bg-red-600/10 focus:border-red-600"
                  : isDark
                  ? "bg-[#131b2e] border-[#1e293b] text-white"
                  : "bg-slate-50 border-slate-300 text-black"
              }`}
            />
          </div>

          {/* Upload Bukti Transaksi */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className={`font-bold block ${isDark ? "text-white" : "text-black"}`}>
                Lampiran Bukti Transaksi (Kuitansi / SPJ / Nota)
              </label>
              {fileName && (
                <button
                  type="button"
                  onClick={handleHapusFile}
                  disabled={isSubmitting || isUploading}
                  className="text-[11px] text-red-500 hover:underline font-semibold cursor-pointer"
                >
                  Hapus Berkas
                </button>
              )}
            </div>

            <div
              className={`p-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center transition-colors ${
                uploadError
                  ? "border-red-500 bg-red-500/10"
                  : fileName
                  ? "border-emerald-500/50 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
                  : isDark
                  ? "border-[#1e293b] bg-[#11192b] hover:border-red-600/50 cursor-pointer"
                  : "border-slate-300 bg-slate-50 hover:border-red-600/50 cursor-pointer"
              }`}
            >
              <input
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png"
                className="hidden"
                id="bukti-file-input"
                disabled={isSubmitting || isUploading}
              />
              <label htmlFor="bukti-file-input" className="cursor-pointer flex flex-col items-center gap-1.5 w-full">
                {isUploading ? (
                  <>
                    <Loader2 className="w-6 h-6 text-red-600 animate-spin" />
                    <span className="font-bold text-xs text-red-600">Mengunggah ke server...</span>
                    <span className={`text-[10px] ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                      Menyimpan berkas fisik ke file storage
                    </span>
                  </>
                ) : fileName ? (
                  <>
                    <FileText className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400">{fileName}</span>
                    {uploadedFileData ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        ✓ Berkas Tersimpan ({Math.round(uploadedFileData.size / 1024)} KB)
                      </span>
                    ) : (
                      <span className={`text-[10px] ${isDark ? "text-gray-300" : "text-slate-600"}`}>
                        Klik untuk mengganti berkas
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-red-600" />
                    <span className={`font-bold text-xs ${isDark ? "text-white" : "text-black"}`}>
                      Pilih File Bukti Transaksi
                    </span>
                    <span className={`text-[10px] ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                      Format: PDF, Word, Excel, CSV, Gambar (Maks. 25 MB)
                    </span>
                  </>
                )}
              </label>
            </div>

            {uploadError && (
              <p className="text-[11px] text-red-500 font-semibold flex items-center gap-1.5 mt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{uploadError}</span>
              </p>
            )}
          </div>
        </div>

        {/* Modal Footer (Action Buttons: Phase 7 Direct Realisasi Button) */}
        <div
          className={`p-4 border-t flex items-center justify-between shrink-0 ${
            isDark ? "border-[#1e293b] bg-[#090e1a]" : "border-slate-200 bg-slate-50"
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className={`px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
              isDark
                ? "border-[#1e293b] bg-[#131b2e] text-white hover:bg-[#1e293b]"
                : "border-slate-300 bg-white text-black hover:bg-slate-100"
            }`}
          >
            Batal
          </button>

          <Button
            type="button"
            disabled={isSubmitting || isOverBudget || !selectedPaguId || !activeTahun}
            onClick={handleSimpanDirect}
            className="btn-kpu-red px-5 py-2.5 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memproses Realisasi...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Simpan & Realisasikan</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
