import { useState } from "react"
import {
  CheckCircle2,
  Calendar,
  BarChart2,
  FileText,
  Search,
  Download,
  Plus,
  Eye,
  Pencil,
  Lock,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X
} from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Badge } from "../ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import type { TahunAnggaranItem } from "./types"

interface Props {
  theme: "light" | "dark"
  onNavigate?: (tab: string) => void
}

const INITIAL_TA: TahunAnggaranItem[] = [
  {
    id: "ta-2018",
    tahun: 2018,
    status: "Ditutup",
    tanggalMulai: "1 Jan 2018",
    tanggalSelesai: "31 Des 2018",
    deskripsi: "Tahun anggaran telah selesai dan ditutup",
    dibuatOleh: "Admin KPU",
  },
  {
    id: "ta-2019",
    tahun: 2019,
    status: "Ditutup",
    tanggalMulai: "1 Jan 2019",
    tanggalSelesai: "31 Des 2019",
    deskripsi: "Tahun anggaran telah selesai dan ditutup",
    dibuatOleh: "Admin KPU",
  },
  {
    id: "ta-2020",
    tahun: 2020,
    status: "Ditutup",
    tanggalMulai: "1 Jan 2020",
    tanggalSelesai: "31 Des 2020",
    deskripsi: "Tahun anggaran telah selesai dan ditutup",
    dibuatOleh: "Admin KPU",
  },
  {
    id: "ta-2021",
    tahun: 2021,
    status: "Ditutup",
    tanggalMulai: "1 Jan 2021",
    tanggalSelesai: "31 Des 2021",
    deskripsi: "Tahun anggaran telah selesai dan ditutup",
    dibuatOleh: "Admin KPU",
  },
  {
    id: "ta-2022",
    tahun: 2022,
    status: "Ditutup",
    tanggalMulai: "1 Jan 2022",
    tanggalSelesai: "31 Des 2022",
    deskripsi: "Tahun anggaran telah selesai dan ditutup",
    dibuatOleh: "Admin KPU",
  },
  {
    id: "ta-2023",
    tahun: 2023,
    status: "Ditutup",
    tanggalMulai: "1 Jan 2023",
    tanggalSelesai: "31 Des 2023",
    deskripsi: "Tahun anggaran telah selesai dan ditutup",
    dibuatOleh: "Admin KPU",
  },
  {
    id: "ta-2024",
    tahun: 2024,
    status: "Ditutup",
    tanggalMulai: "1 Jan 2024",
    tanggalSelesai: "31 Des 2024",
    deskripsi: "Tahun anggaran telah selesai dan ditutup",
    dibuatOleh: "Admin KPU",
  },
  {
    id: "ta-2025",
    tahun: 2025,
    status: "Aktif",
    tanggalMulai: "1 Jan 2025",
    tanggalSelesai: "31 Des 2025",
    deskripsi: "Tahun anggaran berjalan aktif",
    dibuatOleh: "Admin KPU",
  },
  {
    id: "ta-2026",
    tahun: 2026,
    status: "Draft",
    tanggalMulai: "1 Jan 2026",
    tanggalSelesai: "31 Des 2026",
    deskripsi: "Persiapan tahun anggaran 2026",
    dibuatOleh: "Admin KPU",
  },
  {
    id: "ta-2027",
    tahun: 2027,
    status: "Draft",
    tanggalMulai: "1 Jan 2027",
    tanggalSelesai: "31 Des 2027",
    deskripsi: "Rancangan awal tahun anggaran 2027",
    dibuatOleh: "Admin KPU",
  },
  {
    id: "ta-2028",
    tahun: 2028,
    status: "Draft",
    tanggalMulai: "1 Jan 2028",
    tanggalSelesai: "31 Des 2028",
    deskripsi: "Proyeksi tahun anggaran jangka menengah",
    dibuatOleh: "Admin KPU",
  },
]

