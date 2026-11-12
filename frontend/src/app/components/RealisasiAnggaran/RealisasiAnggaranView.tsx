import { useState, useEffect, useRef } from "react"
import {
  TrendingUp,
  FileText,
  Filter,
  Search,
  Plus,
  FileSpreadsheet,
  Wallet,
  Layers,
  PieChart,
  FileCheck,
  ChevronDown,
  RefreshCw,
  AlertCircle
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { Badge } from "../ui/badge"
import type {
  TahunAnggaranResponse,
  BagianResponse,
  AkunAnggaranResponse,
  RealisasiAnggaranResponse,
  DashboardSummaryResponse,
  MonthlyReportResponse
} from "./types"
import { TambahRealisasiModal } from "./TambahRealisasiModal"
import { LaporanBulananModal } from "./LaporanBulananModal"
import { useAuth } from "../../context/AuthContext"
import {
  tahunAnggaranApi,
  bagianApi,
  akunAnggaranApi,
  realisasiAnggaranApi,
  dashboardAnggaranApi
} from "../../../services/api"

export type RealisasiSubTab = "ringkasan" | "transaksi" | "laporan" | "verifikasi"

interface Props {
  theme: "light" | "dark"
  subTab?: RealisasiSubTab
  onNavigate?: (tab: string) => void
}

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
]

