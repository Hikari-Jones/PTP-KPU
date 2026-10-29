import { Mail, Archive, TrendingUp, Wallet, Settings, FileCheck, CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Badge } from "../ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { DashboardChart } from "../ui/chart"

const MONTHLY_TREND_DATA = [
  { month: "Jan", realisasi: 2.1, target: 3.8 },
  { month: "Feb", realisasi: 2.8, target: 3.8 },
  { month: "Mar", realisasi: 3.4, target: 3.8 },
  { month: "Apr", realisasi: 3.1, target: 3.8 },
  { month: "Mei", realisasi: 3.9, target: 3.8 },
  { month: "Jun", realisasi: 4.2, target: 3.8 },
  { month: "Jul", realisasi: 3.7, target: 3.8 },
  { month: "Agu", realisasi: 4.1, target: 3.8 },
  { month: "Sep", realisasi: 3.95, target: 3.8 },
  { month: "Okt", realisasi: 0.0, target: 3.8 },
  { month: "Nov", realisasi: 0.0, target: 3.8 },
  { month: "Des", realisasi: 0.0, target: 3.8 },
]

export function DashboardView({ theme }: { theme: "light" | "dark" }) {
  const isDark = theme === "dark"

  const recentSurat = [
    {
      no: "001/KPU-SU/VI/2026",
      perihal: "Undangan Rapat Pleno Rekapitulasi DPT",
      dari: "Ketua KPU Provinsi",
      tanggal: "20 Jun 2026",
      status: "terkirim",
      statusLabel: "Terkirim",
    },
    {
      no: "002/KPU-SU/VI/2026",
      perihal: "Laporan Rekap DPT Kab. Minahasa 2026",
      dari: "KPU Kab. Minahasa",
      tanggal: "19 Jun 2026",
      status: "diterima",
      statusLabel: "Diterima",
    },
    {
      no: "003/KPU-SU/VI/2026",
      perihal: "Permohonan Klarifikasi Data Pemilih",
      dari: "Bawaslu Sulut",
      tanggal: "18 Jun 2026",
      status: "diproses",
      statusLabel: "Diproses",
    },
    {
      no: "004/KPU-SU/VI/2026",
      perihal: "Nota Dinas Pengadaan Logistik Pilkada",
      dari: "Subbagian Logistik",
      tanggal: "17 Jun 2026",
      status: "draft",
      statusLabel: "Draft",
    },
  ]

  const recentActivities = [
    {
      id: 1,
      icon: Mail,
      text: "Surat Undangan Pleno KPU No. 042 diterima",
      time: "09:24 WITA",
      iconColor: "text-white bg-red-600",
    },
    {
      id: 2,
      icon: Archive,
      text: "Dokumen Arsip Pilkada 2026 telah diverifikasi",
      time: "08:50 WITA",
      iconColor: "text-white bg-red-600",
    },
    {
      id: 3,
      icon: Wallet,
      text: "Laporan Pengeluaran Operasional disetujui",
      time: "08:15 WITA",
      iconColor: "text-white bg-red-600",
    },
    {
      id: 4,
      icon: Settings,
      text: "Konfigurasi keamanan sistem diperbarui",
      time: "Kemarin",
      iconColor: "text-white bg-red-600",
    },
    {
      id: 5,
      icon: CheckCircle2,
      text: "Verifikasi anggaran Subbagian Keuangan selesai",
      time: "2 hari lalu",
      iconColor: "text-white bg-red-600",
    },
  ]

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Page Title */}
      <div>
        <h1 className={`text-2xl font-bold tracking-tight my-0 ${isDark ? "text-white" : "text-black"}`}>
          Dashboard Operasional Terpadu
        </h1>
        <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
          Pusat pemantauan eksekutif realisasi anggaran, persuratan digital, dan arsip dokumen KPU Sulawesi Utara
        </p>
      </div>

      {/* 4 Metric Cards - Merah, Hitam, Putih */}
      <div className="dashboard-metrics grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4">
        {/* Card 1: Total Pagu Anggaran */}
        <Card className={`relative overflow-hidden transition-all ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
          <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600"></div>
          <CardContent className={`m-3 ml-4 p-4 rounded-xl border flex items-center justify-between min-h-[118px] ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex-1 flex flex-col justify-center">
              <p className={`text-[11px] font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                Total Pagu TA 2025
              </p>
              <h2 className={`text-2xl font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>Rp 45.78 M</h2>
              <p className={`text-[10px] font-bold mt-1 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                Alokasi PTP KPU Sulut
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
            <div className="flex-1 flex flex-col justify-center">
              <p className={`text-[11px] font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                Total Realisasi
              </p>
              <h2 className={`text-2xl font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>Rp 31.25 M</h2>
              <p className={`text-[10px] font-bold flex items-center gap-1 mt-1 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                <TrendingUp className="w-3.5 h-3.5" /> 68.3% terserap
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
              <h2 className={`text-2xl font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>12 Berkas</h2>
              <p className={`text-[10px] font-bold mt-1 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                3 butuh tanggapan
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
                Arsip Terverifikasi
              </p>
              <h2 className={`text-2xl font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>248 Dokumen</h2>
              <p className={`text-[10px] font-bold flex items-center gap-1 mt-1 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                <TrendingUp className="w-3.5 h-3.5" /> +6 berkas bulan ini
              </p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Archive className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dual Visual Charts: Tren Realisasi Anggaran Bulanan + Statistik Dokumen & Surat */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Tren Realisasi Bulanan */}
        <Card className={`min-w-0 overflow-hidden flex flex-col ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="min-w-0">
              <CardTitle className={`text-base font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>
                Tren Realisasi Anggaran Bulanan
              </CardTitle>
              <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] mt-2 font-semibold ${isDark ? "text-gray-300" : "text-slate-600"}`}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-gradient-to-t from-red-700 to-red-500" />
                  Realisasi keuangan
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-5 border-t-2 border-dashed border-red-500" />
                  Target Rp 3.80 M / bulan
                </span>
              </div>
            </div>
            <span className="shrink-0 rounded-lg border border-red-500/20 bg-red-600/10 px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-300">
              TA 2025
            </span>
          </CardHeader>
          <CardContent className="pt-5 flex-1 flex flex-col gap-4 min-h-0">
            <div className={`relative flex-1 min-h-[340px] w-full overflow-hidden border rounded-xl ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
              <div className={`absolute left-3 top-7 bottom-11 w-8 flex flex-col justify-between text-[9px] font-semibold ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                {["5 M", "3.75 M", "2.5 M", "1.25 M", "0"].map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>

              <div className="absolute left-12 right-4 top-7 bottom-11">
                {[0, 25, 50, 75, 100].map((position) => (
                  <div key={position} className={`absolute left-0 right-0 border-t ${isDark ? "border-white/[0.07]" : "border-slate-200"}`} style={{ top: `${position}%` }} />
                ))}
                <div className="absolute left-0 right-0 z-20 border-t-2 border-dashed border-red-500/70 pointer-events-none" style={{ top: `${100 - (3.8 / 5) * 100}%` }}>
                  <span className="absolute right-0 -top-6 rounded-md border border-red-500/20 bg-red-600/10 px-2 py-0.5 text-[9px] font-bold text-red-600 dark:text-red-300 backdrop-blur-sm">
                    Target 3.80 M
                  </span>
                </div>

                <div className="relative z-10 grid h-full grid-cols-12 items-end gap-1.5 sm:gap-2.5">
                  {MONTHLY_TREND_DATA.map((item) => {
                    const heightPct = (item.realisasi / 5) * 100
                    const hasValue = item.realisasi > 0
                    return (
                      <div key={item.month} className="group relative flex h-full min-w-0 items-end justify-center">
                      <div
                          style={{ height: hasValue ? `${Math.max(5, heightPct)}%` : "4px" }}
                          className={`relative w-full max-w-8 rounded-t-md transition-[filter] duration-200 ${hasValue ? "bg-gradient-to-t from-red-800 via-red-700 to-red-500 shadow-[0_0_18px_rgba(220,38,38,0.12)] group-hover:brightness-110" : isDark ? "bg-slate-700/70" : "bg-slate-300"}`}
                      >
                          {hasValue && (
                            <span className="pointer-events-none absolute -top-7 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-[9px] font-bold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                              Rp {item.realisasi.toFixed(2)} M
                          </span>
                        )}
                      </div>
                    </div>
                    )
                  })}
                </div>
              </div>

              <div className="absolute bottom-3 left-12 right-4 grid grid-cols-12 gap-1.5 sm:gap-2.5">
                {MONTHLY_TREND_DATA.map((item) => (
                  <span key={item.month} className={`truncate text-center text-[9px] sm:text-[10px] font-bold ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                    {item.month}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
              <div className={`rounded-lg border px-3 py-2 ${isDark ? "border-white/10 bg-[#111827]/60" : "border-slate-200 bg-slate-50"}`}>
                <span className={isDark ? "text-gray-400" : "text-slate-500"}>Realisasi hingga September</span>
                <strong className={`ml-1.5 ${isDark ? "text-white" : "text-slate-900"}`}>Rp 31.25 M</strong>
              </div>
              <div className={`rounded-lg border px-3 py-2 sm:text-right ${isDark ? "border-white/10 bg-[#111827]/60" : "border-slate-200 bg-slate-50"}`}>
                <span className={isDark ? "text-gray-400" : "text-slate-500"}>Tertinggi</span>
                <strong className="ml-1.5 text-red-600 dark:text-red-300">Juni • Rp 4.20 M</strong>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chart 2: Statistik Dokumen & Surat */}
        <DashboardChart theme={theme} />
      </div>

      {/* Table & Activity */}
      <div className="grid grid-cols-1 2xl:grid-cols-3 gap-6">
        <div className="min-w-0 2xl:col-span-2">
          <Card className={`h-full ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
            <div className={`p-4 border-b flex items-center justify-between ${isDark ? "border-[#1e293b]" : "border-slate-200"}`}>
              <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-black"}`}>Surat Menyurat Terbaru</h3>
            </div>
            <CardContent className="p-0">
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
                      Dari
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
                  {recentSurat.map((row, idx) => (
                    <TableRow
                      key={idx}
                      className={
                        isDark ? "border-b border-white/20" : "border-b border-slate-100"
                      }
                    >
                      <TableCell className="font-mono text-xs font-bold text-red-600 dark:text-red-400">{row.no}</TableCell>
                      <TableCell className={`font-semibold text-xs ${isDark ? "text-white" : "text-black !text-black"}`}>
                        {row.perihal}
                      </TableCell>
                      <TableCell className={`text-xs font-medium ${isDark ? "text-gray-200" : "text-slate-800"}`}>{row.dari}</TableCell>
                      <TableCell className={`text-xs font-medium whitespace-nowrap ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                        {row.tanggal}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status as "terkirim" | "diterima" | "diproses" | "draft"}>
                          {row.statusLabel}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0">
          <Card className={`h-full overflow-hidden ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
            <div className={`p-4 border-b flex items-center justify-between ${isDark ? "border-[#1e293b]" : "border-slate-200"}`}>
              <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-black"}`}>Aktivitas Terkini</h3>
            </div>
            <CardContent className="p-4 space-y-2.5">
              {recentActivities.map((act) => {
                const Icon = act.icon
                return (
                  <div
                    key={act.id}
                    className={`flex min-h-[60px] items-center gap-3 rounded-xl border p-3 text-xs transition-colors ${
                      isDark
                        ? "border-white/10 bg-[#111827]/70"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 shadow-xs ${act.iconColor}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold leading-snug ${isDark ? "text-white" : "text-slate-900"}`}>
                        {act.text}
                      </p>
                      <span className={`text-[10px] font-semibold mt-1 block ${isDark ? "text-gray-400" : "text-slate-500"}`}>{act.time}</span>
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