const FINANCIAL_SUMMARY: Record<number, { pagu: number; realisasi: number; akun: number; transaksi: number }> = {
  2018: { pagu: 24.75, realisasi: 23.61, akun: 7, transaksi: 142 },
  2019: { pagu: 27.4, realisasi: 26.18, akun: 7, transaksi: 156 },
  2020: { pagu: 29.85, realisasi: 27.92, akun: 8, transaksi: 163 },
  2021: { pagu: 32.6, realisasi: 30.88, akun: 8, transaksi: 179 },
  2022: { pagu: 36.2, realisasi: 33.7, akun: 8, transaksi: 198 },
  2023: { pagu: 39.5, realisasi: 36.85, akun: 8, transaksi: 214 },
  2024: { pagu: 42.1, realisasi: 39.64, akun: 9, transaksi: 231 },
  2025: { pagu: 45.78, realisasi: 31.25, akun: 9, transaksi: 186 },
  2026: { pagu: 48, realisasi: 0, akun: 9, transaksi: 0 },
  2027: { pagu: 51.25, realisasi: 0, akun: 10, transaksi: 0 },
  2028: { pagu: 54.4, realisasi: 0, akun: 10, transaksi: 0 },
}

const ITEMS_PER_PAGE = 4

const MONTH_NUMBER: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  Mei: "05",
  Jun: "06",
  Jul: "07",
  Agu: "08",
  Sep: "09",
  Okt: "10",
  Nov: "11",
  Des: "12",
}

const MONTH_NAME = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]

const toDateInputValue = (displayDate: string) => {
  const [day, month, year] = displayDate.split(" ")
  if (!day || !month || !year || !MONTH_NUMBER[month]) return ""
  return `${year}-${MONTH_NUMBER[month]}-${day.padStart(2, "0")}`
}

const toDisplayDate = (inputDate: string) => {
  const [year, month, day] = inputDate.split("-")
  const monthName = MONTH_NAME[Number(month) - 1]
  if (!year || !monthName || !day) return inputDate
  return `${Number(day)} ${monthName} ${year}`
}

