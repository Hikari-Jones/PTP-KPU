import { useState, useEffect, useCallback, useRef } from "react"
import { BarChart3, Download, Plus, RefreshCw, Search, X, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { useAuth } from "../../context/AuthContext"
import {
  paguAnggaranApi,
  revisiAnggaranApi,
  tahunAnggaranApi,
} from "../../../services/api"
import type {
  PaguAnggaranResponse,
  RevisiAnggaranResponse,
  TahunAnggaranResponse,
} from "./types"

type Subbagian = "SDM" | "RENDATIN" | "Teknis" | "Hukum" | "Keuangan" | "UMLOG"

const SUBBAGIAN_OPTIONS: Subbagian[] = ["SDM", "RENDATIN", "Teknis", "Hukum", "Keuangan", "UMLOG"]

export function PaguAnggaranView({ theme }: { theme: "light" | "dark"; onNavigate?: (tab: string) => void }) {
  const isDark = theme === "dark"
  const readOnly = !useAuth().canEdit("anggaran")
  const [activeTab, setActiveTab] = useState<"pagu" | "revisi">("pagu")

  // Master Tahun Anggaran
  const [tahunList, setTahunList] = useState<TahunAnggaranResponse[]>([])
  const [selectedTAId, setSelectedTAId] = useState<number | undefined>(undefined)
  const [selectedTAYear, setSelectedTAYear] = useState<number>(new Date().getFullYear())

  // Data states
  const [paguList, setPaguList] = useState<PaguAnggaranResponse[]>([])
  const [revisiList, setRevisiList] = useState<RevisiAnggaranResponse[]>([])
  const [selectedSubbagian, setSelectedSubbagian] = useState("Semua Subbagian")
  const [searchQuery, setSearchQuery] = useState("")

  // Loading & Error states
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Modal & Form states
  const [modalType, setModalType] = useState<"pagu" | "revisi" | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Revisi Form Fields (Aligned with Phase 12 RevisiAnggaranCreate)
  const [formPaguId, setFormPaguId] = useState<number | "">("")
  const [formNomorRevisi, setFormNomorRevisi] = useState("")
  const [formTanggalRevisi, setFormTanggalRevisi] = useState("")
  const [formPaguSebelum, setFormPaguSebelum] = useState(0)
  const [formPaguBaru, setFormPaguBaru] = useState(0)
  const [formAlasanRevisi, setFormAlasanRevisi] = useState("")

  const requestIdRef = useRef(0)

  const formatRupiah = (value: number) => `Rp ${new Intl.NumberFormat("id-ID").format(value)}`

  // 1. Initial Load: Fetch Tahun Anggaran
  useEffect(() => {
    let isMounted = true
    const initTahun = async () => {
      try {
        const res = await tahunAnggaranApi.getAll({ limit: 100 })
        if (!isMounted) return
        const items = res.items || []
        setTahunList(items)
        if (items.length > 0) {
          const activeYr = items.find((y) => y.status === "active") || items[0]
          setSelectedTAId(activeYr.id_tahun_anggaran)
          setSelectedTAYear(activeYr.tahun)
        }
      } catch (e: any) {
        if (!isMounted) return
        console.warn("Gagal memuat tahun anggaran", e)
      }
    }
    initTahun()
    return () => { isMounted = false }
  }, [])

  // 2. Fetch Data (Pagu & Revisi) whenever selectedTAId changes
  const fetchData = useCallback(async () => {
    const currentReq = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const [paguRes, revisiRes] = await Promise.all([
        paguAnggaranApi.getAll({
          id_tahun_anggaran: selectedTAId,
          limit: 300,
        }).catch((e) => {
          console.warn("Gagal memuat pagu", e)
          return { total: 0, items: [] }
        }),
        revisiAnggaranApi.getAll({
          id_tahun_anggaran: selectedTAId,
          limit: 300,
        }).catch((e) => {
          console.warn("Gagal memuat riwayat revisi", e)
          return { total: 0, items: [] }
        }),
      ])

      if (currentReq === requestIdRef.current) {
        setPaguList(paguRes.items || [])
        setRevisiList(revisiRes.items || [])
      }
    } catch (e: any) {
      if (currentReq === requestIdRef.current) {
        setError(e.message || "Gagal memuat data dari server")
      }
    } finally {
      if (currentReq === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [selectedTAId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Filtered Pagu List
  const filteredPagu = paguList.filter((item) => {
    const matchesSubbagian = selectedSubbagian === "Semua Subbagian" || item.nama_bagian === selectedSubbagian
    const term = searchQuery.toLowerCase()
    const matchesSearch =
      (item.kode_akun || "").toLowerCase().includes(term) ||
      (item.nama_akun || "").toLowerCase().includes(term) ||
      (item.nama_bagian || "").toLowerCase().includes(term)
    return matchesSubbagian && matchesSearch
  })

  // Filtered Revisi List
  const filteredRevisi = revisiList.filter((item) => {
    const term = searchQuery.toLowerCase()
    return (
      (item.nomor_revisi || "").toLowerCase().includes(term) ||
      (item.alasan_revisi || "").toLowerCase().includes(term) ||
      (item.nama_pegawai || "").toLowerCase().includes(term)
    )
  })

  const totalPaguAktif = filteredPagu.reduce((total, item) => total + (item.pagu_aktif || 0), 0)

  const closeModal = () => {
    setModalType(null)
    setFormPaguId("")
    setFormNomorRevisi("")
    setFormTanggalRevisi("")
    setFormPaguSebelum(0)
    setFormPaguBaru(0)
    setFormAlasanRevisi("")
    setError(null)
  }

  const openAddRevisi = () => {
    const firstPagu = paguList[0]
    const today = new Date().toISOString().split("T")[0]
    setFormTanggalRevisi(today)
    setFormNomorRevisi(`REV-${String(revisiList.length + 1).padStart(3, "0")}/${selectedTAYear}`)
    if (firstPagu) {
      setFormPaguId(firstPagu.id_pagu)
      setFormPaguSebelum(firstPagu.pagu_aktif || 0)
      setFormPaguBaru(firstPagu.pagu_aktif || 0)
    } else {
      setFormPaguId("")
      setFormPaguSebelum(0)
      setFormPaguBaru(0)
    }
    setFormAlasanRevisi("")
    setModalType("revisi")
  }

  const handlePaguChange = (idPagu: number) => {
    setFormPaguId(idPagu)
    const selected = paguList.find((p) => p.id_pagu === idPagu)
    if (selected) {
      setFormPaguSebelum(selected.pagu_aktif || 0)
      setFormPaguBaru(selected.pagu_aktif || 0)
    }
  }

  // Submit Revisi to Backend (Phase 12 Atomic Transaction)
  const submitRevisi = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!formPaguId) {
      setError("Pilih akun pagu anggaran yang akan direvisi.")
      return
    }
    if (formPaguBaru < 0) {
      setError("Pagu baru tidak boleh bernilai negatif.")
      return
    }
    if (!formNomorRevisi.trim()) {
      setError("Nomor surat/SK revisi wajib diisi.")
      return
    }
    if (!formAlasanRevisi.trim() || formAlasanRevisi.trim().length < 5) {
      setError("Alasan revisi minimal 5 karakter.")
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await revisiAnggaranApi.create({
        id_pagu: Number(formPaguId),
        nomor_revisi: formNomorRevisi.trim(),
        tanggal_revisi: formTanggalRevisi,
        pagu_baru: Number(formPaguBaru),
        alasan_revisi: formAlasanRevisi.trim(),
      })
      setSuccessMessage("Revisi anggaran berhasil dieksekusi dan tercatat di audit trail!")
      setTimeout(() => setSuccessMessage(null), 4000)
      closeModal()
      // Refresh pagu and history from backend
      await fetchData()
    } catch (e: any) {
      setError(e.message || "Gagal mengeksekusi revisi anggaran")
    } finally {
      setSubmitting(false)
    }
  }

  const handleExport = () => {
    const rows = activeTab === "pagu"
      ? ["Tahun,Kode,Nama Akun,Bagian,Pagu Awal,Pagu Aktif,Realisasi,Sisa", ...filteredPagu.map((item) => `${item.tahun || selectedTAYear},${item.kode_akun},"${item.nama_akun}","${item.nama_bagian || ""}",${item.pagu_awal},${item.pagu_aktif},${item.total_realisasi_verified},${item.sisa_anggaran}`)]
      : ["No Revisi,Tanggal,Pagu Sebelum,Pagu Sesudah,Perubahan Netto,Alasan,Dibuat Oleh", ...filteredRevisi.map((item) => `${item.nomor_revisi},${item.tanggal_revisi},${item.pagu_sebelum},${item.pagu_sesudah},${item.perubahan_netto},"${item.alasan_revisi}","${item.nama_pegawai || ""}"`)]
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `${activeTab === "pagu" ? "Pagu" : "Revisi"}_Anggaran_TA_${selectedTAYear}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const inputClass = `w-full rounded-xl border px-3 py-2 text-xs font-semibold outline-none transition-colors ${isDark ? "bg-[#131b2e] border-white/10 text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-slate-900 focus:border-red-500"}`

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Tab Navigation */}
      <div className={`flex items-center gap-6 border-b ${isDark ? "border-white/10" : "border-slate-200"}`}>
        <button
          type="button"
          onClick={() => { setActiveTab("pagu"); setSearchQuery("") }}
          className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-bold transition-colors cursor-pointer ${activeTab === "pagu" ? "border-red-600 text-red-600 dark:text-red-400" : "border-transparent text-slate-500 hover:text-red-500"}`}
        >
          <BarChart3 className="h-4 w-4" /> Pagu Anggaran
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${isDark ? "bg-white/5" : "bg-slate-100"}`}>{paguList.length}</span>
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab("revisi"); setSearchQuery("") }}
          className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-bold transition-colors cursor-pointer ${activeTab === "revisi" ? "border-red-600 text-red-600 dark:text-red-400" : "border-transparent text-slate-500 hover:text-red-500"}`}
        >
          <RefreshCw className="h-4 w-4" /> Histori Revisi & Audit Trail
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${isDark ? "bg-white/5" : "bg-slate-100"}`}>{revisiList.length}</span>
        </button>
      </div>

      {/* Success & Error Banner */}
      {successMessage && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {error && !modalType && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs font-bold text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Title & Action Buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">Realisasi Anggaran</p>
          <h1 className={`m-0 text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-black"}`}>
            {activeTab === "pagu" ? "Pagu Anggaran" : "Histori Revisi Anggaran (Audit Trail)"}
          </h1>
          <p className={`mt-1 text-xs font-medium ${isDark ? "text-gray-400" : "text-slate-600"}`}>
            {activeTab === "pagu" ? `${filteredPagu.length} pagu terdaftar` : `${filteredRevisi.length} riwayat revisi tercatat`} — Tahun Anggaran {selectedTAYear}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold cursor-pointer transition-colors ${isDark ? "bg-[#0f172a] border-white/10 text-gray-300 hover:bg-[#1e293b]" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}
            title="Refresh Data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-red-500" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleExport}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold cursor-pointer transition-colors ${isDark ? "bg-[#0f172a] border-white/10 text-gray-300 hover:bg-[#1e293b]" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}
          >
            <Download className="h-4 w-4" /> Export
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={openAddRevisi}
              className="btn-kpu-red flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white cursor-pointer shadow-md hover:opacity-95"
            >
              <Plus className="h-4 w-4" /> Tambah Revisi DIPA
            </button>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 md:flex-row">
        <select
          value={selectedTAId ?? ""}
          onChange={(event) => {
            const idVal = Number(event.target.value)
            setSelectedTAId(idVal)
            const yr = tahunList.find((y) => y.id_tahun_anggaran === idVal)
            if (yr) setSelectedTAYear(yr.tahun)
            setSearchQuery("")
          }}
          className={`${inputClass} md:w-36 cursor-pointer`}
        >
          {tahunList.map((t) => (
            <option key={t.id_tahun_anggaran} value={t.id_tahun_anggaran}>
              TA {t.tahun} ({t.status})
            </option>
          ))}
        </select>
        {activeTab === "pagu" && (
          <select
            value={selectedSubbagian}
            onChange={(event) => setSelectedSubbagian(event.target.value)}
            className={`${inputClass} md:w-52 cursor-pointer`}
          >
            <option>Semua Subbagian</option>
            {SUBBAGIAN_OPTIONS.map((item) => <option key={item}>{item}</option>)}
          </select>
        )}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={activeTab === "pagu" ? "Cari kode, nama akun, atau bagian..." : "Cari no. revisi, alasan, atau nama operator..."}
            className={`${inputClass} pl-9`}
          />
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 gap-3 text-xs font-semibold text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-red-600" />
          Memuat data dari server...
        </div>
      )}

      {/* TAB 1: PAGU ANGGARAN */}
      {!loading && activeTab === "pagu" && (
        <>
          <div className={`flex items-center justify-between px-1 text-xs ${isDark ? "text-gray-400" : "text-slate-600"}`}>
            <span>{filteredPagu.length} akun teralokasi • TA {selectedTAYear}</span>
            <span className="font-bold text-red-600 dark:text-red-400">Total Pagu Aktif: {formatRupiah(totalPaguAktif)}</span>
          </div>
          <Card className={`${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} overflow-hidden rounded-2xl shadow-lg backdrop-blur-md`}>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow className={isDark ? "bg-[#0a0f1d]" : "bg-slate-50"}>
                  {['KODE', 'NAMA AKUN', 'BAGIAN / UNIT', 'PAGU AWAL', 'PAGU AKTIF', 'REALISASI', 'SISA', 'SERAPAN'].map((head) => (
                    <TableHead key={head} className={`text-[11px] font-extrabold ${head === 'SERAPAN' ? 'text-center' : ''} ${isDark ? "text-gray-400" : "text-slate-600"}`}>{head}</TableHead>
                  ))}
                </TableRow></TableHeader>
                <TableBody>
                  {filteredPagu.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="py-10 text-center text-xs text-slate-500">Tidak ada data pagu untuk filter ini.</TableCell></TableRow>
                  ) : filteredPagu.map((item) => {
                    const percentage = item.persentase_serapan || 0
                    return (
                      <TableRow key={item.id_pagu}>
                        <TableCell className="font-mono text-xs font-bold text-red-600 dark:text-red-400">{item.kode_akun}</TableCell>
                        <TableCell className={`max-w-[220px] text-xs font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{item.nama_akun}</TableCell>
                        <TableCell className={`text-xs font-semibold ${isDark ? "text-gray-300" : "text-slate-600"}`}>{item.nama_bagian || "-"}</TableCell>
                        <TableCell className={`whitespace-nowrap text-xs font-semibold ${isDark ? "text-gray-400" : "text-slate-500"}`}>{formatRupiah(item.pagu_awal)}</TableCell>
                        <TableCell className={`whitespace-nowrap text-xs font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{formatRupiah(item.pagu_aktif)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs font-bold text-red-600 dark:text-red-400">{formatRupiah(item.total_realisasi_verified)}</TableCell>
                        <TableCell className={`whitespace-nowrap text-xs font-bold ${item.sisa_anggaran < 0 ? "text-rose-500" : isDark ? "text-emerald-400" : "text-emerald-600"}`}>{formatRupiah(item.sisa_anggaran)}</TableCell>
                        <TableCell><div className="flex min-w-[105px] items-center justify-center gap-2"><div className={`h-2 flex-1 overflow-hidden rounded-full ${isDark ? "bg-slate-800" : "bg-slate-200"}`}><div className="h-full rounded-full bg-red-600" style={{ width: `${Math.min(percentage, 100)}%` }} /></div><span className="text-[11px] font-bold text-red-600 dark:text-red-400">{percentage}%</span></div></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <div className={`border-t p-4 text-xs ${isDark ? "border-white/10 text-gray-400" : "border-slate-200 text-slate-600"}`}>Menampilkan {filteredPagu.length} data pagu anggaran</div>
            </CardContent>
          </Card>
        </>
      )}

      {/* TAB 2: REVISI ANGGARAN & AUDIT TRAIL (IMMUTABLE) */}
      {!loading && activeTab === "revisi" && (
        <Card className={`${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} overflow-hidden rounded-2xl shadow-lg backdrop-blur-md`}>
          <CardContent className="p-0">
            <div className={`p-4 border-b text-xs font-semibold flex items-center justify-between ${isDark ? "border-white/10 bg-[#0a0f1d]/50 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
              <span>Jejak Audit Pergeseran & Revisi Anggaran (BPK/KPU Compliant)</span>
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                Immutable History Enforced
              </span>
            </div>
            <Table>
              <TableHeader><TableRow className={isDark ? "bg-[#0a0f1d]" : "bg-slate-50"}>
                {['NO. REVISI', 'TANGGAL', 'PAGU SEBELUM', 'PAGU SESUDAH', 'PERUBAHAN NETTO', 'ALASAN REVISI', 'DIEKSEKUSI OLEH'].map((head) => (
                  <TableHead key={head} className={`text-[11px] font-extrabold ${isDark ? "text-gray-400" : "text-slate-600"}`}>{head}</TableHead>
                ))}
              </TableRow></TableHeader>
              <TableBody>
                {filteredRevisi.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-10 text-center text-xs text-slate-500">Belum ada riwayat revisi anggaran pada tahun ini.</TableCell></TableRow>
                ) : filteredRevisi.map((item) => {
                  const difference = item.perubahan_netto
                  return (
                    <TableRow key={item.id_revisi}>
                      <TableCell className="whitespace-nowrap font-mono text-xs font-bold text-red-600 dark:text-red-400">{item.nomor_revisi}</TableCell>
                      <TableCell className={`whitespace-nowrap text-xs ${isDark ? "text-gray-300" : "text-slate-600"}`}>{item.tanggal_revisi}</TableCell>
                      <TableCell className={`whitespace-nowrap text-xs font-semibold ${isDark ? "text-gray-200" : "text-slate-700"}`}>{formatRupiah(item.pagu_sebelum)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs font-bold text-red-600 dark:text-red-400">{formatRupiah(item.pagu_sesudah)}</TableCell>
                      <TableCell className={`whitespace-nowrap text-xs font-bold ${difference >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {difference >= 0 ? "+" : "−"}{formatRupiah(Math.abs(difference))}
                      </TableCell>
                      <TableCell className={`max-w-[240px] truncate text-xs ${isDark ? "text-gray-300" : "text-slate-600"}`} title={item.alasan_revisi}>{item.alasan_revisi}</TableCell>
                      <TableCell className={`whitespace-nowrap text-xs font-semibold ${isDark ? "text-gray-400" : "text-slate-600"}`}>{item.nama_pegawai || "Administrator"}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <div className={`border-t p-4 text-xs ${isDark ? "border-white/10 text-gray-400" : "border-slate-200 text-slate-600"}`}>Menampilkan {filteredRevisi.length} catatan audit trail revisi</div>
          </CardContent>
        </Card>
      )}

      {/* MODAL TAMBAH REVISI DIPA (PHASE 12 ATOMIC EXECUTION) */}
      {modalType === "revisi" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className={`w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl ${isDark ? "bg-[#0f172a] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-white/10 bg-[#0a0f1d]" : "border-slate-200 bg-slate-50"}`}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">TA {selectedTAYear}</p>
                <h2 className="text-sm font-bold">Eksekusi Revisi Anggaran / DIPA</h2>
              </div>
              <button type="button" onClick={closeModal} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/15 hover:text-red-500 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submitRevisi} className="space-y-4 p-5 text-xs">
              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-1 font-semibold">
                  Nomor Surat/SK Revisi
                  <input
                    required
                    value={formNomorRevisi}
                    onChange={(e) => setFormNomorRevisi(e.target.value)}
                    placeholder="Contoh: REV-001/2026"
                    className={inputClass}
                  />
                </label>
                <label className="space-y-1 font-semibold">
                  Tanggal Revisi
                  <input
                    required
                    type="date"
                    value={formTanggalRevisi}
                    onChange={(e) => setFormTanggalRevisi(e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>

              <label className="block space-y-1 font-semibold">
                Akun Pagu Anggaran
                <select
                  required
                  value={formPaguId}
                  onChange={(e) => handlePaguChange(Number(e.target.value))}
                  className={inputClass}
                >
                  <option value="">-- Pilih Akun Pagu --</option>
                  {paguList.map((p) => (
                    <option key={p.id_pagu} value={p.id_pagu}>
                      {p.kode_akun} — {p.nama_akun} (Pagu Aktif: {formatRupiah(p.pagu_aktif)})
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-1 font-semibold">
                  Pagu Sebelum
                  <input readOnly value={formatRupiah(formPaguSebelum)} className={`${inputClass} opacity-70`} />
                </label>
                <label className="space-y-1 font-semibold">
                  Pagu Baru Setelah Revisi (Rp)
                  <input
                    required
                    min={0}
                    type="number"
                    value={formPaguBaru}
                    onChange={(e) => setFormPaguBaru(Number(e.target.value))}
                    className={inputClass}
                  />
                </label>
              </div>

              <label className="block space-y-1 font-semibold">
                Alasan Revisi / Pergeseran (Minimal 5 karakter)
                <textarea
                  required
                  rows={3}
                  value={formAlasanRevisi}
                  onChange={(e) => setFormAlasanRevisi(e.target.value)}
                  placeholder="Jelaskan dasar pertimbangan perubahan pagu..."
                  className={inputClass}
                />
              </label>

              <div className={`rounded-xl border p-3 ${isDark ? "border-red-500/20 bg-red-950/20" : "border-red-200 bg-red-50"}`}>
                <span className="text-slate-500">Perubahan Netto: </span>
                <strong className={formPaguBaru - formPaguSebelum >= 0 ? "text-emerald-500" : "text-rose-500"}>
                  {formPaguBaru - formPaguSebelum >= 0 ? "+" : "−"}{formatRupiah(Math.abs(formPaguBaru - formPaguSebelum))}
                </strong>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className={`rounded-xl border px-4 py-2 font-bold cursor-pointer ${isDark ? "border-white/10 text-gray-300" : "border-slate-300 text-slate-700"}`}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-kpu-red flex items-center gap-2 rounded-xl px-5 py-2 font-bold text-white cursor-pointer shadow-md hover:opacity-95"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Menyimpan..." : "Eksekusi Revisi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