export function RealisasiAnggaranView({ theme, subTab = "ringkasan", onNavigate }: Props) {
  const isDark = theme === "dark"
  const readOnly = !useAuth().canEdit("anggaran")

  // Master Filter Options
  const [tahunList, setTahunList] = useState<TahunAnggaranResponse[]>([])
  const [bagianList, setBagianList] = useState<BagianResponse[]>([])
  const [akunList, setAkunList] = useState<AkunAnggaranResponse[]>([])

  // Global Filter Selections
  const [selectedTahunId, setSelectedTahunId] = useState<number | null>(null)
  const [selectedBagianId, setSelectedBagianId] = useState<number | null>(null)
  const [selectedAkunId, setSelectedAkunId] = useState<number | null>(null)
  const [selectedBulan, setSelectedBulan] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // Server-side Data
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null)
  const [realisasiList, setRealisasiList] = useState<RealisasiAnggaranResponse[]>([])
  const [report, setReport] = useState<MonthlyReportResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isLaporanOpen, setIsLaporanOpen] = useState(false)

  // Request race protection
  const reqIdRef = useRef<number>(0)

  // Init Master Data
  useEffect(() => {
    let isMounted = true
    const initMaster = async () => {
      try {
        const [taRes, bagRes, akunRes] = await Promise.all([
          tahunAnggaranApi.getAll({ limit: 100 }),
          bagianApi.getAll({ limit: 100 }).catch(() => []),
          akunAnggaranApi.getAll({ status: "active", limit: 200 }).catch(() => ({ total: 0, items: [] })),
        ])

        if (!isMounted) return
        setTahunList(taRes.items)
        setBagianList(bagRes)
        setAkunList(akunRes.items)

        const activeTa = taRes.items.find((item) => item.status === "active")
        if (activeTa) {
          setSelectedTahunId(activeTa.id_tahun_anggaran)
        } else if (taRes.items.length > 0) {
          setSelectedTahunId(taRes.items[0].id_tahun_anggaran)
        }
      } catch (err: any) {
        if (isMounted) setError("Gagal memuat master referensi")
      }
    }

    initMaster()
    return () => {
      isMounted = false
    }
  }, [])

  // Fetch Data Server-side
  const refetchData = async () => {
    const currentReqId = ++reqIdRef.current
    setLoading(true)
    setError(null)

    try {
      const [sumRes, realRes, repRes] = await Promise.all([
        dashboardAnggaranApi.getSummary({
          id_tahun_anggaran: selectedTahunId ?? undefined,
          id_bagian: selectedBagianId ?? undefined,
          id_akun_anggaran: selectedAkunId ?? undefined,
          bulan: selectedBulan ?? undefined,
        }),
        realisasiAnggaranApi.getAll({
          id_tahun_anggaran: selectedTahunId ?? undefined,
          id_bagian: selectedBagianId ?? undefined,
          id_akun_anggaran: selectedAkunId ?? undefined,
          bulan: selectedBulan ?? undefined,
          search: searchQuery.trim() || undefined,
          limit: 100,
        }),
        dashboardAnggaranApi.getMonthlyReport({
          id_tahun_anggaran: selectedTahunId ?? undefined,
          id_bagian: selectedBagianId ?? undefined,
          id_akun_anggaran: selectedAkunId ?? undefined,
        }),
      ])

      if (currentReqId === reqIdRef.current) {
        setSummary(sumRes)
        setRealisasiList(realRes.items)
        setReport(repRes)
        setLoading(false)
      }
    } catch (err: any) {
      if (currentReqId === reqIdRef.current) {
        setError(err.message || "Gagal memuat data dari backend")
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    refetchData()
  }, [selectedTahunId, selectedBagianId, selectedAkunId, selectedBulan, searchQuery])

  // Formatting helpers
  const formatMiliar = (val: number | string) => {
    const num = Number(val) || 0
    return (num / 1_000_000_000).toFixed(2)
  }

  const formatRupiah = (val: number | string) => {
    const num = Number(val) || 0
    return `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(num))}`
  }

  const currentTa = tahunList.find((t) => t.id_tahun_anggaran === selectedTahunId)
  const displayYear = summary?.tahun ?? currentTa?.tahun ?? new Date().getFullYear()

  // Monthly recap
  const monthlyRecap = summary?.monthly_recap || []
  const maxMonthlyRealisasi = Math.max(
    ...monthlyRecap.map((m) => Number(m.total_realisasi_verified) || 0),
    1
  )
  const chartMaxMiliar = Math.max(Math.ceil((maxMonthlyRealisasi / 1_000_000_000) * 1.2), 5)

  const selectClass = `rounded-xl border px-3 py-2 text-xs font-bold outline-none cursor-pointer transition-colors ${
    isDark
      ? "bg-[#0f172a] border-white/10 text-white focus:border-red-500"
      : "bg-white border-slate-300 text-slate-900 focus:border-red-500"
  }`

  const pageTitle = {
    ringkasan: "Dashboard Realisasi Anggaran",
    transaksi: "Daftar Transaksi Realisasi",
    laporan: "Laporan Realisasi Bulanan",
    verifikasi: "Verifikasi & Audit Realisasi",
  }

  // Convert realisasi list to compatibility TransaksiRealisasi for LaporanBulananModal
  const modalTransaksiList = realisasiList.map((r) => ({
    id: String(r.id_realisasi),
    tanggal: r.tanggal_transaksi,
    noDokumen: r.nomor_dokumen,
    kodeAkun: r.kode_akun || "—",
    namaAkun: r.nama_akun || "—",
    subbagian: r.nama_bagian || "Umum",
    usulanKegiatan: r.uraian_kegiatan,
    jumlah: Number(r.jumlah_realisasi) || 0,
    buktiFile: r.bukti_file_nama || null,
    status: (r.status === "verified"
      ? "Disetujui"
      : r.status === "rejected"
      ? "Ditolak"
      : "Menunggu Verifikasi") as any,
    periode: r.periode || "2026",
  }))

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Dynamic Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
            Realisasi Anggaran TA {displayYear}
          </p>
          <h1 className={`text-xl font-bold tracking-tight my-0 ${isDark ? "text-white" : "text-black"}`}>
            {pageTitle[subTab]}
          </h1>
          <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
            Portal Pemantauan & Direct Realisasi Anggaran PTP KPU Provinsi Sulawesi Utara
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={refetchData}
            disabled={loading}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              isDark
                ? "border-white/10 bg-[#1e293b] text-white hover:bg-slate-800"
                : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
            }`}
            title="Segarkan Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-red-500" : ""}`} />
          </button>

          {!readOnly && (
            <button
              type="button"
              onClick={() => setIsFormOpen(true)}
              className="btn-kpu-red px-4 py-2 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Realisasi</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsLaporanOpen(true)}
            className={`px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-all active:scale-95 shadow-xs ${
              isDark
                ? "border-slate-700 bg-slate-900 text-white hover:bg-slate-800"
                : "border-slate-300 bg-white text-black hover:bg-slate-50"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-red-600" />
            <span>Laporan CSV</span>
          </button>
        </div>
      </div>

      {/* Global Filter Bar (Server-side parameters) */}
      <div
        className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
          isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"
        } backdrop-blur-md shadow-lg`}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 font-bold text-red-600 text-xs">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter Server:</span>
          </div>

          {/* TA Selector */}
          <select
            value={selectedTahunId ?? ""}
            onChange={(e) => {
              setSelectedTahunId(e.target.value ? Number(e.target.value) : null)
              setSelectedAkunId(null)
            }}
            className={selectClass}
            aria-label="Filter Tahun"
          >
            {tahunList.map((t) => (
              <option key={t.id_tahun_anggaran} value={t.id_tahun_anggaran}>
                TA {t.tahun} ({t.status})
              </option>
            ))}
          </select>

          {/* Bagian Selector */}
          <select
            value={selectedBagianId ?? ""}
            onChange={(e) => {
              setSelectedBagianId(e.target.value ? Number(e.target.value) : null)
              setSelectedAkunId(null)
            }}
            className={selectClass}
            aria-label="Filter Bagian"
          >
            <option value="">Semua Bagian</option>
            {bagianList.map((b) => (
              <option key={b.id_bagian} value={b.id_bagian}>
                {b.nama_bagian}
              </option>
            ))}
          </select>

          {/* Akun MAK Selector */}
          <select
            value={selectedAkunId ?? ""}
            onChange={(e) => setSelectedAkunId(e.target.value ? Number(e.target.value) : null)}
            className={`${selectClass} max-w-xs truncate`}
            aria-label="Filter Akun"
          >
            <option value="">Semua Akun MAK</option>
            {akunList.map((a) => (
              <option key={a.id_akun_anggaran} value={a.id_akun_anggaran}>
                {a.kode_akun} - {a.nama_akun}
              </option>
            ))}
          </select>

          {/* Bulan Selector (1-12) Server-side */}
          <select
            value={selectedBulan ?? ""}
            onChange={(e) => setSelectedBulan(e.target.value ? Number(e.target.value) : null)}
            className={selectClass}
            aria-label="Filter Bulan"
          >
            <option value="">Semua Bulan (1–12)</option>
            {MONTH_NAMES.map((name, idx) => (
              <option key={idx + 1} value={idx + 1}>
                Bulan {idx + 1} - {name}
              </option>
            ))}
          </select>
        </div>

        {/* Search Input */}
        <div className="relative min-w-56">
          <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-gray-400" : "text-slate-500"}`} />
          <input
            type="text"
            placeholder="Cari Dokumen / Uraian..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-3 py-2 text-xs font-semibold rounded-xl border outline-none ${
              isDark
                ? "bg-[#131b2e] border-[#1e293b] text-white placeholder-gray-500"
                : "bg-slate-50 border-slate-300 text-black placeholder-slate-400"
            }`}
          />
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={refetchData} className="underline text-xs font-bold cursor-pointer">
            Coba Lagi
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. RINGKASAN SUBTAB (MACRO METRICS & MONTHLY TREND) */}
      {/* ========================================================================= */}
      {(subTab === "ringkasan" || !subTab) && (
        <div className="space-y-6">
          {/* 4 Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4">
            {/* Total Pagu */}
            <Card className={`relative overflow-hidden transition-all ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
              <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600"></div>
              <CardContent className={`m-3 ml-4 p-4 rounded-xl border flex items-center justify-between min-h-[118px] ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                <div className="flex-1 flex flex-col justify-center min-w-0 pr-2">
                  <p className={`text-[11px] font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                    TOTAL PAGU ANGGARAN
                  </p>
                  <h2 className={`text-2xl font-black mt-1 truncate ${isDark ? "text-white" : "text-black"}`}>
                    Rp {formatMiliar(summary?.total_pagu_aktif ?? 0)} M
                  </h2>
                  <p className={`text-[10px] font-bold mt-1 truncate ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                    {formatRupiah(summary?.total_pagu_aktif ?? 0)}
                  </p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Wallet className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>

            {/* Total Realisasi */}
            <Card className={`relative overflow-hidden transition-all ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
              <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600"></div>
              <CardContent className={`m-3 ml-4 p-4 rounded-xl border flex items-center justify-between min-h-[118px] ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                <div className="flex-1 flex flex-col justify-center min-w-0 pr-2">
                  <p className={`text-[11px] font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                    TOTAL REALISASI VERIFIED
                  </p>
                  <h2 className={`text-2xl font-black mt-1 truncate ${isDark ? "text-white" : "text-black"}`}>
                    Rp {formatMiliar(summary?.total_realisasi_verified ?? 0)} M
                  </h2>
                  <p className={`text-[10px] font-bold flex items-center gap-1 mt-1 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                    <TrendingUp className="w-3.5 h-3.5 text-red-500" />
                    <span>{summary?.total_transaksi_verified ?? 0} Transaksi Terverifikasi</span>
                  </p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <FileCheck className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>

            {/* Sisa Anggaran */}
            <Card className={`relative overflow-hidden transition-all ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
              <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600"></div>
              <CardContent className={`m-3 ml-4 p-4 rounded-xl border flex items-center justify-between min-h-[118px] ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                <div className="flex-1 flex flex-col justify-center min-w-0 pr-2">
                  <p className={`text-[11px] font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                    SISA ANGGARAN
                  </p>
                  <h2 className={`text-2xl font-black mt-1 truncate ${isDark ? "text-white" : "text-black"}`}>
                    Rp {formatMiliar(summary?.total_sisa_anggaran ?? 0)} M
                  </h2>
                  <p className={`text-[10px] font-bold mt-1 truncate ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                    {formatRupiah(summary?.total_sisa_anggaran ?? 0)}
                  </p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Layers className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>

            {/* Persentase Realisasi */}
            <Card className={`relative overflow-hidden transition-all ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
              <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600"></div>
              <CardContent className={`m-3 ml-4 p-4 rounded-xl border flex flex-col justify-center gap-3 min-h-[118px] ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                <div className="pt-1">
                  <p className={`text-[11px] font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                    PERSENTASE PENYERAPAN
                  </p>
                  <div className="flex items-baseline justify-between mt-1">
                    <h2 className={`text-2xl font-black tracking-tight ${isDark ? "text-white" : "text-black"}`}>
                      {(summary?.persentase_serapan ?? 0).toFixed(2)}%
                    </h2>
                    <span className={`text-[10px] font-bold ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                      TA {displayYear}
                    </span>
                  </div>
                </div>

                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-600 transition-all duration-500"
                    style={{ width: `${Math.min(100, summary?.persentase_serapan ?? 0)}%` }}
                  ></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tren Realisasi Bulanan (Monthly Recap 12 Bulan) */}
          <Card className={`min-w-0 overflow-hidden flex flex-col ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="min-w-0">
                <CardTitle className={`text-base font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>
                  Tren Realisasi Bulanan (Recap 12 Bulan)
                </CardTitle>
                <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] mt-2 font-semibold ${isDark ? "text-gray-300" : "text-slate-600"}`}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-t from-red-700 to-red-500" />
                    Realisasi terverifikasi
                  </span>
                </div>
              </div>
              <span className="shrink-0 rounded-lg border border-red-500/20 bg-red-600/10 px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-300">
                TA {displayYear}
              </span>
            </CardHeader>
            <CardContent className="pt-5 flex-1 flex flex-col gap-4 min-h-0">
              <div className={`relative flex-1 min-h-[320px] w-full overflow-hidden border rounded-xl ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                <div className={`absolute left-3 top-7 bottom-11 w-8 flex flex-col justify-between text-[9px] font-semibold ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                  {[
                    `${chartMaxMiliar} M`,
                    `${(chartMaxMiliar * 0.75).toFixed(1)} M`,
                    `${(chartMaxMiliar * 0.5).toFixed(1)} M`,
                    `${(chartMaxMiliar * 0.25).toFixed(1)} M`,
                    "0",
                  ].map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>

                <div className="absolute left-12 right-4 top-7 bottom-11">
                  {[0, 25, 50, 75, 100].map((position) => (
                    <div
                      key={position}
                      className={`absolute left-0 right-0 border-t ${isDark ? "border-white/[0.07]" : "border-slate-200"}`}
                      style={{ top: `${position}%` }}
                    />
                  ))}

                  <div className="relative z-10 grid h-full grid-cols-12 items-end gap-1.5 sm:gap-2.5">
                    {monthlyRecap.map((item) => {
                      const realisasiNum = Number(item.total_realisasi_verified) || 0
                      const realisasiMiliar = realisasiNum / 1_000_000_000
                      const heightPct = Math.min((realisasiMiliar / chartMaxMiliar) * 100, 100)
                      const hasValue = realisasiNum > 0

                      return (
                        <div key={item.bulan} className="group relative flex h-full min-w-0 items-end justify-center">
                          <div
                            style={{ height: hasValue ? `${Math.max(6, heightPct)}%` : "4px" }}
                            className={`relative w-full max-w-8 rounded-t-md transition-all duration-200 ${
                              hasValue
                                ? "bg-gradient-to-t from-red-800 via-red-700 to-red-500 shadow-[0_0_18px_rgba(220,38,38,0.15)] group-hover:brightness-110"
                                : isDark
                                ? "bg-slate-700/60"
                                : "bg-slate-300"
                            }`}
                          >
                            {hasValue && (
                              <div className="pointer-events-none absolute -top-12 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-[9px] font-bold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 flex flex-col items-center">
                                <span>{item.nama_bulan}</span>
                                <span className="text-red-400">Rp {realisasiMiliar.toFixed(2)} M</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="absolute bottom-3 left-12 right-4 grid grid-cols-12 gap-1.5 sm:gap-2.5">
                  {monthlyRecap.map((item) => (
                    <span
                      key={item.bulan}
                      className={`truncate text-center text-[9px] sm:text-[10px] font-bold ${
                        isDark ? "text-gray-300" : "text-slate-700"
                      }`}
                    >
                      {item.nama_bulan.substring(0, 3)}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. TRANSAKSI SUBTAB (DIRECT REALISASI RESULTS) */}
      {/* ========================================================================= */}
      {subTab === "transaksi" && (
        <div className="space-y-6">

          <Card className={`${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl overflow-hidden`}>
            <CardHeader className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <CardTitle className={`text-base font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>
                Daftar Transaksi Realisasi ({realisasiList.length} Transaksi)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className={isDark ? "border-b border-white/20 bg-[#0a0e1a]" : "border-b border-slate-200 bg-slate-100"}>
                    <TableHead className={`text-[11px] font-extrabold ${isDark ? "text-white" : "text-black"}`}>No. Dokumen</TableHead>
                    <TableHead className={`text-[11px] font-extrabold ${isDark ? "text-white" : "text-black"}`}>Tanggal</TableHead>
                    <TableHead className={`text-[11px] font-extrabold ${isDark ? "text-white" : "text-black"}`}>Akun Anggaran</TableHead>
                    <TableHead className={`text-[11px] font-extrabold ${isDark ? "text-white" : "text-black"}`}>Bagian</TableHead>
                    <TableHead className={`text-[11px] font-extrabold ${isDark ? "text-white" : "text-black"}`}>Uraian Kegiatan</TableHead>
                    <TableHead className={`text-[11px] font-extrabold text-right ${isDark ? "text-white" : "text-black"}`}>Jumlah (Rp)</TableHead>
                    <TableHead className={`text-[11px] font-extrabold text-center ${isDark ? "text-white" : "text-black"}`}>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-xs text-slate-500">
                        Memuat transaksi realisasi...
                      </TableCell>
                    </TableRow>
                  ) : realisasiList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-xs text-slate-500">
                        Tidak ada transaksi realisasi sesuai filter yang dipilih.
                      </TableCell>
                    </TableRow>
                  ) : (
                    realisasiList.map((item) => (
                      <TableRow key={item.id_realisasi} className={isDark ? "border-b border-white/10" : "border-b border-slate-100"}>
                        <TableCell className="text-xs font-bold text-red-600 dark:text-red-400">
                          {item.nomor_dokumen}
                        </TableCell>
                        <TableCell className={`text-xs font-semibold whitespace-nowrap ${isDark ? "text-gray-300" : "text-black"}`}>
                          {item.tanggal_transaksi}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className={`font-bold block ${isDark ? "text-white" : "text-black"}`}>{item.kode_akun}</span>
                          <span className={`text-[11px] font-semibold ${isDark ? "text-gray-300" : "text-slate-800"}`}>{item.nama_akun}</span>
                        </TableCell>
                        <TableCell className={`text-xs font-bold ${isDark ? "text-gray-200" : "text-black"}`}>
                          {item.nama_bagian || "Umum"}
                        </TableCell>
                        <TableCell className={`font-bold text-xs truncate max-w-xs ${isDark ? "text-white" : "text-black"}`}>
                          {item.uraian_kegiatan}
                        </TableCell>
                        <TableCell className="text-xs font-black text-red-600 dark:text-red-400 text-right whitespace-nowrap">
                          {formatRupiah(item.jumlah_realisasi)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={
                              item.status === "verified"
                                ? "success"
                                : item.status === "rejected"
                                ? "outline"
                                : "draft"
                            }
                          >
                            {item.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. LAPORAN SUBTAB (12-MONTH MATRIX FROM BACKEND) */}
      {/* ========================================================================= */}
      {subTab === "laporan" && (
        <div className="space-y-6">
          <Card className={`${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
            <CardHeader className="p-5 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <CardTitle className={`text-base font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>
                  Laporan Realisasi Bulanan (TA {report?.tahun ?? displayYear})
                </CardTitle>
                <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                  Matriks agregasi realisasi 12 bulan dari endpoint backend /monthly-report
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsLaporanOpen(true)}
                className="btn-kpu-red px-4 py-2 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer transition-all active:scale-95"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Unduh Laporan (.csv)</span>
              </button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[1200px]">
                  <TableHeader>
                    <TableRow className={isDark ? "border-b border-white/20 bg-[#0a0e1a]" : "border-b border-slate-200 bg-slate-100"}>
                      <TableHead className={`text-[11px] font-extrabold ${isDark ? "text-white" : "text-black"}`}>KODE AKUN</TableHead>
                      <TableHead className={`text-[11px] font-extrabold ${isDark ? "text-white" : "text-black"}`}>NAMA AKUN</TableHead>
                      <TableHead className={`text-[11px] font-extrabold ${isDark ? "text-white" : "text-black"}`}>BAGIAN</TableHead>
                      <TableHead className={`text-[11px] font-extrabold text-right ${isDark ? "text-white" : "text-black"}`}>PAGU (RP)</TableHead>
                      <TableHead className={`text-[11px] font-extrabold text-right ${isDark ? "text-white" : "text-black"}`}>REALISASI (RP)</TableHead>
                      <TableHead className={`text-[11px] font-extrabold text-right ${isDark ? "text-white" : "text-black"}`}>SISA (RP)</TableHead>
                      <TableHead className={`text-[11px] font-extrabold text-right ${isDark ? "text-white" : "text-black"}`}>%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report?.rows.map((row) => (
                      <TableRow key={row.id_akun_anggaran} className={isDark ? "border-b border-white/10" : "border-b border-slate-100"}>
                        <TableCell className="text-xs font-bold text-red-600 dark:text-red-400">{row.kode_akun}</TableCell>
                        <TableCell className={`text-xs font-bold ${isDark ? "text-white" : "text-black"}`}>{row.nama_akun}</TableCell>
                        <TableCell className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-slate-800"}`}>{row.nama_bagian || "Umum"}</TableCell>
                        <TableCell className={`text-xs font-bold text-right ${isDark ? "text-gray-200" : "text-black"}`}>{formatRupiah(row.pagu)}</TableCell>
                        <TableCell className="text-xs font-black text-red-600 dark:text-red-400 text-right">{formatRupiah(row.total_realisasi)}</TableCell>
                        <TableCell className={`text-xs font-bold text-right ${isDark ? "text-gray-300" : "text-slate-800"}`}>{formatRupiah(row.sisa_anggaran)}</TableCell>
                        <TableCell className="text-xs font-black text-red-600 dark:text-red-400 text-right">{row.persentase_realisasi.toFixed(2)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. VERIFIKASI SUBTAB */}
      {/* ========================================================================= */}
      {subTab === "verifikasi" && (
        <div className="space-y-6">
          <Card className={`${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
            <CardHeader className="p-5 pb-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <CardTitle className={`text-base font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>
                  Audit Verifikasi Realisasi Keuangan (Direct Validated)
                </CardTitle>
                <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                  Catatan audit sistem validasi otomatis dan verifikasi transaksi
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className={isDark ? "border-b border-white/20 bg-[#0a0e1a]" : "border-b border-slate-200 bg-slate-100"}>
                    <TableHead className={`text-[11px] font-extrabold ${isDark ? "text-white" : "text-black"}`}>NO. DOKUMEN</TableHead>
                    <TableHead className={`text-[11px] font-extrabold ${isDark ? "text-white" : "text-black"}`}>URAIAN</TableHead>
                    <TableHead className={`text-[11px] font-extrabold text-right ${isDark ? "text-white" : "text-black"}`}>JUMLAH</TableHead>
                    <TableHead className={`text-[11px] font-extrabold ${isDark ? "text-white" : "text-black"}`}>STATUS & CATATAN</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {realisasiList.map((t) => (
                    <TableRow key={t.id_realisasi} className={isDark ? "border-b border-white/10" : "border-b border-slate-100"}>
                      <TableCell className="text-xs font-bold text-red-600 dark:text-red-400">{t.nomor_dokumen}</TableCell>
                      <TableCell className={`text-xs font-semibold ${isDark ? "text-white" : "text-black"}`}>
                        {t.uraian_kegiatan}
                      </TableCell>
                      <TableCell className="text-xs font-black text-red-600 dark:text-red-400 text-right">{formatRupiah(t.jumlah_realisasi)}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant={t.status === "verified" ? "success" : "draft"}>
                          {t.status}
                        </Badge>
                        <span className="block text-[10px] text-slate-400 mt-0.5">
                          {t.catatan_verifikasi || "Validasi otomatis sistem (Direct Realisasi)"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modals */}
      <TambahRealisasiModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={refetchData}
        theme={theme}
      />

      <LaporanBulananModal
        isOpen={isLaporanOpen}
        onClose={() => setIsLaporanOpen(false)}
        transaksiList={modalTransaksiList}
        theme={theme}
      />
    </div>
  )
}