export function TahunAnggaranView({ theme }: Props) {
  const isDark = theme === "dark"
  const [dataList, setDataList] = useState<TahunAnggaranItem[]>(INITIAL_TA)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("Semua Status")
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<TahunAnggaranItem | null>(null)
  const [detailItem, setDetailItem] = useState<TahunAnggaranItem | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  // New TA form state
  const [formTahun, setFormTahun] = useState(new Date().getFullYear() + 2)
  const [formStatus, setFormStatus] = useState<"Draft" | "Aktif" | "Ditutup">("Draft")
  const [formMulai, setFormMulai] = useState("2027-01-01")
  const [formSelesai, setFormSelesai] = useState("2027-12-31")
  const [formDeskripsi, setFormDeskripsi] = useState("")

  const filteredData = dataList.filter((item) => {
    const matchSearch =
      item.tahun.toString().includes(searchQuery) ||
      item.deskripsi.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.dibuatOleh.toLowerCase().includes(searchQuery.toLowerCase())
    const matchStatus = statusFilter === "Semua Status" || item.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalPages = Math.max(1, Math.ceil(filteredData.length / ITEMS_PER_PAGE))
  const activePage = Math.min(currentPage, totalPages)
  const firstItemIndex = (activePage - 1) * ITEMS_PER_PAGE
  const paginatedData = filteredData.slice(firstItemIndex, firstItemIndex + ITEMS_PER_PAGE)

  const activeYear = dataList.find((item) => item.status === "Aktif")
  const nextYear = dataList
    .filter((item) => item.status === "Draft" && (!activeYear || item.tahun > activeYear.tahun))
    .sort((a, b) => a.tahun - b.tahun)[0]

  const summaryCards = [
    {
      label: "Tahun Aktif",
      value: activeYear?.tahun ?? "-",
      description: activeYear ? "Sedang berjalan" : "Belum ditentukan",
      icon: CheckCircle2,
    },
    {
      label: "Total Tahun",
      value: `${dataList.length} Tahun`,
      description: "Terdaftar",
      icon: Calendar,
    },
    {
      label: "Status Sistem",
      value: activeYear ? "Aktif" : "Tidak aktif",
      description: activeYear ? `TA ${activeYear.tahun}` : "Tidak ada TA aktif",
      icon: BarChart2,
    },
    {
      label: "Tahun Berikutnya",
      value: nextYear?.tahun ?? "-",
      description: nextYear?.status ?? "Belum tersedia",
      icon: FileText,
    },
  ]

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (selectedItem) {
      setDataList((prev) =>
        prev.map((item) =>
          item.id === selectedItem.id
            ? {
                ...item,
                tahun: Number(formTahun),
                status: formStatus,
                tanggalMulai: toDisplayDate(formMulai),
                tanggalSelesai: toDisplayDate(formSelesai),
                deskripsi: formDeskripsi || `Tahun anggaran ${formTahun}`,
              }
            : item
        )
      )
    } else {
      const newItem: TahunAnggaranItem = {
        id: `ta-${formTahun}-${Date.now()}`,
        tahun: Number(formTahun),
        status: formStatus,
        tanggalMulai: toDisplayDate(formMulai),
        tanggalSelesai: toDisplayDate(formSelesai),
        deskripsi: formDeskripsi || `Tahun anggaran ${formTahun}`,
        dibuatOleh: "Admin KPU",
      }
      setDataList((prev) => [...prev, newItem])
    }

    setIsModalOpen(false)
    setSelectedItem(null)
    setFormDeskripsi("")
  }

  const handleOpenAdd = () => {
    const nextAvailableYear = Math.max(...dataList.map((item) => item.tahun), new Date().getFullYear()) + 1
    setSelectedItem(null)
    setFormTahun(nextAvailableYear)
    setFormStatus("Draft")
    setFormMulai(`${nextAvailableYear}-01-01`)
    setFormSelesai(`${nextAvailableYear}-12-31`)
    setFormDeskripsi("")
    setIsModalOpen(true)
  }

  const handleOpenEdit = (item: TahunAnggaranItem) => {
    setSelectedItem(item)
    setFormTahun(item.tahun)
    setFormStatus(item.status)
    setFormMulai(toDateInputValue(item.tanggalMulai))
    setFormSelesai(toDateInputValue(item.tanggalSelesai))
    setFormDeskripsi(item.deskripsi)
    setIsModalOpen(true)
  }

  const handleCloseForm = () => {
    setIsModalOpen(false)
    setSelectedItem(null)
  }

  const handleDelete = (id: string) => {
    if (confirm("Apakah Anda yakin ingin menghapus tahun anggaran ini?")) {
      setDataList((prev) => prev.filter((d) => d.id !== id))
    }
  }

  const handleExportExcel = () => {
    let csv = "Tahun,Status,Tanggal Mulai,Tanggal Selesai,Deskripsi,Dibuat Oleh\n"
    filteredData.forEach((row) => {
      csv += `"${row.tahun}","${row.status}","${row.tanggalMulai}","${row.tanggalSelesai}","${row.deskripsi}","${row.dibuatOleh}"\n`
    })
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "Tahun_Anggaran_KPU_Sulut.csv"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const getFinancialSummary = (year: number) => {
    const summary = FINANCIAL_SUMMARY[year] ?? { pagu: 0, realisasi: 0, akun: 0, transaksi: 0 }
    const remaining = Math.max(summary.pagu - summary.realisasi, 0)
    const percentage = summary.pagu > 0 ? Math.round((summary.realisasi / summary.pagu) * 100) : 0

    return { ...summary, remaining, percentage }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Page Title & Subtitle */}
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
          Realisasi Anggaran
        </p>
        <h1 className={`text-xl font-bold tracking-tight my-0 ${isDark ? "text-white" : "text-black"}`}>
          Tahun Anggaran
        </h1>
        <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-400" : "text-slate-600"}`}>
          Kelola periode tahun anggaran yang digunakan dalam seluruh proses pengelolaan pagu, realisasi, dan laporan.
        </p>
      </div>

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map(({ label, value, description, icon: Icon }) => (
          <Card
            key={label}
            className={`relative overflow-hidden rounded-2xl border shadow-lg backdrop-blur-md transition-all ${
              isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"
            }`}
          >
            <div className="absolute inset-y-0 left-0 w-1.5 bg-red-600" />
            <CardContent
              className={`m-3 ml-4 p-4 rounded-xl border flex items-center justify-between gap-4 min-h-[118px] ${
                isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"
              }`}
            >
              <div className="min-w-0 flex-1 flex flex-col justify-center">
                <p className={`text-[11px] font-extrabold uppercase tracking-wider ${
                  isDark ? "text-gray-300" : "text-slate-800"
                }`}>
                  {label}
                </p>
                <h2 className={`mt-1 text-2xl font-black leading-tight tracking-tight ${
                  isDark ? "text-white" : "text-black"
                }`}>
                  {value}
                </h2>
                <p className={`mt-1 text-[10px] font-bold ${
                  isDark ? "text-gray-400" : "text-slate-600"
                }`}>
                  {description}
                </p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Icon className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search, Filter & Action Buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="relative min-w-[240px]">
            <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-gray-400" : "text-slate-500"}`} />
          <input
              type="text"
              placeholder="Cari tahun anggaran.."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border outline-none font-medium transition-colors ${
                isDark
                  ? "bg-[#0f172a] border-white/10 text-white placeholder-gray-500 focus:border-red-500"
                  : "bg-white border-slate-200 text-black placeholder-slate-400 focus:border-red-500 shadow-xs"
              }`}
            />
          </div>

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setCurrentPage(1)
            }}
            className={`px-3 py-2 text-xs rounded-xl border outline-none font-bold cursor-pointer ${
              isDark
                ? "bg-[#0f172a] border-white/10 text-white focus:border-red-500"
                : "bg-white border-slate-200 text-black focus:border-red-500 shadow-xs"
            }`}
          >
            <option value="Semua Status">Semua Status</option>
            <option value="Aktif">Aktif</option>
            <option value="Draft">Draft</option>
            <option value="Ditutup">Ditutup</option>
          </select>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Export Excel Button */}
          <button
            onClick={handleExportExcel}
            className={`px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-all active:scale-95 ${
              isDark
                ? "bg-[#0f172a] border-white/10 text-gray-300 hover:bg-[#1e293b] hover:text-white"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs"
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Export Excel</span>
          </button>

          {/* Tambah Tahun Anggaran Button */}
          <button
            onClick={handleOpenAdd}
            className="btn-kpu-red px-4 py-2 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer transition-all active:scale-95 shadow-md shadow-red-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Tahun Anggaran</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <Card className={`rounded-2xl border overflow-hidden ${isDark ? "bg-[#0f172a]/90 border-white/10" : "bg-white border-slate-200 shadow-sm"}`}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className={isDark ? "border-b border-white/10 bg-[#0a0f1d]" : "border-b border-slate-200 bg-slate-50"}>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>TAHUN</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>STATUS</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>TANGGAL MULAI</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>TANGGAL SELESAI</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>DESKRIPSI</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>DIBUAT OLEH</TableHead>
                <TableHead className={`w-[132px] min-w-[132px] px-3 text-center text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                  <span className="flex w-full items-center justify-center">AKSI</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-xs text-gray-400">
                    Tidak ada data tahun anggaran ditemukan.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((row) => (
                  <TableRow
                    key={row.id}
                    className={`border-b ${
                      isDark ? "border-white/5" : "border-slate-100"
                    }`}
                  >
                    <TableCell className="font-mono text-sm font-black text-red-600 dark:text-red-400">
                      {row.tahun}
                    </TableCell>
                    <TableCell>
                      {row.status === "Aktif" && <Badge variant="default">Aktif</Badge>}
                      {row.status === "Draft" && <Badge variant="draft">Draft</Badge>}
                      {row.status === "Ditutup" && <Badge variant="success">Ditutup</Badge>}
                    </TableCell>
                    <TableCell className={`text-xs font-semibold ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                      {row.tanggalMulai}
                    </TableCell>
                    <TableCell className={`text-xs font-semibold ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                      {row.tanggalSelesai}
                    </TableCell>
                    <TableCell className={`text-xs font-medium max-w-xs truncate ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                      {row.deskripsi}
                    </TableCell>
                    <TableCell className={`text-xs font-semibold ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                      {row.dibuatOleh}
                    </TableCell>
                    <TableCell className="w-[132px] min-w-[132px] px-3 text-center">
                      <div className="inline-flex items-center justify-center gap-2">
                        <button
                          onClick={() => setDetailItem(row)}
                          title="Lihat Detail"
                          aria-label={`Lihat detail tahun anggaran ${row.tahun}`}
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(row)}
                          title="Edit"
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {row.status === "Ditutup" ? (
                          <span title="Tahun anggaran terkunci" className="p-1.5 text-gray-500">
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <button
                            onClick={() => handleDelete(row.id)}
                            title="Hapus"
                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Table Footer / Pagination */}
          <div className={`p-4 flex items-center justify-between text-xs border-t ${
            isDark ? "border-white/10 text-gray-400" : "border-slate-200 text-slate-600"
          }`}>
            <span>
              {filteredData.length === 0
                ? "Tidak ada data untuk ditampilkan"
                : `Menampilkan ${firstItemIndex + 1}-${Math.min(firstItemIndex + ITEMS_PER_PAGE, filteredData.length)} dari ${filteredData.length} data`}
            </span>
            <div className="flex items-center gap-1.5" aria-label="Navigasi halaman">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={activePage === 1}
                aria-label="Halaman sebelumnya"
                className={`p-1.5 rounded-lg border transition-colors ${
                  activePage === 1
                    ? "opacity-40 cursor-not-allowed"
                    : "cursor-pointer hover:border-red-500 hover:text-red-500"
                } ${isDark ? "border-white/10" : "border-slate-200"}`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  aria-label={`Halaman ${page}`}
                  aria-current={activePage === page ? "page" : undefined}
                  className={`w-7 h-7 rounded-lg font-bold flex items-center justify-center text-xs transition-colors cursor-pointer ${
                    activePage === page
                      ? "bg-red-600 text-white shadow-sm shadow-red-600/20"
                      : isDark
                        ? "border border-white/10 text-gray-400 hover:border-red-500 hover:text-red-400"
                        : "border border-slate-200 text-slate-600 hover:border-red-500 hover:text-red-600"
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={activePage === totalPages}
                aria-label="Halaman berikutnya"
                className={`p-1.5 rounded-lg border transition-colors ${
                  activePage === totalPages
                    ? "opacity-40 cursor-not-allowed"
                    : "cursor-pointer hover:border-red-500 hover:text-red-500"
                } ${isDark ? "border-white/10" : "border-slate-200"}`}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail Tahun Anggaran */}
      {detailItem && (() => {
        const financial = getFinancialSummary(detailItem.tahun)
        const yearShort = String(detailItem.tahun).slice(-2)

        return (
          <div
            className="fixed inset-0 z-50 flex justify-end bg-slate-950/65 backdrop-blur-[2px] animate-in fade-in duration-200"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setDetailItem(null)
            }}
          >
            <aside
              role="dialog"
              aria-modal="true"
              aria-labelledby="detail-tahun-title"
              className={`h-full w-full sm:max-w-[520px] overflow-y-auto border-l shadow-2xl animate-in slide-in-from-right duration-300 ${
                isDark
                  ? "bg-[#0f172a] border-white/10 text-white"
                  : "bg-white border-slate-200 text-slate-950"
              }`}
            >
              <div className={`sticky top-0 z-10 flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-6 ${
                isDark ? "bg-[#0f172a]/95 border-white/10" : "bg-white/95 border-slate-200"
              } backdrop-blur-md`}>
                <div>
                  <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
                    Realisasi Anggaran
                  </p>
                  <h2 id="detail-tahun-title" className="text-xl font-black tracking-tight">
                    Detail Tahun Anggaran
                  </h2>
                  <p className={`mt-1 text-xs font-semibold ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                    Informasi lengkap TA {detailItem.tahun}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailItem(null)}
                  aria-label="Tutup detail tahun anggaran"
                  className={`mt-0.5 rounded-xl border p-2 transition-colors cursor-pointer ${
                    isDark
                      ? "border-white/10 text-gray-400 hover:bg-white/5 hover:text-white"
                      : "border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-6 p-5 sm:p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-xl font-black text-white shadow-lg shadow-red-600/20">
                    {yearShort}
                  </div>
                  <div>
                    <p className="text-3xl font-black leading-none tracking-tight text-red-600 dark:text-red-400">
                      {detailItem.tahun}
                    </p>
                    <div className="mt-2">
                      {detailItem.status === "Aktif" && <Badge variant="default">Aktif</Badge>}
                      {detailItem.status === "Draft" && <Badge variant="draft">Draft</Badge>}
                      {detailItem.status === "Ditutup" && <Badge variant="success">Ditutup</Badge>}
                    </div>
                  </div>
                </div>

                <section className={`rounded-2xl border p-4 ${
                  isDark ? "bg-[#162033] border-white/5" : "bg-slate-50 border-slate-200"
                }`}>
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-red-600 dark:text-red-400">
                    Periode
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-bold sm:text-base">
                    <span>{detailItem.tanggalMulai}</span>
                    <ChevronRight className={`h-4 w-4 ${isDark ? "text-gray-500" : "text-slate-400"}`} />
                    <span>{detailItem.tanggalSelesai}</span>
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-red-600 dark:text-red-400">
                      Ringkasan Keuangan
                    </h3>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                      isDark ? "bg-white/5 text-gray-400" : "bg-slate-100 text-slate-500"
                    }`}>
                      Dalam miliar rupiah
                    </span>
                  </div>
                  <div className={`divide-y rounded-2xl border px-4 ${
                    isDark ? "divide-white/5 border-white/5 bg-[#111b2e]" : "divide-slate-200 border-slate-200 bg-white"
                  }`}>
                    {[
                      { label: "Total Pagu Anggaran", value: financial.pagu, color: "text-slate-900 dark:text-white" },
                      { label: "Total Realisasi", value: financial.realisasi, color: "text-red-600 dark:text-red-400" },
                      { label: "Sisa Anggaran", value: financial.remaining, color: "text-slate-600 dark:text-gray-300" },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-4 py-3 text-sm">
                        <span className={isDark ? "text-gray-400" : "text-slate-600"}>{item.label}</span>
                        <span className={`font-mono font-black ${item.color}`}>
                          Rp {item.value.toFixed(2)} M
                        </span>
                      </div>
                    ))}
                    <div className="py-3">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className={isDark ? "text-gray-400" : "text-slate-600"}>Persentase Realisasi</span>
                        <span className="font-black text-red-600 dark:text-red-400">{financial.percentage}%</span>
                      </div>
                      <div
                        className={`h-2 overflow-hidden rounded-full ${isDark ? "bg-slate-800" : "bg-slate-200"}`}
                        role="progressbar"
                        aria-label="Persentase realisasi"
                        aria-valuenow={financial.percentage}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="h-full rounded-full bg-red-600 transition-all duration-500"
                          style={{ width: `${financial.percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-red-600 dark:text-red-400">
                    Informasi Lainnya
                  </h3>
                  <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-2xl border ${
                    isDark ? "border-white/5 bg-white/5" : "border-slate-200 bg-slate-200"
                  }`}>
                    {[
                      { label: "Jumlah Akun", value: `${financial.akun} Akun` },
                      { label: "Jumlah Transaksi", value: `${financial.transaksi} Transaksi` },
                      { label: "Dibuat Oleh", value: detailItem.dibuatOleh },
                      { label: "Status", value: detailItem.status },
                    ].map((item) => (
                      <div key={item.label} className={`min-w-0 p-4 ${isDark ? "bg-[#111b2e]" : "bg-white"}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wide ${
                          isDark ? "text-gray-500" : "text-slate-500"
                        }`}>
                          {item.label}
                        </p>
                        <p className="mt-1 truncate text-sm font-black" title={item.value}>
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-red-600 dark:text-red-400">
                    Deskripsi
                  </h3>
                  <div className={`rounded-2xl border p-4 text-sm font-semibold leading-relaxed ${
                    isDark ? "bg-[#162033] border-white/5 text-gray-200" : "bg-slate-50 border-slate-200 text-slate-700"
                  }`}>
                    {detailItem.deskripsi}
                  </div>
                </section>
              </div>
            </aside>
          </div>
        )
      })()}

      {/* Modal Tambah / Edit Tahun Anggaran */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${
            isDark ? "bg-[#0f172a] border-white/10 text-white" : "bg-white border-slate-200 text-black"
          }`}>
            <div className={`p-4 border-b flex items-center justify-between ${
              isDark ? "border-white/10 bg-[#0a0f1d]" : "border-slate-200 bg-slate-50"
            }`}>
              <h3 className="text-sm font-bold">
                {selectedItem ? "Edit Tahun Anggaran" : "Tambah Tahun Anggaran Baru"}
              </h3>
              <button
                onClick={handleCloseForm}
                className="p-1 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1">Tahun Anggaran</label>
                <input
                  type="number"
                  required
                  value={formTahun}
                  onChange={(e) => {
                    const year = Number(e.target.value)
                    setFormTahun(year)
                    if (String(year).length === 4) {
                      setFormMulai(`${year}-01-01`)
                      setFormSelesai(`${year}-12-31`)
                    }
                  }}
                  className={`w-full px-3 py-2 rounded-xl border outline-none font-bold ${
                    isDark ? "bg-[#131b2e] border-white/10 text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                  }`}
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Status</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as "Draft" | "Aktif" | "Ditutup")}
                  className={`w-full px-3 py-2 rounded-xl border outline-none font-bold ${
                    isDark ? "bg-[#131b2e] border-white/10 text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                  }`}
                >
                  <option value="Draft">Draft</option>
                  <option value="Aktif">Aktif</option>
                  <option value="Ditutup">Ditutup</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Tanggal Mulai</label>
                  <input
                    type="date"
                    required
                    value={formMulai}
                    onChange={(e) => setFormMulai(e.target.value)}
                    min={`${formTahun}-01-01`}
                    max={`${formTahun}-12-31`}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? "bg-[#131b2e] border-white/10 text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                    }`}
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Tanggal Selesai</label>
                  <input
                    type="date"
                    required
                    value={formSelesai}
                    onChange={(e) => setFormSelesai(e.target.value)}
                    min={formMulai || `${formTahun}-01-01`}
                    max={`${formTahun}-12-31`}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? "bg-[#131b2e] border-white/10 text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Deskripsi / Keterangan</label>
                <textarea
                  rows={3}
                  value={formDeskripsi}
                  onChange={(e) => setFormDeskripsi(e.target.value)}
                  placeholder="Deskripsi kegiatan tahun anggaran..."
                  className={`w-full px-3 py-2 rounded-xl border outline-none ${
                    isDark ? "bg-[#131b2e] border-white/10 text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                  }`}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className={`px-4 py-2 rounded-xl border font-bold cursor-pointer ${
                    isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-kpu-red px-5 py-2 text-white font-bold rounded-xl cursor-pointer"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
