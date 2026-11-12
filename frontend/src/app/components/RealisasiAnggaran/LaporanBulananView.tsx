import { useState, useEffect } from "react"
import { Download, RefreshCw, AlertCircle, Layers } from "lucide-react"
import { Card, CardContent } from "../ui/card"
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
  MonthlyReportResponse
} from "./types"

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
]

export function LaporanBulananView({ theme }: { theme: "light" | "dark" }) {
  const isDark = theme === "dark"

  // Dropdown states
  const [tahunList, setTahunList] = useState<TahunAnggaranResponse[]>([])
  const [bagianList, setBagianList] = useState<BagianResponse[]>([])
  const [akunList, setAkunList] = useState<AkunAnggaranResponse[]>([])

  // Filters
  const [selectedTahunId, setSelectedTahunId] = useState<number | null>(null)
  const [selectedBagianId, setSelectedBagianId] = useState<number | null>(null)
  const [selectedAkunId, setSelectedAkunId] = useState<number | null>(null)

  // Data states
  const [report, setReport] = useState<MonthlyReportResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Initialize master filters
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

        // Default to active year
        const activeTa = taRes.items.find((item) => item.status === "active")
        if (activeTa) {
          setSelectedTahunId(activeTa.id_tahun_anggaran)
        } else if (taRes.items.length > 0) {
          setSelectedTahunId(taRes.items[0].id_tahun_anggaran)
        }
      } catch (err: any) {
        if (isMounted) setError("Gagal memuat master filter laporan")
      }
    }

    initMaster()
    return () => {
      isMounted = false
    }
  }, [])

  // Fetch Monthly Report from backend
  const fetchReport = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await dashboardAnggaranApi.getMonthlyReport({
        id_tahun_anggaran: selectedTahunId !== null ? selectedTahunId : undefined,
        id_bagian: selectedBagianId !== null ? selectedBagianId : undefined,
        id_akun_anggaran: selectedAkunId !== null ? selectedAkunId : undefined,
      })
      setReport(res)
    } catch (err: any) {
      setError(err.message || "Gagal memuat laporan bulanan anggaran")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedTahunId !== null) {
      fetchReport()
    }
  }, [selectedTahunId, selectedBagianId, selectedAkunId])

  const formatRupiah = (value: number | string) => {
    const num = Number(value) || 0
    return `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(num))}`
  }

  const compactRupiah = (value: number | string) => {
    const num = Number(value) || 0
    return num === 0 ? "—" : formatRupiah(num)
  }

  const rows = report?.rows || []
  const total = report?.total || {
    pagu: 0,
    januari: 0,
    februari: 0,
    maret: 0,
    april: 0,
    mei: 0,
    juni: 0,
    juli: 0,
    agustus: 0,
    september: 0,
    oktober: 0,
    november: 0,
    desember: 0,
    total_realisasi: 0,
    sisa_anggaran: 0,
    persentase_realisasi: 0,
  }

  const handleExport = () => {
    const header = [
      "Kode",
      "Nama Akun",
      "Bagian",
      "Pagu",
      ...MONTHS,
      "Total Realisasi",
      "Sisa",
      "Persentase",
    ]

    const csvRows = rows.map((row) => [
      row.kode_akun,
      `"${row.nama_akun}"`,
      row.nama_bagian || "Umum",
      row.pagu,
      row.januari,
      row.februari,
      row.maret,
      row.april,
      row.mei,
      row.juni,
      row.juli,
      row.agustus,
      row.september,
      row.oktober,
      row.november,
      row.desember,
      row.total_realisasi,
      row.sisa_anggaran,
      `${row.persentase_realisasi}%`,
    ])

    const totalRow = [
      "TOTAL",
      "TOTAL KESELURUHAN",
      "—",
      total.pagu,
      total.januari,
      total.februari,
      total.maret,
      total.april,
      total.mei,
      total.juni,
      total.juli,
      total.agustus,
      total.september,
      total.oktober,
      total.november,
      total.desember,
      total.total_realisasi,
      total.sisa_anggaran,
      `${total.persentase_realisasi}%`,
    ]

    const csvContent = [header.join(","), ...csvRows.map((r) => r.join(",")), totalRow.join(",")].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `Laporan_Realisasi_Bulanan_TA_${report?.tahun ?? "Aktif"}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const filterClass = `rounded-xl border px-3 py-2 text-xs font-bold outline-none cursor-pointer transition-colors ${
    isDark
      ? "bg-[#0f172a] border-white/10 text-white focus:border-red-500"
      : "bg-white border-slate-300 text-slate-900 focus:border-red-500"
  }`

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
            Laporan Anggaran
          </p>
          <h1 className={`m-0 text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-black"}`}>
            Laporan Realisasi Bulanan (12 Bulan)
          </h1>
          <p className={`mt-1 text-xs font-medium ${isDark ? "text-gray-400" : "text-slate-600"}`}>
            Rekap matriks realisasi per akun MAK dan bulan 1–12 • TA {report?.tahun ?? "..."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filter TA */}
          <select
            value={selectedTahunId ?? ""}
            onChange={(e) => setSelectedTahunId(e.target.value ? Number(e.target.value) : null)}
            className={filterClass}
          >
            {tahunList.map((t) => (
              <option key={t.id_tahun_anggaran} value={t.id_tahun_anggaran}>
                TA {t.tahun} ({t.status})
              </option>
            ))}
          </select>

          {/* Filter Bagian */}
          <select
            value={selectedBagianId ?? ""}
            onChange={(e) => setSelectedBagianId(e.target.value ? Number(e.target.value) : null)}
            className={`${filterClass} min-w-40`}
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
            className={`${filterClass} max-w-xs truncate`}
          >
            <option value="">Semua Akun</option>
            {akunList.map((a) => (
              <option key={a.id_akun_anggaran} value={a.id_akun_anggaran}>
                {a.kode_akun} - {a.nama_akun}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={fetchReport}
            disabled={loading}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              isDark ? "border-white/10 bg-[#1e293b] text-white" : "border-slate-300 bg-white text-slate-800"
            }`}
            title="Segarkan Laporan"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-red-500" : ""}`} />
          </button>

          <button
            type="button"
            onClick={handleExport}
            className="btn-kpu-red flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white cursor-pointer active:scale-95"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-500 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Aggregate Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Total Pagu", formatRupiah(total.pagu)],
          ["Total Realisasi", formatRupiah(total.total_realisasi)],
          ["Sisa Anggaran", formatRupiah(total.sisa_anggaran)],
          ["Serapan", `${total.persentase_realisasi.toFixed(2)}%`],
        ].map(([label, value]) => (
          <div
            key={label}
            className={`rounded-xl border p-3 ${
              isDark ? "border-white/10 bg-[#111b2e]" : "border-slate-200 bg-slate-50"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
            <p
              className={`mt-1 truncate text-sm font-black ${
                label === "Total Realisasi" || label === "Serapan"
                  ? "text-red-600 dark:text-red-400"
                  : isDark
                  ? "text-white"
                  : "text-slate-900"
              }`}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* 12-Month Matrix Table */}
      <Card
        className={`${
          isDark ? "bg-[#111827] border-[#263247]" : "bg-white border-slate-200"
        } overflow-hidden rounded-2xl shadow-lg`}
      >
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-[1900px] w-full border-collapse text-left text-[10px]">
              <thead>
                <tr className={isDark ? "bg-black text-white" : "bg-slate-200 text-slate-800"}>
                  <th className="min-w-20 border-b border-r border-slate-700/20 px-3 py-3 font-extrabold">KODE</th>
                  <th className="min-w-56 border-b border-r border-slate-700/20 px-3 py-3 font-extrabold">NAMA AKUN</th>
                  <th className="min-w-32 border-b border-r border-slate-700/20 px-3 py-3 font-extrabold">BAGIAN</th>
                  <th className="min-w-36 border-b border-slate-700/20 px-3 py-3 font-extrabold">PAGU TAHUNAN</th>
                  {MONTHS.map((month) => (
                    <th key={month} className="min-w-32 border-b border-slate-700/20 px-3 py-3 text-right font-extrabold">
                      {month.toUpperCase()}
                    </th>
                  ))}
                  <th className="min-w-36 border-b border-slate-700/20 px-3 py-3 text-right font-extrabold">TOTAL REALISASI</th>
                  <th className="min-w-36 border-b border-slate-700/20 px-3 py-3 text-right font-extrabold">SISA ANGGARAN</th>
                  <th className="min-w-16 border-b border-slate-700/20 px-3 py-3 text-right font-extrabold">%</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={19} className="px-4 py-8 text-center text-xs text-slate-500">
                      Memuat data laporan bulanan...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={19} className="px-4 py-8 text-center text-xs text-slate-500">
                      Tidak ada data akun atau transaksi realisasi pada filter ini.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={row.id_akun_anggaran}
                      className={`border-b ${isDark ? "border-[#263247] bg-[#111827]" : "border-slate-100 bg-white"}`}
                    >
                      <td className={`border-r px-3 py-3 font-mono font-bold text-red-600 dark:text-red-400 ${isDark ? "border-[#263247]" : "border-slate-100"}`}>
                        {row.kode_akun}
                      </td>
                      <td className={`border-r px-3 py-3 font-bold ${isDark ? "border-[#263247] text-white" : "border-slate-100 text-slate-900"}`}>
                        {row.nama_akun}
                      </td>
                      <td className={`border-r px-3 py-3 font-semibold ${isDark ? "border-[#263247] text-gray-300" : "border-slate-100 text-slate-600"}`}>
                        {row.nama_bagian || "Umum"}
                      </td>
                      <td className="px-3 py-3 font-bold text-red-600 dark:text-red-400">
                        {formatRupiah(row.pagu)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">{compactRupiah(row.januari)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{compactRupiah(row.februari)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{compactRupiah(row.maret)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{compactRupiah(row.april)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{compactRupiah(row.mei)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{compactRupiah(row.juni)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{compactRupiah(row.juli)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{compactRupiah(row.agustus)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{compactRupiah(row.september)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{compactRupiah(row.oktober)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{compactRupiah(row.november)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{compactRupiah(row.desember)}</td>
                      <td className="px-3 py-3 text-right font-black text-red-600 dark:text-red-400">
                        {formatRupiah(row.total_realisasi)}
                      </td>
                      <td className={`px-3 py-3 text-right font-bold ${isDark ? "text-gray-200" : "text-slate-700"}`}>
                        {formatRupiah(row.sisa_anggaran)}
                      </td>
                      <td className="px-3 py-3 text-right font-black text-red-600 dark:text-red-400">
                        {row.persentase_realisasi.toFixed(2)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className={isDark ? "bg-[#2a1014] text-white" : "bg-red-50 text-slate-900"}>
                  <td colSpan={3} className="px-3 py-3 font-black text-red-600 dark:text-red-400">
                    TOTAL KESELURUHAN
                  </td>
                  <td className="px-3 py-3 font-black text-red-600 dark:text-red-400">
                    {formatRupiah(total.pagu)}
                  </td>
                  <td className="px-3 py-3 text-right font-bold">{compactRupiah(total.januari)}</td>
                  <td className="px-3 py-3 text-right font-bold">{compactRupiah(total.februari)}</td>
                  <td className="px-3 py-3 text-right font-bold">{compactRupiah(total.maret)}</td>
                  <td className="px-3 py-3 text-right font-bold">{compactRupiah(total.april)}</td>
                  <td className="px-3 py-3 text-right font-bold">{compactRupiah(total.mei)}</td>
                  <td className="px-3 py-3 text-right font-bold">{compactRupiah(total.juni)}</td>
                  <td className="px-3 py-3 text-right font-bold">{compactRupiah(total.juli)}</td>
                  <td className="px-3 py-3 text-right font-bold">{compactRupiah(total.agustus)}</td>
                  <td className="px-3 py-3 text-right font-bold">{compactRupiah(total.september)}</td>
                  <td className="px-3 py-3 text-right font-bold">{compactRupiah(total.oktober)}</td>
                  <td className="px-3 py-3 text-right font-bold">{compactRupiah(total.november)}</td>
                  <td className="px-3 py-3 text-right font-bold">{compactRupiah(total.desember)}</td>
                  <td className="px-3 py-3 text-right font-black text-red-600 dark:text-red-400">
                    {formatRupiah(total.total_realisasi)}
                  </td>
                  <td className="px-3 py-3 text-right font-black">
                    {formatRupiah(total.sisa_anggaran)}
                  </td>
                  <td className="px-3 py-3 text-right font-black text-red-600 dark:text-red-400">
                    {total.persentase_realisasi.toFixed(2)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
