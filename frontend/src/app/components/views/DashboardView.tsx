import { useState, useEffect, useRef } from "react"
import {
  Mail,
  Archive,
  TrendingUp,
  Wallet,
  FileCheck,
  RefreshCw,
  AlertCircle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Badge } from "../ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { DashboardChart, type MonthlyDocumentStat } from "../ui/chart"
import { request } from "../../../services/operations"
import {
  tahunAnggaranApi,
  bagianApi,
  akunAnggaranApi,
  dashboardAnggaranApi
} from "../../../services/api"
import type {
  TahunAnggaranResponse,
  BagianResponse,
  AkunAnggaranResponse,
  DashboardSummaryResponse
} from "../RealisasiAnggaran/types"

interface DashboardOverview {
  year: number
  surat_masuk_aktif: number
  surat_perlu_tindakan: number
  arsip_total: number
  arsip_bulan_ini: number
  monthly: MonthlyDocumentStat[]
  recent_letters: {
    id: number
    kind: "masuk" | "keluar"
    number: string | null
    subject: string
    sender: string
    recipient: string
    date: string
    status: string
  }[]
  recent_activity: {
    type: "surat" | "arsip" | "anggaran"
    action: string
    title: string
    actor: string | null
    at: string
  }[]
}

type BadgeVariant = "terkirim" | "diterima" | "diproses" | "draft" | "success" | "warning" | "secondary"

/** Display labels for workflow-letter states stored by the backend. */
const LETTER_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Draft", variant: "draft" },
  submitted: { label: "Diajukan", variant: "diproses" },
  revision: { label: "Perlu Revisi", variant: "warning" },
  approved: { label: "Disetujui", variant: "terkirim" },
  registered: { label: "Diregistrasi", variant: "diterima" },
  assigned: { label: "Didisposisikan", variant: "diproses" },
  completed: { label: "Selesai", variant: "success" },
  archived: { label: "Diarsipkan", variant: "secondary" },
}

const ACTION_LABEL: Record<string, string> = {
  create: "dibuat",
  submit: "diajukan",
  revise: "dikembalikan untuk revisi",
  approve: "disetujui",
  assign: "didisposisikan",
  complete: "diselesaikan",
  archive: "diarsipkan",
  edit: "diubah",
  upload: "diunggah ke arsip",
  verify: "diverifikasi",
  reject: "ditolak",
  delete: "dihapus",
}

const ACTIVITY_ICON = { surat: Mail, arsip: Archive, anggaran: Wallet } as const
const ACTIVITY_NOUN = { surat: "Surat", arsip: "Dokumen", anggaran: "Realisasi" } as const

