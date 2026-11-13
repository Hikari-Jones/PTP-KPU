import { useState, useEffect } from "react"
import { CheckCircle2, FileText, Upload, Sparkles, Loader2, AlertCircle, X } from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { ReadOnlyFieldset } from "../ui/read-only"
import { useAuth } from "../../context/AuthContext"
import {
  paguAnggaranApi,
  realisasiAnggaranApi,
  tahunAnggaranApi,
  filesApi,
} from "../../../services/api"
import type { PaguAnggaranResponse, TahunAnggaranResponse, FileUploadResponse } from "./types"

export function InputRealisasiView({ theme }: { theme: "light" | "dark" }) {
  const isDark = theme === "dark"
  const readOnly = !useAuth().canEdit("anggaran")

  const [activeTahun, setActiveTahun] = useState<TahunAnggaranResponse | null>(null)
  const [paguList, setPaguList] = useState<PaguAnggaranResponse[]>([])
  const [selectedPaguId, setSelectedPaguId] = useState<number | null>(null)

  const [tanggal, setTanggal] = useState(new Date().toISOString().split("T")[0])
  const [nomorDokumen, setNomorDokumen] = useState(
    `SPD-KPU/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`
  )
  const [uraian, setUraian] = useState("")
  const [jumlah, setJumlah] = useState("")
  const [periode, setPeriode] = useState("Agustus 2026")
  const [fileName, setFileName] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadedFileData, setUploadedFileData] = useState<FileUploadResponse | null>(null)
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [loading, setLoading] = useState<boolean>(true)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Fetch active Tahun Anggaran and Paguary from backend
  useEffect(() => {
    let isMounted = true
    const initData = async () => {
      setLoading(true)
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
        }
      } catch (err: any) {
        if (isMounted) {
          setMessage({
            type: "error",
            text: err.message || "Gagal memuat alokasi pagu anggaran aktif dari server",
          })
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    initData()
    return () => {
      isMounted = false
    }
  }, [])

  const selectedPagu = paguList.find((p) => p.id_pagu === selectedPaguId)
  const remaining = selectedPagu ? Number(selectedPagu.sisa_anggaran) || 0 : 0
  const numericAmount = Number(jumlah) || 0
  const isOverBudget = Boolean(selectedPagu && numericAmount > remaining)

  const formatRupiah = (value: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(value))}`

  const inputClass = `w-full rounded-xl border px-3 py-2.5 text-xs font-semibold outline-none transition-colors ${
    isDark
      ? "bg-[#0f172a] border-white/10 text-white placeholder:text-slate-500 focus:border-red-500"
      : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-red-500"
  }`

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    setFileName("")
    setUploadedFileData(null)
    setUploadError(null)
  }

  const handleSimpanDirect = async () => {
    setMessage(null)

    if (isUploading) {
      setMessage({ type: "error", text: "Mohon tunggu hingga proses unggah berkas selesai." })
      return
    }

    if (uploadError) {
      setMessage({ type: "error", text: "Unggah berkas gagal. Harap perbaiki atau hapus berkas sebelum menyimpan." })
      return
    }

    if (!selectedPaguId) {
      setMessage({ type: "error", text: "Silakan pilih Pagu Anggaran terlebih dahulu." })
      return
    }

    if (!tanggal || !nomorDokumen.trim() || !uraian.trim() || numericAmount <= 0) {
      setMessage({ type: "error", text: "Lengkapi seluruh kolom formulir transaksi sebelum menyimpan realisasi." })
      return
    }

    if (isOverBudget) {
      setMessage({ type: "error", text: "Jumlah realisasi melebihi sisa anggaran pagu yang dipilih." })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await realisasiAnggaranApi.createDirect({
        id_pagu: selectedPaguId,
        tanggal_transaksi: tanggal,
        nomor_dokumen: nomorDokumen.trim(),
        uraian_kegiatan: uraian.trim(),
        jumlah_realisasi: numericAmount,
        periode,
        bukti_file_path: uploadedFileData ? `/api/v1/files/${uploadedFileData.file_id}` : (fileName ? `uploads/realisasi/${fileName}` : null),
        bukti_file_nama: uploadedFileData ? uploadedFileData.filename : (fileName || null),
        bukti_file_ukuran: uploadedFileData ? uploadedFileData.size : (selectedFile ? selectedFile.size : null),
        bukti_file_mime: uploadedFileData ? uploadedFileData.mime_type : (selectedFile ? selectedFile.type : null),
      })

      setMessage({
        type: "success",
        text: `Realisasi ${res.nomor_dokumen} berhasil diverifikasi otomatis oleh sistem (Status: ${res.status}).`,
      })

      // Reset form
      setNomorDokumen(`SPD-KPU/${new Date().getFullYear()}/${Math.floor(1000 + Math.random() * 9000)}`)
      setUraian("")
      setJumlah("")
      setFileName("")
      setSelectedFile(null)
      setUploadedFileData(null)
      setUploadError(null)

      // Reload pagu to update remaining budget
      if (activeTahun) {
        const paguRes = await paguAnggaranApi.getAll({
          id_tahun_anggaran: activeTahun.id_tahun_anggaran,
          limit: 200,
        })
        setPaguList(paguRes.items)
      }
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Gagal memproses realisasi anggaran pada server",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-in fade-in duration-200">
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
          Realisasi Anggaran
        </p>
        <h1 className={`m-0 text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-black"}`}>
          Input Transaksi Realisasi Anggaran
        </h1>
        <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">
          Langsung Terverifikasi (Direct Approved System) • TA {activeTahun?.tahun ?? "Aktif"}
        </p>
      </div>

      <ReadOnlyFieldset readOnly={readOnly}>
      <Card
        className={`overflow-hidden rounded-2xl border shadow-lg ${
          isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white border-slate-200"
        } backdrop-blur-md`}
      >
        <CardContent className="p-6 space-y-5 text-xs">
          {message && (
            <div
              className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
                message.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="font-semibold block">Tanggal Transaksi</label>
              <Input
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                disabled={isSubmitting}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-semibold block">Nomor Dokumen / SPD</label>
              <Input
                type="text"
                value={nomorDokumen}
                onChange={(e) => setNomorDokumen(e.target.value)}
                disabled={isSubmitting}
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold block">Pilih Alokasi Pagu Anggaran</label>
            {loading ? (
              <div className="p-2 text-xs text-slate-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                <span>Memuat daftar pagu aktif...</span>
              </div>
            ) : paguList.length === 0 ? (
              <div className="p-2.5 text-xs text-red-500 font-semibold border rounded-xl border-red-500/20">
                Tidak ada pagu aktif ditemukan. Pastikan Tahun Anggaran aktif telah memiliki alokasi Pagu.
              </div>
            ) : (
              <select
                value={selectedPaguId ?? ""}
                onChange={(e) => setSelectedPaguId(Number(e.target.value))}
                disabled={isSubmitting}
                className={`${inputClass} font-mono cursor-pointer`}
              >
                {paguList.map((p) => (
                  <option key={p.id_pagu} value={p.id_pagu}>
                    {p.kode_akun} - {p.nama_akun} ({p.nama_bagian || "Umum"}) — Sisa: {formatRupiah(Number(p.sisa_anggaran) || 0)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedPagu && (
            <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isDark ? "bg-[#11192b] border-red-600/30" : "bg-red-50/50 border-red-200"
            }`}>
              <div>
                <p className="text-[10px] uppercase font-bold text-red-600 dark:text-red-400">Informasi Pagu</p>
                <p className="font-bold text-sm my-0.5">{selectedPagu.nama_akun}</p>
                <span className="text-[11px] text-slate-400">Bagian: {selectedPagu.nama_bagian || "Umum"}</span>
              </div>
              <div className="sm:text-right">
                <p className="text-[11px] text-slate-500">Pagu Aktif: {formatRupiah(Number(selectedPagu.pagu_aktif) || 0)}</p>
                <p className="text-sm font-black text-red-600 dark:text-red-400">
                  Sisa: {formatRupiah(remaining)}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="font-semibold block">Periode Anggaran</label>
            <Input
              type="text"
              value={periode}
              onChange={(e) => setPeriode(e.target.value)}
              disabled={isSubmitting}
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold block">Uraian Transaksi Belanja</label>
            <Input
              type="text"
              placeholder="Contoh: Belanja Operasional Rapat Evaluasi Anggaran"
              value={uraian}
              onChange={(e) => setUraian(e.target.value)}
              disabled={isSubmitting}
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-semibold block">Nominal Realisasi (Rp)</label>
              {isOverBudget && (
                <span className="text-[10px] font-bold text-red-600 dark:text-red-400 animate-pulse">
                  Nominal melebihi sisa anggaran!
                </span>
              )}
            </div>
            <Input
              type="number"
              placeholder="0"
              value={jumlah}
              onChange={(e) => setJumlah(e.target.value)}
              disabled={isSubmitting}
              className={`${inputClass} font-mono ${isOverBudget ? "border-red-500 text-red-500" : ""}`}
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-semibold block">Lampiran Bukti Transaksi (Kuitansi / SPJ / Nota)</label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  id="input-bukti-file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png"
                  onChange={handleFileSelect}
                  disabled={isSubmitting || isUploading}
                />
                <label
                  htmlFor="input-bukti-file"
                  className={`px-3 py-2 rounded-xl border flex items-center gap-2 font-semibold text-xs cursor-pointer transition-colors ${
                    isDark
                      ? "bg-[#0f172a] border-white/10 hover:bg-slate-800 text-slate-200"
                      : "bg-slate-50 border-slate-300 hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                  ) : (
                    <Upload className="w-4 h-4 text-red-500" />
                  )}
                  <span>{isUploading ? "Mengunggah..." : "Pilih Berkas Bukti"}</span>
                </label>

                {fileName ? (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="truncate text-xs font-mono font-semibold text-red-600 dark:text-red-400">
                      {fileName}
                    </span>
                    {uploadedFileData && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                        ✓ Terunggah ({Math.round(uploadedFileData.size / 1024)} KB)
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleHapusFile}
                      disabled={isSubmitting || isUploading}
                      className="p-1 rounded-lg text-slate-400 hover:text-red-500 cursor-pointer"
                      title="Hapus berkas"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-500">
                    PDF, DOCX, XLSX, JPG, PNG (Maks. 25 MB)
                  </span>
                )}
              </div>

              {uploadError && (
                <p className="text-[11px] text-red-500 font-semibold flex items-center gap-1.5 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{uploadError}</span>
                </p>
              )}
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              type="button"
              disabled={readOnly || isSubmitting || isOverBudget || !selectedPaguId}
              onClick={handleSimpanDirect}
              className="btn-kpu-red px-6 py-2.5 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memproses Realisasi...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Simpan & Realisasikan</span>
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
      </ReadOnlyFieldset>
    </div>
  )
}
