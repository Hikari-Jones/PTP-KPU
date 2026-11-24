import React, { useState, useEffect } from "react"
import { X, AlertCircle, FileText, CheckCircle2, Loader2, Sparkles, RefreshCw } from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import {
  paguAnggaranApi,
  realisasiAnggaranApi,
  tahunAnggaranApi,
} from "../../../services/api"
import type { PaguAnggaranResponse, RealisasiAnggaranResponse, TahunAnggaranResponse } from "./types"

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  transaksi: RealisasiAnggaranResponse | null
  theme: "light" | "dark"
}

export function EditRealisasiModal({ isOpen, onClose, onSuccess, transaksi, theme }: Props) {
  const isDark = theme === "dark"

  const [paguList, setPaguList] = useState<PaguAnggaranResponse[]>([])
  const [selectedPaguId, setSelectedPaguId] = useState<number | null>(null)
  const [tanggal, setTanggal] = useState("")
  const [noDokumen, setNoDokumen] = useState("")
  const [uraian, setUraian] = useState("")
  const [jumlahStr, setJumlahStr] = useState("")

  const formatThousand = (val: string | number) => {
    const raw = String(val).replace(/\D/g, "")
    if (!raw) return ""
    return new Intl.NumberFormat("id-ID").format(Number(raw))
  }

  const handleJumlahChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "")
    setJumlahStr(raw)
  }
  const [periode, setPeriode] = useState("")

  const [loadingPagu, setLoadingPagu] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Populate data when modal opens with active transaction
  useEffect(() => {
    if (!isOpen || !transaksi) return

    let isMounted = true
    setErrorMessage(null)
    setSuccessMessage(null)
    setTanggal(transaksi.tanggal_transaksi || new Date().toISOString().split("T")[0])
    setNoDokumen(transaksi.nomor_dokumen || "")
    setUraian(transaksi.uraian_kegiatan || "")
    setJumlahStr(String(transaksi.jumlah_realisasi || 0))
    setPeriode(transaksi.periode || "Agustus 2026")
    setSelectedPaguId(transaksi.id_pagu || null)

    const initPagu = async () => {
      setLoadingPagu(true)
      try {
        const taRes = await tahunAnggaranApi.getAll({ status: "active", limit: 1 })
        const activeYear = taRes.items[0]
        if (!isMounted) return

        if (activeYear) {
          const paguRes = await paguAnggaranApi.getAll({
            id_tahun_anggaran: activeYear.id_tahun_anggaran,
            limit: 500,
          })
          if (isMounted) setPaguList(paguRes.items)
        }
      } catch (err: any) {
        if (isMounted) setErrorMessage("Gagal memuat referensi pagu anggaran")
      } finally {
        if (isMounted) setLoadingPagu(false)
      }
    }

    initPagu()
    return () => {
      isMounted = false
    }
  }, [isOpen, transaksi])

  if (!isOpen || !transaksi) return null

  const selectedPagu = paguList.find((p) => p.id_pagu === selectedPaguId)

  // Format IDR helper
  const formatRupiah = (val: number | string) => {
    const num = Number(val) || 0
    return `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(num))}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    const numJumlah = Number(jumlahStr.replace(/[^0-9.-]+/g, ""))
    if (isNaN(numJumlah) || numJumlah <= 0) {
      setErrorMessage("Nominal realisasi harus lebih besar dari 0")
      return
    }

    if (!uraian.trim()) {
      setErrorMessage("Uraian kegiatan belanja wajib diisi")
      return
    }

    if (!noDokumen.trim()) {
      setErrorMessage("Nomor bukti dokumen transaksi wajib diisi")
      return
    }

    setIsSubmitting(true)
    try {
      await realisasiAnggaranApi.update(transaksi.id_realisasi, {
        id_pagu: selectedPaguId ?? undefined,
        tanggal_transaksi: tanggal,
        nomor_dokumen: noDokumen.trim(),
        uraian_kegiatan: uraian.trim(),
        jumlah_realisasi: numJumlah,
        periode: periode.trim() || undefined,
      })

      setSuccessMessage("Perubahan transaksi realisasi berhasil disimpan oleh RENDATIN!")
      setTimeout(() => {
        if (onSuccess) onSuccess()
        onClose()
      }, 1000)
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal memperbarui transaksi")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden ${
          isDark ? "bg-[#0b1329] border-[#1e293b] text-white" : "bg-white border-slate-200 text-black"
        }`}
      >
        {/* Header */}
        <div
          className={`p-4 border-b flex items-center justify-between ${
            isDark ? "border-[#1e293b] bg-[#111c38]" : "border-slate-200 bg-slate-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-600 text-white shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-base font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>
                  Edit Transaksi Realisasi
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-600/20 text-red-500 border border-red-500/30">
                  KHUSUS RENDATIN
                </span>
              </div>
              <p className={`text-xs mt-0.5 font-medium ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                ID Transaksi #{transaksi.id_realisasi} • Status: Terverifikasi Sah
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isDark ? "hover:bg-slate-800 text-gray-400" : "hover:bg-slate-200 text-slate-600"
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 custom-scrollbar flex-1">
          {errorMessage && (
            <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Akun Anggaran / Pagu Selection */}
          <div className="space-y-1.5">
            <label className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-slate-700"}`}>
              Mata Anggaran Kegiatan (MAK) / Pagu Induk
            </label>
            <select
              value={selectedPaguId ?? ""}
              onChange={(e) => setSelectedPaguId(e.target.value ? Number(e.target.value) : null)}
              disabled={loadingPagu}
              className={`w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none cursor-pointer transition-colors ${
                isDark
                  ? "bg-[#0f172a] border-white/10 text-white focus:border-red-500"
                  : "bg-white border-slate-300 text-slate-900 focus:border-red-500"
              }`}
            >
              <option value="">-- Tetap Gunakan Pagu Saat Ini --</option>
              {paguList.map((p) => (
                <option key={p.id_pagu} value={p.id_pagu}>
                  {p.kode_akun} - {p.nama_akun} ({p.nama_bagian || "Umum"}) • Sisa: {formatRupiah(p.sisa_anggaran)}
                </option>
              ))}
            </select>
            {selectedPagu && (
              <p className="text-[11px] font-semibold text-emerald-500">
                Pagu Aktif: {formatRupiah(selectedPagu.pagu_aktif)} | Sisa Tersedia: {formatRupiah(selectedPagu.sisa_anggaran)}
              </p>
            )}
          </div>

          {/* Row: Tanggal & No Dokumen */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                Tanggal Transaksi *
              </label>
              <Input
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                required
                className={`text-xs font-bold ${
                  isDark ? "bg-[#0f172a] border-white/10 text-white" : "bg-white border-slate-300 text-black"
                }`}
              />
            </div>

            <div className="space-y-1.5">
              <label className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                Nomor Dokumen (SPBY / SP2D / Kuitansi) *
              </label>
              <Input
                type="text"
                value={noDokumen}
                onChange={(e) => setNoDokumen(e.target.value)}
                required
                placeholder="Contoh: SPBY-045/KPU-SULUT/2026"
                className={`text-xs font-bold ${
                  isDark ? "bg-[#0f172a] border-white/10 text-white" : "bg-white border-slate-300 text-black"
                }`}
              />
            </div>
          </div>

          {/* Nominal Realisasi */}
          <div className="space-y-1.5">
            <label className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-slate-700"}`}>
              Jumlah Realisasi Belanja (Rp) *
            </label>
            <Input
              type="text"
              inputMode="numeric"
              value={formatThousand(jumlahStr)}
              onChange={handleJumlahChange}
              required
              placeholder="0"
              className={`text-sm font-extrabold text-red-600 dark:text-red-400 ${
                isDark ? "bg-[#0f172a] border-white/10" : "bg-white border-slate-300"
              }`}
            />
            {Number(jumlahStr) > 0 && (
              <p className="text-[11px] font-bold text-slate-500">
                Terbaca: {formatRupiah(jumlahStr)}
              </p>
            )}
          </div>

          {/* Uraian Kegiatan */}
          <div className="space-y-1.5">
            <label className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-slate-700"}`}>
              Uraian / Deskripsi Belanja Kegiatan *
            </label>
            <textarea
              rows={3}
              value={uraian}
              onChange={(e) => setUraian(e.target.value)}
              required
              placeholder="Contoh: Belanja bahan konsumsi rapat pleno rekapitulasi data pemilih"
              className={`w-full rounded-xl border p-3 text-xs font-medium outline-none transition-colors ${
                isDark
                  ? "bg-[#0f172a] border-white/10 text-white focus:border-red-500"
                  : "bg-white border-slate-300 text-slate-900 focus:border-red-500"
              }`}
            />
          </div>

          {/* Periode Belanja */}
          <div className="space-y-1.5">
            <label className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-slate-700"}`}>
              Periode Realisasi
            </label>
            <Input
              type="text"
              value={periode}
              onChange={(e) => setPeriode(e.target.value)}
              placeholder="Contoh: Agustus 2026"
              className={`text-xs font-medium ${
                isDark ? "bg-[#0f172a] border-white/10 text-white" : "bg-white border-slate-300 text-black"
              }`}
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={`px-4 py-2 text-xs font-bold rounded-xl border transition-colors cursor-pointer ${
                isDark ? "border-slate-700 hover:bg-slate-800 text-white" : "border-slate-300 hover:bg-slate-100 text-black"
              }`}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-kpu-red px-5 py-2 text-xs font-bold text-white rounded-xl flex items-center gap-2 cursor-pointer shadow-md active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan Perubahan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Simpan Perubahan (RENDATIN)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
