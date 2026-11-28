import { saveCsv } from "../../../services/csv"
import { useState, useEffect } from "react"
import { Building2, Search, Download, Filter, CheckCircle2, TrendingUp, Layers, MapPin, Plus, X } from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { Badge } from "../ui/badge"
import { fetchSatker, createSatker, type SatkerData } from "../../../services/api"
import { useAuth } from "../../context/AuthContext"
import { showToast } from "../../../services/activity"

interface Props {
  theme: "light" | "dark"
  onNavigate?: (tab: string) => void
}

export function SatkerView({ theme, onNavigate }: Props) {
  const isDark = theme === "dark"
  const { userRole } = useAuth()
  const isAdmin = userRole === "Admin"
  const [satkers, setSatkers] = useState<SatkerData[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterTingkat, setFilterTingkat] = useState("Semua")
  const [showAddModal, setShowAddModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    kode_satker: "",
    nama_satker: "",
    tingkat: "Kabupaten/Kota",
    alamat: "",
    pagu: 0,
    realisasi: 0,
    status_dipa: "Aktif",
  })

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await fetchSatker()
      setSatkers(data)
      setError("")
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Data Satker tidak tersedia')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const handleCreateSatker = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.kode_satker || !formData.nama_satker || !formData.alamat) {
      showToast("error", "Harap isi semua kolom wajib!")
      return
    }
    try {
      setIsSubmitting(true)
      await createSatker(formData)
      setShowAddModal(false)
      setFormData({
        kode_satker: "",
        nama_satker: "",
        tingkat: "Kabupaten/Kota",
        alamat: "",
        pagu: 0,
        realisasi: 0,
        status_dipa: "Aktif",
      })
      await loadData()
    } catch {
      // The global notification already shows the server's message; keep the form open to fix it.
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
          Realisasi Anggaran
        </p>
        <h1 className={`text-2xl font-bold tracking-tight my-0 ${isDark ? "text-white" : "text-black"}`}>
          Data Satuan Kerja
        </h1>
        <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
          Memuat data Satker…
        </p>
      </div>
    </div>
  )

  if (error) return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
          Realisasi Anggaran
        </p>
        <h1 className={`text-2xl font-bold tracking-tight my-0 ${isDark ? "text-white" : "text-black"}`}>
          Data Satuan Kerja
        </h1>
        <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`} role="alert">
          {error}
        </p>
      </div>
    </div>
  )

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
      s.kode_satker, s.nama_satker, s.tingkat, s.alamat, s.pagu, s.realisasi, s.persentase, s.status_dipa,
    ])
    saveCsv(`Data_Satker_KPU_Sulut_${new Date().toISOString().split("T")[0]}.csv`, [headers, ...rows])
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
            <span className="block mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              Nilai pagu dan realisasi Satker diisi manual oleh administrator; belum terhubung otomatis ke data keuangan satker.
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-kpu-red px-4 py-2 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer shrink-0 transition-all active:scale-95 shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Satker</span>
            </button>
          )}
          <button
            onClick={exportCSV}
            className={`px-4 py-2 font-bold text-xs rounded-xl border flex items-center gap-2 cursor-pointer shrink-0 transition-all active:scale-95 shadow-xs ${
              isDark ? "bg-[#1e293b]/80 border-white/10 text-slate-200 hover:bg-[#1e293b]" : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Ekspor CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: TOTAL SATKER */}
        <Card className={`relative overflow-hidden transition-all ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
          <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600"></div>
          <CardContent className={`m-3 ml-4 p-4 rounded-xl border flex items-center justify-between min-h-[118px] ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex-1 flex flex-col justify-center">
              <p className={`text-[11px] font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                TOTAL SATKER
              </p>
              <h2 className={`text-2xl font-black mt-1 tracking-tight ${isDark ? "text-white" : "text-black"}`}>
                {satkers.length} Satuan Kerja
              </h2>
              <p className={`text-[10px] font-bold mt-1 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                Wilayah Sulawesi Utara
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        {/* Card 2: TOTAL PAGU GABUNGAN */}
        <Card className={`relative overflow-hidden transition-all ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
          <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600"></div>
          <CardContent className={`m-3 ml-4 p-4 rounded-xl border flex items-center justify-between min-h-[118px] ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex-1 flex flex-col justify-center">
              <p className={`text-[11px] font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                TOTAL PAGU GABUNGAN
              </p>
              <h2 className={`text-2xl font-black mt-1 tracking-tight ${isDark ? "text-white" : "text-black"}`}>
                {formatRupiah(totalPagu)}
              </h2>
              <p className={`text-[10px] font-bold mt-1 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                Akumulasi Pagu Satker
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        {/* Card 3: REALISASI WILAYAH */}
        <Card className={`relative overflow-hidden transition-all ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
          <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600"></div>
          <CardContent className={`m-3 ml-4 p-4 rounded-xl border flex items-center justify-between min-h-[118px] ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex-1 flex flex-col justify-center">
              <p className={`text-[11px] font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                REALISASI WILAYAH
              </p>
              <h2 className={`text-2xl font-black mt-1 tracking-tight ${isDark ? "text-white" : "text-black"}`}>
                {formatRupiah(totalRealisasi)}
              </h2>
              <p className="text-[10px] font-bold flex items-center gap-1 mt-1 text-red-600 dark:text-red-400">
                <TrendingUp className="w-3.5 h-3.5" /> Total Penyerapan
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <TrendingUp className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        {/* Card 4: RATA-RATA SERAPAN */}
        <Card className={`relative overflow-hidden transition-all ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`}>
          <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600"></div>
          <CardContent className={`m-3 ml-4 p-4 rounded-xl border flex flex-col justify-center gap-3 min-h-[118px] ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
            <div className="pt-1">
              <div className="flex items-center justify-between">
                <p className={`text-[11px] font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                  RATA-RATA SERAPAN
                </p>
                <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <h2 className={`text-2xl font-black tracking-tight ${isDark ? "text-white" : "text-black"}`}>
                  {avgPct.toFixed(1)}%
                </h2>
                <span className={`text-[10px] font-bold ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                  dari total pagu
                </span>
              </div>
            </div>

            <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-red-600 transition-all duration-500"
                style={{ width: `${Math.min(100, avgPct)}%` }}
              ></div>
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
              {filteredSatkers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-xs text-slate-500">
                    {satkers.length === 0
                      ? isAdmin
                        ? "Belum ada data Satker. Gunakan tombol \"Tambah Satker\" untuk menambahkan satuan kerja."
                        : "Belum ada data Satker. Hubungi administrator untuk menambahkan satuan kerja."
                      : "Tidak ada Satker yang cocok dengan pencarian atau filter."}
                  </TableCell>
                </TableRow>
              )}
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

      {/* Modal Tambah Satker */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200">
          <div className={`w-full max-w-lg rounded-2xl border p-6 shadow-2xl backdrop-blur-md ${
            isDark ? "bg-[#1e293b] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Building2 className="w-5 h-5 text-red-600" />
                Tambah Satuan Kerja (Satker) Baru
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSatker} className="mt-4 space-y-4 text-xs font-semibold">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-500 dark:text-slate-400">
                    Kode Satker *
                  </label>
                  <input
                    required
                    placeholder="Contoh: 652817"
                    value={formData.kode_satker}
                    onChange={(e) => setFormData({ ...formData, kode_satker: e.target.value })}
                    className={`w-full rounded-xl border px-3 py-2 text-xs outline-none ${
                      isDark ? "bg-[#0f172a] border-white/10 text-white focus:border-red-500" : "bg-white border-slate-300 text-slate-900 focus:border-red-500"
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-500 dark:text-slate-400">
                    Tingkat Wilayah
                  </label>
                  <select
                    value={formData.tingkat}
                    onChange={(e) => setFormData({ ...formData, tingkat: e.target.value })}
                    className={`w-full rounded-xl border px-3 py-2 text-xs outline-none ${
                      isDark ? "bg-[#0f172a] border-white/10 text-white focus:border-red-500" : "bg-white border-slate-300 text-slate-900 focus:border-red-500"
                    }`}
                  >
                    <option value="Kabupaten/Kota">Kabupaten/Kota</option>
                    <option value="Provinsi">Provinsi</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-500 dark:text-slate-400">
                  Nama Satuan Kerja *
                </label>
                <input
                  required
                  placeholder="Contoh: KPU Kabupaten Kepulauan Baru"
                  value={formData.nama_satker}
                  onChange={(e) => setFormData({ ...formData, nama_satker: e.target.value })}
                  className={`w-full rounded-xl border px-3 py-2 text-xs outline-none ${
                    isDark ? "bg-[#0f172a] border-white/10 text-white focus:border-red-500" : "bg-white border-slate-300 text-slate-900 focus:border-red-500"
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-500 dark:text-slate-400">
                  Alamat Kantor *
                </label>
                <input
                  required
                  placeholder="Contoh: Jl. Trans Sulawesi No. 10"
                  value={formData.alamat}
                  onChange={(e) => setFormData({ ...formData, alamat: e.target.value })}
                  className={`w-full rounded-xl border px-3 py-2 text-xs outline-none ${
                    isDark ? "bg-[#0f172a] border-white/10 text-white focus:border-red-500" : "bg-white border-slate-300 text-slate-900 focus:border-red-500"
                  }`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-500 dark:text-slate-400">
                    Alokasi Pagu (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.pagu || ""}
                    placeholder="0"
                    onChange={(e) => setFormData({ ...formData, pagu: Number(e.target.value) || 0 })}
                    className={`w-full rounded-xl border px-3 py-2 text-xs outline-none ${
                      isDark ? "bg-[#0f172a] border-white/10 text-white focus:border-red-500" : "bg-white border-slate-300 text-slate-900 focus:border-red-500"
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-500 dark:text-slate-400">
                    Realisasi Saat Ini (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.realisasi || ""}
                    placeholder="0"
                    onChange={(e) => setFormData({ ...formData, realisasi: Number(e.target.value) || 0 })}
                    className={`w-full rounded-xl border px-3 py-2 text-xs outline-none ${
                      isDark ? "bg-[#0f172a] border-white/10 text-white focus:border-red-500" : "bg-white border-slate-300 text-slate-900 focus:border-red-500"
                    }`}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className={`px-4 py-2 rounded-xl border text-xs font-bold ${
                    isDark ? "border-white/10 hover:bg-slate-800 text-gray-300" : "border-slate-300 hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-kpu-red px-5 py-2 text-white font-bold text-xs rounded-xl shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? "Menyimpan…" : "Simpan Satker"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