function relativeTime(iso: string): string {
  const then = new Date(iso)
  const minutes = Math.round((Date.now() - then.getTime()) / 60000)
  if (minutes < 1) return "Baru saja"
  if (minutes < 60) return `${minutes} menit lalu`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} hari lalu`
  return then.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

export function DashboardView({ theme }: { theme: "light" | "dark" }) {
  const isDark = theme === "dark"

  // Dropdown options
  const [tahunList, setTahunList] = useState<TahunAnggaranResponse[]>([])
  const [bagianList, setBagianList] = useState<BagianResponse[]>([])
  const [akunList, setAkunList] = useState<AkunAnggaranResponse[]>([])

  // Filter selections
  const [selectedTahunId, setSelectedTahunId] = useState<number | null>(null)
  const [selectedBagianId, setSelectedBagianId] = useState<number | null>(null)
  const [selectedAkunId, setSelectedAkunId] = useState<number | null>(null)

  // Data states
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Race condition protection
  const requestIdRef = useRef<number>(0)

  // Letters, archives and activity (scoped to the user by the backend)
  const [overview, setOverview] = useState<DashboardOverview | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [overviewLoading, setOverviewLoading] = useState<boolean>(true)

  // Initial load of master options
  useEffect(() => {
    let isMounted = true
    const initMaster = async () => {
      try {
        const [taRes, bagRes] = await Promise.all([
          tahunAnggaranApi.getAll({ limit: 100 }),
          bagianApi.getAll({ limit: 100 }).catch(() => []),
        ])

        if (!isMounted) return
        setTahunList(taRes.items)
        setBagianList(bagRes)

        // Default choose active year, fallback to first year
        const activeTa = taRes.items.find((item) => item.status === "active")
        if (activeTa) {
          setSelectedTahunId(activeTa.id_tahun_anggaran)
        } else if (taRes.items.length > 0) {
          setSelectedTahunId(taRes.items[0].id_tahun_anggaran)
        }
      } catch (err) {
        if (isMounted) setError("Gagal memuat master referensi dashboard")
      }
    }

    initMaster()
    return () => {
      isMounted = false
    }
  }, [])

  // Load Akun list when Bagian filter changes
  useEffect(() => {
    let isMounted = true
    const loadAkun = async () => {
      try {
        const akunRes = await akunAnggaranApi.getAll({
          id_bagian: selectedBagianId !== null ? selectedBagianId : undefined,
          status: "active",
          limit: 500,
        })
        if (!isMounted) return
        setAkunList(akunRes.items)
        // Reset selected Akun if not in current list
        if (selectedAkunId !== null) {
          const stillExists = akunRes.items.some((a) => a.id_akun_anggaran === selectedAkunId)
          if (!stillExists) setSelectedAkunId(null)
        }
      } catch (e) {
        console.warn("Gagal memuat akun anggaran", e)
      }
    }

    loadAkun()
    return () => {
      isMounted = false
    }
  }, [selectedBagianId])

  // Fetch summary when filters change (with race protection)
  const fetchSummary = async () => {
    const currentReqId = ++requestIdRef.current
    setLoading(true)
    setError(null)

    try {
      const res = await dashboardAnggaranApi.getSummary({
        id_tahun_anggaran: selectedTahunId !== null ? selectedTahunId : undefined,
        id_bagian: selectedBagianId !== null ? selectedBagianId : undefined,
        id_akun_anggaran: selectedAkunId !== null ? selectedAkunId : undefined,
      })

      if (currentReqId === requestIdRef.current) {
        setSummary(res)
        setLoading(false)
      }
    } catch (err: any) {
      if (currentReqId === requestIdRef.current) {
        setError(err.message || "Gagal memuat ringkasan anggaran dari server")
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    fetchSummary()
  }, [selectedTahunId, selectedBagianId, selectedAkunId])

  // Active year object
  const currentTa = tahunList.find((t) => t.id_tahun_anggaran === selectedTahunId)
  const displayYear = summary?.tahun ?? currentTa?.tahun ?? new Date().getFullYear()
  const displayStatus = summary?.status_tahun ?? currentTa?.status ?? ""

  const overviewReqRef = useRef<number>(0)
  const fetchOverview = async () => {
    const reqId = ++overviewReqRef.current
    setOverviewLoading(true)
    setOverviewError(null)
    try {
      const data = await request<DashboardOverview>(`/dashboard/overview?year=${displayYear}`)
      if (reqId === overviewReqRef.current) setOverview(data)
    } catch (err) {
      if (reqId === overviewReqRef.current) {
        setOverviewError(err instanceof Error ? err.message : "Gagal memuat ringkasan surat dan arsip")
      }
    } finally {
      if (reqId === overviewReqRef.current) setOverviewLoading(false)
    }
  }

  useEffect(() => {
    void fetchOverview()
  }, [displayYear])

  const refreshAll = () => {
    void fetchSummary()
    void fetchOverview()
  }
  const countText = (value: number | undefined, unit: string) =>
    overviewLoading && !overview ? "…" : `${value ?? 0} ${unit}`

  // Formatting helpers
  const formatMiliar = (val: number | string) => {
    const num = Number(val) || 0
    return (num / 1_000_000_000).toFixed(2)
  }

  const formatRupiah = (val: number | string) => {
    const num = Number(val) || 0
    return `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(num))}`
  }

  // Monthly data array (12 months from backend)
  const monthlyRecap = summary?.monthly_recap || []
  const maxMonthlyRealisasi = Math.max(
    ...monthlyRecap.map((m) => Number(m.total_realisasi_verified) || 0),
    1
  )
  const chartMaxMiliar = Math.max(Math.ceil((maxMonthlyRealisasi / 1_000_000_000) * 1.2), 5)

  // Highest month
  const sortedMonths = [...monthlyRecap].sort(
    (a, b) => Number(b.total_realisasi_verified) - Number(a.total_realisasi_verified)
  )
  const highestMonth = sortedMonths[0]

  const selectClass = `rounded-xl border px-3 py-2 text-xs font-bold outline-none cursor-pointer transition-colors ${
    isDark
      ? "bg-[#0f172a] border-white/10 text-white focus:border-red-500"
      : "bg-white border-slate-300 text-slate-900 focus:border-red-500"
  }`

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Page Title & Dynamic Filters */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight my-0 ${isDark ? "text-white" : "text-black"}`}>
            Dashboard Operasional Terpadu — TA {displayYear}
          </h1>
          <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
            Pusat pemantauan eksekutif realisasi anggaran, persuratan digital, dan arsip dokumen KPU Sulawesi Utara
          </p>
        </div>

        {/* Global Toolbar Filters */}
        <div className="flex flex-wrap items-center justify-start xl:justify-end gap-2 shrink-0">
          {/* Filter Tahun */}
          <select
            value={selectedTahunId ?? ""}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : null
              setSelectedTahunId(val)
              setSelectedAkunId(null) // reset akun bila tahun berganti
            }}
            className={selectClass}
            aria-label="Filter Tahun Anggaran"
          >
            {tahunList.map((t) => (
              <option key={t.id_tahun_anggaran} value={t.id_tahun_anggaran}>
                TA {t.tahun}
              </option>
            ))}
          </select>

          {/* Filter Bagian */}
          <select
            value={selectedBagianId ?? ""}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : null
              setSelectedBagianId(val)
              setSelectedAkunId(null)
            }}
            className={selectClass}
            aria-label="Filter Bagian / Divisi"
          >
            <option value="">Semua Bagian</option>
            {bagianList.map((b) => (
              <option key={b.id_bagian} value={b.id_bagian}>
                {b.nama_bagian}
              </option>
            ))}
          </select>

          {/* Filter Akun */}
          <select
            value={selectedAkunId ?? ""}
            onChange={(e) => setSelectedAkunId(e.target.value ? Number(e.target.value) : null)}
            className={`${selectClass} max-w-xs truncate`}
            aria-label="Filter Akun MAK"
          >
            <option value="">Semua Akun MAK</option>
            {akunList.map((a) => (
              <option key={a.id_akun_anggaran} value={a.id_akun_anggaran}>
                {a.kode_akun} - {a.nama_akun}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error Banner with Retry */}
      {error && (
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchSummary}
            className="underline hover:text-red-700 cursor-pointer text-xs font-bold"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {overviewError && (
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{overviewError}</span>
          </div>
          <button type="button" onClick={fetchOverview} className="underline hover:text-red-700 cursor-pointer text-xs font-bold">
            Coba Lagi
          </button>
        </div>
      )}

      {/* 4 Metric Cards - Merah, Hitam, Putih */}
      <div className="dashboard-metrics grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4">
        {/* Card 1: Total Pagu Anggaran */}
        <Card className={`relative overflow-hidden transition-all ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
          <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600"></div>
          <CardContent className={`m-3 ml-4 p-4 rounded-xl border flex items-center justify-between min-h-[118px] ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex-1 flex flex-col justify-center min-w-0 pr-2">
              <p className={`text-[11px] font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                Total Pagu TA {displayYear}
              </p>
              <h2 className={`text-2xl font-black mt-1 truncate ${isDark ? "text-white" : "text-black"}`}>
                {loading ? <span className="inline-block w-24 h-7 bg-slate-300 dark:bg-slate-700 animate-pulse rounded-lg"></span> : `Rp ${formatMiliar(summary?.total_pagu_aktif ?? 0)} M`}
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

        {/* Card 2: Total Realisasi Anggaran */}
        <Card className={`relative overflow-hidden transition-all ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
          <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600"></div>
          <CardContent className={`m-3 ml-4 p-4 rounded-xl border flex items-center justify-between min-h-[118px] ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex-1 flex flex-col justify-center min-w-0 pr-2">
              <p className={`text-[11px] font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                Total Realisasi
              </p>
              <h2 className={`text-2xl font-black mt-1 truncate ${isDark ? "text-white" : "text-black"}`}>
                {loading ? <span className="inline-block w-24 h-7 bg-slate-300 dark:bg-slate-700 animate-pulse rounded-lg"></span> : `Rp ${formatMiliar(summary?.total_realisasi_verified ?? 0)} M`}
              </h2>
              <p className={`text-[10px] font-bold flex items-center gap-1 mt-1 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                <TrendingUp className="w-3.5 h-3.5 text-red-500" />
                <span>{summary?.persentase_serapan?.toFixed(2) ?? "0.00"}% terserap</span>
              </p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <FileCheck className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Surat Masuk Aktif */}
        <Card className={`relative overflow-hidden transition-all ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
          <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600"></div>
          <CardContent className={`m-3 ml-4 p-4 rounded-xl border flex items-center justify-between min-h-[118px] ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex-1 flex flex-col justify-center">
              <p className={`text-[11px] font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                Surat Masuk Aktif
              </p>
              <h2 className={`text-2xl font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>
                {countText(overview?.surat_masuk_aktif, "Berkas")}
              </h2>
              <p className={`text-[10px] font-bold mt-1 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                {overview ? `${overview.surat_perlu_tindakan} menunggu tindakan Anda` : "\u00a0"}
              </p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Mail className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Arsip Dokumen Digital */}
        <Card className={`relative overflow-hidden transition-all ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
          <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600"></div>
          <CardContent className={`m-3 ml-4 p-4 rounded-xl border flex items-center justify-between min-h-[118px] ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex-1 flex flex-col justify-center">
              <p className={`text-[11px] font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                Arsip Dokumen
              </p>
              <h2 className={`text-2xl font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>
                {countText(overview?.arsip_total, "Dokumen")}
              </h2>
              <p className={`text-[10px] font-bold flex items-center gap-1 mt-1 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                <TrendingUp className="w-3.5 h-3.5" /> {overview ? `+${overview.arsip_bulan_ini} dokumen bulan ini` : "\u00a0"}
              </p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Archive className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dual Visual Charts: Tren Realisasi Bulanan Dinamis (Monthly Recap) + Statistik Dokumen & Surat */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Tren Realisasi Bulanan Dinamis */}
        <Card className={`min-w-0 overflow-hidden flex flex-col ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="min-w-0">
              <CardTitle className={`text-base font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>
                Tren Realisasi Anggaran Bulanan
              </CardTitle>
              <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] mt-2 font-semibold ${isDark ? "text-gray-300" : "text-slate-600"}`}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-t from-red-700 to-red-500" />
                  Realisasi terverifikasi backend
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-5 border-t-2 border-dashed border-red-500" />
                  Pagu Sisa: Rp {formatMiliar(summary?.total_sisa_anggaran ?? 0)} M
                </span>
              </div>
            </div>
            <span className="shrink-0 rounded-lg border border-red-500/20 bg-red-600/10 px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-300">
              TA {displayYear}
            </span>
          </CardHeader>
          <CardContent className="pt-5 flex-1 flex flex-col gap-4 min-h-0">
            <div className={`relative flex-1 min-h-[340px] w-full overflow-hidden border rounded-xl ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
              {/* Y Axis Grid */}
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
                  <div key={position} className={`absolute left-0 right-0 border-t ${isDark ? "border-white/[0.07]" : "border-slate-200"}`} style={{ top: `${position}%` }} />
                ))}

                {/* 12 Bars Rendering from Backend monthly_recap */}
                <div className="relative z-10 grid h-full grid-cols-12 items-end gap-1.5 sm:gap-2.5">
                  {monthlyRecap.length === 0 ? (
                    <div className="col-span-12 h-full flex items-center justify-center text-xs text-slate-500">
                      Memuat data serapan bulanan...
                    </div>
                  ) : (
                    monthlyRecap.map((item) => {
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
                    })
                  )}
                </div>
              </div>

              {/* Month Labels below Bars */}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
              <div className={`rounded-lg border px-3 py-2 ${isDark ? "border-white/10 bg-[#111827]/60" : "border-slate-200 bg-slate-50"}`}>
                <span className={isDark ? "text-gray-400" : "text-slate-500"}>Total Transaksi Verified</span>
                <strong className={`ml-1.5 ${isDark ? "text-white" : "text-slate-900"}`}>
                  {summary?.total_transaksi_verified ?? 0} Transaksi
                </strong>
              </div>
              <div className={`rounded-lg border px-3 py-2 sm:text-right ${isDark ? "border-white/10 bg-[#111827]/60" : "border-slate-200 bg-slate-50"}`}>
                <span className={isDark ? "text-gray-400" : "text-slate-500"}>Bulan Tertinggi</span>
                <strong className="ml-1.5 text-red-600 dark:text-red-300">
                  {highestMonth && Number(highestMonth.total_realisasi_verified) > 0
                    ? `${highestMonth.nama_bulan} • Rp ${formatMiliar(highestMonth.total_realisasi_verified)} M`
                    : "Belum ada transaksi"}
                </strong>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chart 2: Statistik Dokumen & Surat */}
        <DashboardChart
          theme={theme}
          year={overview?.year ?? displayYear}
          data={overview?.monthly ?? []}
          loading={overviewLoading && !overview}
        />
      </div>

      {/* Table & Activity */}
      <div className="grid grid-cols-1 2xl:grid-cols-3 gap-6">
        <div className="min-w-0 2xl:col-span-2">
          <Card className={`h-full ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
            <div className={`p-5 pb-5 border-b flex items-center justify-between ${isDark ? "border-white/15" : "border-slate-200"}`}>
              <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-black"}`}>Surat Menyurat Terbaru</h3>
            </div>
            <CardContent className="p-0 pt-2">
              <Table>
                <TableHeader>
                  <TableRow
                    className={
                      isDark ? "border-b border-white/30 bg-[#0a0e1a]" : "border-b border-slate-200 bg-slate-100"
                    }
                  >
                    <TableHead className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? "text-white" : "text-black"}`}>
                      No. Surat
                    </TableHead>
                    <TableHead className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? "text-white" : "text-black"}`}>
                      Perihal
                    </TableHead>
                    <TableHead className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? "text-white" : "text-black"}`}>
                      Dari / Kepada
                    </TableHead>
                    <TableHead className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? "text-white" : "text-black"}`}>
                      Tanggal
                    </TableHead>
                    <TableHead className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? "text-white" : "text-black"}`}>
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(overview?.recent_letters ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-xs text-slate-500">
                        {overviewLoading ? "Memuat surat dari server…" : "Belum ada surat yang dapat Anda lihat."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    (overview?.recent_letters ?? []).map((row) => {
                      const status = LETTER_STATUS[row.status] ?? { label: row.status, variant: "secondary" as const }
                      return (
                        <TableRow key={row.id} className={isDark ? "border-b border-white/20" : "border-b border-slate-100"}>
                          <TableCell className="font-mono text-xs font-bold text-red-600 dark:text-red-400">
                            {row.number || (row.kind === "masuk" ? "(surat masuk)" : "(belum bernomor)")}
                          </TableCell>
                          <TableCell className={`font-semibold text-xs ${isDark ? "text-white" : "text-black !text-black"}`}>
                            {row.subject}
                          </TableCell>
                          <TableCell className={`text-xs font-medium ${isDark ? "text-gray-200" : "text-slate-800"}`}>
                            {row.kind === "masuk" ? row.sender : row.recipient}
                          </TableCell>
                          <TableCell className={`text-xs font-medium whitespace-nowrap ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                            {new Date(row.date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                          </TableCell>
                          <TableCell>
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0">
          <Card className={`h-full overflow-hidden ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
            <div className={`p-5 pb-4 border-b flex items-center justify-between ${isDark ? "border-white/15" : "border-slate-200"}`}>
              <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-black"}`}>Aktivitas Terkini</h3>
            </div>
            <CardContent className="p-5 pt-5 space-y-3">
              {(overview?.recent_activity ?? []).length === 0 && (
                <p className="py-6 text-center text-xs text-slate-500">
                  {overviewLoading ? "Memuat aktivitas…" : "Belum ada aktivitas."}
                </p>
              )}
              {(overview?.recent_activity ?? []).map((act, index) => {
                const Icon = ACTIVITY_ICON[act.type] ?? Mail
                return (
                  <div
                    key={`${act.type}-${act.at}-${index}`}
                    className={`flex min-h-[64px] items-center gap-3.5 rounded-xl border p-3.5 text-xs transition-colors ${
                      isDark
                        ? "border-white/10 bg-[#111827]/70"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0 shadow-xs text-white bg-red-600">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold leading-relaxed ${isDark ? "text-white" : "text-slate-900"}`}>
                        {ACTIVITY_NOUN[act.type]} &ldquo;{act.title}&rdquo; {ACTION_LABEL[act.action] ?? act.action}
                        {act.actor ? ` oleh ${act.actor}` : ""}
                      </p>
                      <span className={`text-[10px] font-semibold mt-1.5 block ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                        {relativeTime(act.at)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
