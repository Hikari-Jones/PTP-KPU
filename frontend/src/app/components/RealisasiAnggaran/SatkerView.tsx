import { useState, useEffect } from "react"
import { Building2, Search, Download, Filter, CheckCircle2, TrendingUp, Layers, MapPin } from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { Badge } from "../ui/badge"
import { fetchSatker, type SatkerData } from "../../../services/api"

interface Props {
  theme: "light" | "dark"
  onNavigate?: (tab: string) => void
}

const FALLBACK_SATKER: SatkerData[] = [
  { id_satker: 1, kode_satker: "652801", nama_satker: "KPU Provinsi Sulawesi Utara", tingkat: "Provinsi", alamat: "Jl. Diponegoro No. 12, Manado", pagu: 45780000000, realisasi: 31950000000, persentase: 69.8, status_dipa: "Aktif" },
  { id_satker: 2, kode_satker: "652802", nama_satker: "KPU Kota Manado", tingkat: "Kabupaten/Kota", alamat: "Jl. Balai Kota No. 1, Manado", pagu: 14200000000, realisasi: 10224000000, persentase: 72.0, status_dipa: "Aktif" },
  { id_satker: 3, kode_satker: "652803", nama_satker: "KPU Kota Bitung", tingkat: "Kabupaten/Kota", alamat: "Jl. Dr. Sam Ratulangi, Bitung", pagu: 9800000000, realisasi: 6860000000, persentase: 70.0, status_dipa: "Aktif" },
  { id_satker: 4, kode_satker: "652804", nama_satker: "KPU Kota Tomohon", tingkat: "Kabupaten/Kota", alamat: "Kakaskasen Tiga, Tomohon", pagu: 7500000000, realisasi: 5400000000, persentase: 72.0, status_dipa: "Aktif" },
  { id_satker: 5, kode_satker: "652805", nama_satker: "KPU Kota Kotamobagu", tingkat: "Kabupaten/Kota", alamat: "Jl. Paloko Kinalang, Kotamobagu", pagu: 8100000000, realisasi: 5508000000, persentase: 68.0, status_dipa: "Aktif" },
  { id_satker: 6, kode_satker: "652806", nama_satker: "KPU Kabupaten Minahasa", tingkat: "Kabupaten/Kota", alamat: "Jl. Tuur In Tana, Tondano", pagu: 12500000000, realisasi: 8875000000, persentase: 71.0, status_dipa: "Aktif" },
  { id_satker: 7, kode_satker: "652807", nama_satker: "KPU Kabupaten Minahasa Utara", tingkat: "Kabupaten/Kota", alamat: "Airmadidi, Minahasa Utara", pagu: 9600000000, realisasi: 6912000000, persentase: 72.0, status_dipa: "Aktif" },
  { id_satker: 8, kode_satker: "652808", nama_satker: "KPU Kabupaten Minahasa Selatan", tingkat: "Kabupaten/Kota", alamat: "Amurang, Minahasa Selatan", pagu: 9200000000, realisasi: 6256000000, persentase: 68.0, status_dipa: "Aktif" },
  { id_satker: 9, kode_satker: "652809", nama_satker: "KPU Kabupaten Minahasa Tenggara", tingkat: "Kabupaten/Kota", alamat: "Ratahan, Minahasa Tenggara", pagu: 7800000000, realisasi: 5226000000, persentase: 67.0, status_dipa: "Aktif" },
  { id_satker: 10, kode_satker: "652810", nama_satker: "KPU Kabupaten Bolaang Mongondow", tingkat: "Kabupaten/Kota", alamat: "Lolak, Bolaang Mongondow", pagu: 11000000000, realisasi: 7480000000, persentase: 68.0, status_dipa: "Aktif" },
  { id_satker: 11, kode_satker: "652811", nama_satker: "KPU Kabupaten Bolmong Utara", tingkat: "Kabupaten/Kota", alamat: "Boroko, Bolmong Utara", pagu: 7200000000, realisasi: 4896000000, persentase: 68.0, status_dipa: "Aktif" },
  { id_satker: 12, kode_satker: "652812", nama_satker: "KPU Kabupaten Bolmong Selatan", tingkat: "Kabupaten/Kota", alamat: "Molibagu, Bolmong Selatan", pagu: 6900000000, realisasi: 4623000000, persentase: 67.0, status_dipa: "Aktif" },
  { id_satker: 13, kode_satker: "652813", nama_satker: "KPU Kabupaten Bolmong Timur", tingkat: "Kabupaten/Kota", alamat: "Tutuyan, Bolmong Timur", pagu: 6800000000, realisasi: 4556000000, persentase: 67.0, status_dipa: "Aktif" },
  { id_satker: 14, kode_satker: "652814", nama_satker: "KPU Kabupaten Kepulauan Sangihe", tingkat: "Kabupaten/Kota", alamat: "Tahuna, Kepulauan Sangihe", pagu: 8900000000, realisasi: 6141000000, persentase: 69.0, status_dipa: "Aktif" },
  { id_satker: 15, kode_satker: "652815", nama_satker: "KPU Kabupaten Kepulauan Talaud", tingkat: "Kabupaten/Kota", alamat: "Melonguane, Kepulauan Talaud", pagu: 8700000000, realisasi: 5916000000, persentase: 68.0, status_dipa: "Aktif" },
  { id_satker: 16, kode_satker: "652816", nama_satker: "KPU Kabupaten Kepulauan Siau Tagulandang Biaro", tingkat: "Kabupaten/Kota", alamat: "Ondong Siau, Sitaro", pagu: 7100000000, realisasi: 4828000000, persentase: 68.0, status_dipa: "Aktif" },
]

export function SatkerView({ theme, onNavigate }: Props) {
  const isDark = theme === "dark"
  const [satkers, setSatkers] = useState<SatkerData[]>(FALLBACK_SATKER)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterTingkat, setFilterTingkat] = useState("Semua")

  useEffect(() => {
    fetchSatker().then((data) => {
      if (data && data.length > 0) {
        setSatkers(data)
      }
    })
  }, [])

  const filteredSatkers = satkers.filter((s) => {
    const matchesSearch =
      s.nama_satker.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.kode_satker.includes(searchTerm) ||
      s.alamat.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesTingkat = filterTingkat === "Semua" || s.tingkat === filterTingkat
    return matchesSearch && matchesTingkat
  })

  const totalPagu = satkers.reduce((acc, curr) => acc + curr.pagu, 0)
  const totalRealisasi = satkers.reduce((acc, curr) => acc + curr.realisasi, 0)
  const avgPct = totalPagu > 0 ? (totalRealisasi / totalPagu) * 100 : 0

  const formatRupiah = (val: number) => {
    return `Rp ${(val / 1000000000).toFixed(2)} M`
  }

  const exportCSV = () => {
    const headers = ["Kode Satker", "Nama Satker", "Tingkat", "Alamat", "Pagu (Rp)", "Realisasi (Rp)", "Persentase (%)", "Status DIPA"]
    const rows = filteredSatkers.map((s) => [
      s.kode_satker,
      `"${s.nama_satker}"`,
      s.tingkat,
      `"${s.alamat}"`,
      s.pagu,
      s.realisasi,
      s.persentase,
      s.status_dipa,
    ])
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `Data_Satker_KPU_Sulut_${new Date().toISOString().split("T")[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
            Realisasi Anggaran
          </p>
          <h1 className={`text-2xl font-bold tracking-tight my-0 ${isDark ? "text-white" : "text-black"}`}>
            Satuan Kerja (Satker)
          </h1>
          <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
            Pengelolaan Data Satker KPU Provinsi dan 15 KPU Kabupaten/Kota Se-Sulawesi Utara
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="btn-kpu-red px-4 py-2 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer shrink-0 transition-all active:scale-95 shadow-md"
        >
          <Download className="w-4 h-4" />
          <span>Ekspor CSV</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={isDark ? "bg-[#0d1322] border-white/10" : "bg-white border-slate-200 shadow-sm"}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? "text-gray-400" : "text-slate-600"}`}>Total Satker</p>
              <h3 className={`text-xl font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>{satkers.length} Satuan Kerja</h3>
            </div>
            <div className="p-3 rounded-xl bg-red-600 text-white shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className={isDark ? "bg-[#0d1322] border-white/10" : "bg-white border-slate-200 shadow-sm"}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? "text-gray-400" : "text-slate-600"}`}>Total Pagu Gabungan</p>
              <h3 className={`text-xl font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>{formatRupiah(totalPagu)}</h3>
            </div>
            <div className={`p-3 rounded-xl ${isDark ? "bg-white text-slate-950" : "bg-slate-900 text-white"}`}>
              <Layers className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className={isDark ? "bg-[#0d1322] border-white/10" : "bg-white border-slate-200 shadow-sm"}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? "text-gray-400" : "text-slate-600"}`}>Realisasi Wilayah</p>
              <h3 className={`text-xl font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>{formatRupiah(totalRealisasi)}</h3>
            </div>
            <div className="p-3 rounded-xl bg-red-600 text-white shadow-xs">
              <TrendingUp className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className={isDark ? "bg-[#0d1322] border-white/10" : "bg-white border-slate-200 shadow-sm"}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? "text-gray-400" : "text-slate-600"}`}>Rata-rata Serapan</p>
              <h3 className={`text-xl font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>{avgPct.toFixed(1)}%</h3>
            </div>
            <div className={`p-3 rounded-xl ${isDark ? "bg-white text-slate-950" : "bg-slate-900 text-white"}`}>
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari Satker atau Kode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-9 pr-4 py-2 text-xs rounded-xl border font-medium outline-none transition-colors ${
              isDark ? "bg-[#0f172a] border-white/10 text-white focus:border-red-500" : "bg-white border-slate-300 text-slate-900 focus:border-red-500"
            }`}
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Filter className="h-4 w-4 text-slate-400" />
          <span className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-slate-700"}`}>Tingkat:</span>
          {["Semua", "Provinsi", "Kabupaten/Kota"].map((t) => (
            <button
              key={t}
              onClick={() => setFilterTingkat(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterTingkat === t
                  ? "bg-red-600 text-white shadow-xs"
                  : isDark
                  ? "bg-[#0f172a] text-gray-300 border border-white/10 hover:bg-slate-800"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table Card */}
      <Card className={isDark ? "bg-[#0d1322] border-white/10" : "bg-white border-slate-200 shadow-sm"}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className={isDark ? "border-b border-white/20 bg-[#0a0e1a]" : "border-b border-slate-200 bg-slate-100"}>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Kode</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Nama Satker</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Tingkat</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Pagu DIPA</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Realisasi</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Serapan (%)</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSatkers.map((s) => (
                <TableRow key={s.id_satker} className={isDark ? "border-b border-white/10 hover:bg-white/5" : "border-b border-slate-100 hover:bg-slate-50"}>
                  <TableCell className="font-mono text-xs font-bold text-red-600 dark:text-red-400">{s.kode_satker}</TableCell>
                  <TableCell>
                    <div className={`font-bold text-xs ${isDark ? "text-white" : "text-black"}`}>{s.nama_satker}</div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                      <MapPin className="h-3 w-3" />
                      {s.alamat}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${s.tingkat === "Provinsi" ? "bg-red-600 text-white" : isDark ? "bg-slate-800 text-slate-200" : "bg-slate-200 text-slate-800"}`}>
                      {s.tingkat}
                    </span>
                  </TableCell>
                  <TableCell className={`font-mono text-xs font-bold ${isDark ? "text-gray-200" : "text-slate-900"}`}>
                    Rp {new Intl.NumberFormat("id-ID").format(s.pagu)}
                  </TableCell>
                  <TableCell className={`font-mono text-xs font-bold ${isDark ? "text-gray-200" : "text-slate-900"}`}>
                    Rp {new Intl.NumberFormat("id-ID").format(s.realisasi)}
                  </TableCell>
                  <TableCell className="w-36">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-red-600 h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, s.persentase)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-bold font-mono ${isDark ? "text-white" : "text-black"}`}>
                        {s.persentase}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-emerald-500 text-emerald-500 bg-emerald-500/10 text-[10px]">
                      {s.status_dipa}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

