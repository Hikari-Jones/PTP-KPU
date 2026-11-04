import { useState, useEffect, useCallback, useRef } from "react"
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
  X,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Badge } from "../ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { useAuth } from "../../context/AuthContext"
import { tahunAnggaranApi } from "../../../services/api"
import type {
  TahunAnggaranResponse,
  TahunAnggaranCreatePayload,
  TahunAnggaranUpdatePayload,
} from "./types"

interface Props {
  theme: "light" | "dark"
  onNavigate?: (tab: string) => void
}

const ITEMS_PER_PAGE = 8

export function TahunAnggaranView({ theme }: Props) {
  const isDark = theme === "dark"
  const readOnly = !useAuth().canEdit("anggaran")
  const [dataList, setDataList] = useState<TahunAnggaranResponse[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("Semua Status")
  const [currentPage, setCurrentPage] = useState(1)

  // Loading & Error states
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Modal & Drawer states
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<TahunAnggaranResponse | null>(null)
  const [detailItem, setDetailItem] = useState<TahunAnggaranResponse | null>(null)

  // Form state
  const [formTahun, setFormTahun] = useState<number>(new Date().getFullYear() + 1)
  const [formStatus, setFormStatus] = useState<"draft" | "active" | "closed">("draft")
  const [formMulai, setFormMulai] = useState<string>(`${new Date().getFullYear() + 1}-01-01`)
  const [formSelesai, setFormSelesai] = useState<string>(`${new Date().getFullYear() + 1}-12-31`)
  const [formDeskripsi, setFormDeskripsi] = useState<string>("")

  const requestIdRef = useRef(0)

  const formatRupiah = (val: number) => `Rp ${new Intl.NumberFormat("id-ID").format(val)}`

  // 1. Fetch Tahun Anggaran from backend
  const fetchTahunAnggaran = useCallback(async () => {
    const currentReq = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await tahunAnggaranApi.getAll({ limit: 100 })
      if (currentReq === requestIdRef.current) {
        setDataList(res.items || [])
      }
    } catch (e: any) {
      if (currentReq === requestIdRef.current) {
        setError(e.message || "Gagal memuat tahun anggaran dari server")
      }
    } finally {
      if (currentReq === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    fetchTahunAnggaran()
  }, [fetchTahunAnggaran])

  // Filtering
  const filteredData = dataList.filter((item) => {
    const term = searchQuery.toLowerCase()
    const matchSearch =
      item.tahun.toString().includes(term) ||
      (item.deskripsi || "").toLowerCase().includes(term) ||
      (item.nama_pembuat || "").toLowerCase().includes(term)
    const matchStatus = statusFilter === "Semua Status" || item.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalPages = Math.max(1, Math.ceil(filteredData.length / ITEMS_PER_PAGE))
  const activePage = Math.min(currentPage, totalPages)
  const firstItemIndex = (activePage - 1) * ITEMS_PER_PAGE
  const paginatedData = filteredData.slice(firstItemIndex, firstItemIndex + ITEMS_PER_PAGE)

  const activeYear = dataList.find((item) => item.status === "active")
  const nextDraftYear = dataList
    .filter((item) => item.status === "draft" && (!activeYear || item.tahun > activeYear.tahun))
    .sort((a, b) => a.tahun - b.tahun)[0]

  const summaryCards = [
    {
      label: "Tahun Aktif",
      value: activeYear?.tahun ? `TA ${activeYear.tahun}` : "-",
      description: activeYear ? "Sedang berjalan aktif" : "Belum ditentukan",
      icon: CheckCircle2,
    },
    {
      label: "Total Periode",
      value: `${dataList.length} Tahun`,
      description: "Terdata di backend",
      icon: Calendar,
    },
    {
      label: "Status Sistem",
      value: activeYear ? "Aktif" : "Non-Aktif",
      description: activeYear ? `Pagu: ${formatRupiah(activeYear.total_pagu)}` : "Tidak ada TA aktif",
      icon: BarChart2,
    },
    {
      label: "Tahun Berikutnya",
      value: nextDraftYear?.tahun ? `TA ${nextDraftYear.tahun}` : "-",
      description: nextDraftYear?.status ? `Status: ${nextDraftYear.status}` : "Belum tersedia",
      icon: FileText,
    },
  ]

  const handleOpenAdd = () => {
    const nextYear = (dataList.length > 0 ? Math.max(...dataList.map((d) => d.tahun)) : new Date().getFullYear()) + 1
    setSelectedItem(null)
    setFormTahun(nextYear)
    setFormStatus("draft")
    setFormMulai(`${nextYear}-01-01`)
    setFormSelesai(`${nextYear}-12-31`)
    setFormDeskripsi("")
    setError(null)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (item: TahunAnggaranResponse) => {
    setSelectedItem(item)
    setFormTahun(item.tahun)
    setFormStatus(item.status)
    setFormMulai(item.tanggal_mulai ? item.tanggal_mulai.split("T")[0] : `${item.tahun}-01-01`)
    setFormSelesai(item.tanggal_selesai ? item.tanggal_selesai.split("T")[0] : `${item.tahun}-12-31`)
    setFormDeskripsi(item.deskripsi || "")
    setError(null)
    setIsModalOpen(true)
  }

  const handleCloseForm = () => {
    setIsModalOpen(false)
    setSelectedItem(null)
    setError(null)
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      if (selectedItem) {
        // Update Tahun Anggaran
        const payload: TahunAnggaranUpdatePayload = {
          status: formStatus,
          tanggal_mulai: formMulai,
          tanggal_selesai: formSelesai,
          deskripsi: formDeskripsi.trim() || undefined,
        }
        // Field tahun hanya boleh dikirim jika status draft
        if (selectedItem.status === "draft") {
          payload.tahun = formTahun
        }
        await tahunAnggaranApi.update(selectedItem.id_tahun_anggaran, payload)
        setSuccessMessage(`Tahun Anggaran ${selectedItem.tahun} berhasil diperbarui!`)
      } else {
        // Create Tahun Anggaran (Auto-Pagu akan otomatis dibuat oleh backend jika status active)
        const payload: TahunAnggaranCreatePayload = {
          tahun: formTahun,
          status: formStatus,
          tanggal_mulai: formMulai,
          tanggal_selesai: formSelesai,
          deskripsi: formDeskripsi.trim() || undefined,
        }
        await tahunAnggaranApi.create(payload)
        setSuccessMessage(`Tahun Anggaran ${formTahun} berhasil dibuat!`)
      }
      setTimeout(() => setSuccessMessage(null), 4000)
      setIsModalOpen(false)
      setSelectedItem(null)
      await fetchTahunAnggaran()
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan tahun anggaran")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (item: TahunAnggaranResponse) => {
    if (item.status !== "draft") {
      alert("Hanya tahun anggaran berstatus 'draft' yang dapat dihapus.")
      return
    }
    if (confirm(`Apakah Anda yakin ingin menghapus Tahun Anggaran ${item.tahun} (Draft)?`)) {
      setLoading(true)
      try {
        await tahunAnggaranApi.delete(item.id_tahun_anggaran)
        setSuccessMessage(`Tahun Anggaran ${item.tahun} berhasil dihapus.`)
        setTimeout(() => setSuccessMessage(null), 4000)
        await fetchTahunAnggaran()
      } catch (e: any) {
        setError(e.message || "Gagal menghapus tahun anggaran")
      } finally {
        setLoading(false)
      }
    }
  }

  const handleExportExcel = () => {
    let csv = "ID,Tahun,Status,Tanggal Mulai,Tanggal Selesai,Total Pagu,Total Realisasi,Sisa,Serapan (%),Deskripsi\n"
    filteredData.forEach((row) => {
      csv += `"${row.id_tahun_anggaran}","${row.tahun}","${row.status}","${row.tanggal_mulai}","${row.tanggal_selesai}",${row.total_pagu},${row.total_realisasi_verified},${row.sisa_anggaran},${row.persentase_serapan}%,"${row.deskripsi || ""}"\n`
    })
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `Tahun_Anggaran_KPU_Sulut_${new Date().toISOString().split("T")[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Title */}
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
          Realisasi Anggaran
        </p>
        <h1 className={`text-xl font-bold tracking-tight my-0 ${isDark ? "text-white" : "text-black"}`}>
          Master Tahun Anggaran
        </h1>
        <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-400" : "text-slate-600"}`}>
          Kelola siklus tahun anggaran (draft → active → closed). Pagu anggaran akan dibuat otomatis saat tahun diaktifkan.
        </p>
      </div>

      {/* Success & Error Banners */}
      {successMessage && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {error && !isModalOpen && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs font-bold text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary Stat Cards */}
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
          <div className="relative min-w-[240px]">
            <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-gray-400" : "text-slate-500"}`} />
            <input
              type="text"
              placeholder="Cari tahun anggaran..."
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
            <option value="active">Aktif (active)</option>
            <option value="draft">Draft</option>
            <option value="closed">Ditutup (closed)</option>
          </select>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchTahunAnggaran}
            disabled={loading}
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
              isDark ? "bg-[#0f172a] border-white/10 text-gray-300 hover:bg-[#1e293b]" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-red-500" : ""}`} />
            Refresh
          </button>
          <button
            onClick={handleExportExcel}
            className={`px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-all active:scale-95 ${
              isDark
                ? "bg-[#0f172a] border-white/10 text-gray-300 hover:bg-[#1e293b] hover:text-white"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs"
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          {!readOnly && (
            <button
              onClick={handleOpenAdd}
              className="btn-kpu-red px-4 py-2 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer transition-all active:scale-95 shadow-md shadow-red-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Tahun Anggaran</span>
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 gap-3 text-xs font-semibold text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-red-600" />
          Memuat data tahun anggaran dari server...
        </div>
      )}

      {/* Main Table */}
      {!loading && (
        <Card className={`rounded-2xl border overflow-hidden ${isDark ? "bg-[#0f172a]/90 border-white/10" : "bg-white border-slate-200 shadow-sm"}`}>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className={isDark ? "border-b border-white/10 bg-[#0a0f1d]" : "border-b border-slate-200 bg-slate-50"}>
                  <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>TAHUN</TableHead>
                  <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>STATUS</TableHead>
                  <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>TANGGAL MULAI</TableHead>
                  <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>TANGGAL SELESAI</TableHead>
                  <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>TOTAL PAGU</TableHead>
                  <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>REALISASI</TableHead>
                  <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>SERAPAN</TableHead>
                  <TableHead className={`w-[132px] min-w-[132px] px-3 text-center text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                    AKSI
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-xs text-gray-400">
                      Tidak ada data tahun anggaran ditemukan.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedData.map((row) => (
                    <TableRow
                      key={row.id_tahun_anggaran}
                      className={`border-b ${isDark ? "border-white/5" : "border-slate-100"}`}
                    >
                      <TableCell className="font-mono text-sm font-black text-red-600 dark:text-red-400">
                        {row.tahun}
                      </TableCell>
                      <TableCell>
                        {row.status === "active" && <Badge variant="default">Aktif</Badge>}
                        {row.status === "draft" && <Badge variant="draft">Draft</Badge>}
                        {row.status === "closed" && <Badge variant="success">Ditutup</Badge>}
                      </TableCell>
                      <TableCell className={`text-xs font-semibold ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                        {row.tanggal_mulai ? row.tanggal_mulai.split("T")[0] : "-"}
                      </TableCell>
                      <TableCell className={`text-xs font-semibold ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                        {row.tanggal_selesai ? row.tanggal_selesai.split("T")[0] : "-"}
                      </TableCell>
                      <TableCell className={`text-xs font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                        {formatRupiah(row.total_pagu)}
                      </TableCell>
                      <TableCell className="text-xs font-bold text-red-600 dark:text-red-400">
                        {formatRupiah(row.total_realisasi_verified)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[90px]">
                          <div className={`h-2 flex-1 overflow-hidden rounded-full ${isDark ? "bg-slate-800" : "bg-slate-200"}`}>
                            <div className="h-full rounded-full bg-red-600" style={{ width: `${Math.min(row.persentase_serapan || 0, 100)}%` }} />
                          </div>
                          <span className="text-[11px] font-bold text-red-600 dark:text-red-400">{row.persentase_serapan || 0}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="w-[132px] min-w-[132px] px-3 text-center">
                        <div className="inline-flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setDetailItem(row)}
                            title="Lihat Detail"
                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {row.status === "closed" ? (
                            <span title="Tahun anggaran ditutup (Read-Only)" className="p-1.5 text-gray-500">
                              <Lock className="w-3.5 h-3.5" />
                            </span>
                          ) : readOnly ? (
                            <span className="text-[11px] font-semibold text-slate-400">Baca saja</span>
                          ) : (
                            <>
                              <button
                                onClick={() => handleOpenEdit(row)}
                                title="Edit Status / Tanggal"
                                className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              {row.status === "draft" && (
                                <button
                                  onClick={() => handleDelete(row)}
                                  title="Hapus Draft"
                                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-rose-500 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className={`p-4 flex items-center justify-between text-xs border-t ${
              isDark ? "border-white/10 text-gray-400" : "border-slate-200 text-slate-600"
            }`}>
              <span>
                {filteredData.length === 0
                  ? "Tidak ada data untuk ditampilkan"
                  : `Menampilkan ${firstItemIndex + 1}-${Math.min(firstItemIndex + ITEMS_PER_PAGE, filteredData.length)} dari ${filteredData.length} data`}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={activePage === 1}
                  className={`p-1.5 rounded-lg border transition-colors ${
                    activePage === 1 ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:border-red-500 hover:text-red-500"
                  } ${isDark ? "border-white/10" : "border-slate-200"}`}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
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
                  className={`p-1.5 rounded-lg border transition-colors ${
                    activePage === totalPages ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:border-red-500 hover:text-red-500"
                  } ${isDark ? "border-white/10" : "border-slate-200"}`}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Drawer Detail */}
      {detailItem && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/65 backdrop-blur-[2px] animate-in fade-in duration-200"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailItem(null)
          }}
        >
          <aside
            role="dialog"
            className={`h-full w-full sm:max-w-[520px] overflow-y-auto border-l shadow-2xl animate-in slide-in-from-right duration-300 ${
              isDark ? "bg-[#0f172a] border-white/10 text-white" : "bg-white border-slate-200 text-slate-950"
            }`}
          >
            <div className={`sticky top-0 z-10 flex items-start justify-between gap-4 border-b px-5 py-5 sm:px-6 ${
              isDark ? "bg-[#0f172a]/95 border-white/10" : "bg-white/95 border-slate-200"
            } backdrop-blur-md`}>
              <div>
                <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
                  Realisasi Anggaran
                </p>
                <h2 className="text-xl font-black tracking-tight">Detail Tahun Anggaran</h2>
                <p className={`mt-1 text-xs font-semibold ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                  Informasi lengkap TA {detailItem.tahun}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailItem(null)}
                className={`mt-0.5 rounded-xl border p-2 transition-colors cursor-pointer ${
                  isDark ? "border-white/10 text-gray-400 hover:bg-white/5 hover:text-white" : "border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-6 p-5 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-xl font-black text-white shadow-lg shadow-red-600/20">
                  {String(detailItem.tahun).slice(-2)}
                </div>
                <div>
                  <p className="text-3xl font-black leading-none tracking-tight text-red-600 dark:text-red-400">
                    {detailItem.tahun}
                  </p>
                  <div className="mt-2">
                    {detailItem.status === "active" && <Badge variant="default">Aktif</Badge>}
                    {detailItem.status === "draft" && <Badge variant="draft">Draft</Badge>}
                    {detailItem.status === "closed" && <Badge variant="success">Ditutup</Badge>}
                  </div>
                </div>
              </div>

              <section className={`rounded-2xl border p-4 ${isDark ? "bg-[#162033] border-white/5" : "bg-slate-50 border-slate-200"}`}>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-red-600 dark:text-red-400">
                  Periode Anggaran
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-bold sm:text-base">
                  <span>{detailItem.tanggal_mulai ? detailItem.tanggal_mulai.split("T")[0] : "-"}</span>
                  <ChevronRight className={`h-4 w-4 ${isDark ? "text-gray-500" : "text-slate-400"}`} />
                  <span>{detailItem.tanggal_selesai ? detailItem.tanggal_selesai.split("T")[0] : "-"}</span>
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-red-600 dark:text-red-400">
                    Ringkasan Keuangan
                  </h3>
                </div>
                <div className={`divide-y rounded-2xl border px-4 ${isDark ? "divide-white/5 border-white/5 bg-[#111b2e]" : "divide-slate-200 border-slate-200 bg-white"}`}>
                  <div className="flex items-center justify-between gap-4 py-3 text-sm">
                    <span className={isDark ? "text-gray-400" : "text-slate-600"}>Total Pagu Anggaran</span>
                    <span className="font-mono font-black text-slate-900 dark:text-white">{formatRupiah(detailItem.total_pagu)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3 text-sm">
                    <span className={isDark ? "text-gray-400" : "text-slate-600"}>Total Realisasi Verified</span>
                    <span className="font-mono font-black text-red-600 dark:text-red-400">{formatRupiah(detailItem.total_realisasi_verified)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3 text-sm">
                    <span className={isDark ? "text-gray-400" : "text-slate-600"}>Sisa Anggaran</span>
                    <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">{formatRupiah(detailItem.sisa_anggaran)}</span>
                  </div>
                  <div className="py-3">
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className={isDark ? "text-gray-400" : "text-slate-600"}>Persentase Serapan</span>
                      <span className="font-black text-red-600 dark:text-red-400">{detailItem.persentase_serapan}%</span>
                    </div>
                    <div className={`h-2 overflow-hidden rounded-full ${isDark ? "bg-slate-800" : "bg-slate-200"}`}>
                      <div className="h-full rounded-full bg-red-600" style={{ width: `${Math.min(detailItem.persentase_serapan, 100)}%` }} />
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-red-600 dark:text-red-400">
                  Deskripsi & Metadata
                </h3>
                <div className={`rounded-2xl border p-4 text-xs font-semibold leading-relaxed ${isDark ? "bg-[#162033] border-white/5 text-gray-200" : "bg-slate-50 border-slate-200 text-slate-700"}`}>
                  <p>{detailItem.deskripsi || "Tidak ada deskripsi tambahan."}</p>
                  <p className="mt-2 text-[10px] text-slate-400">Dibuat oleh: {detailItem.nama_pembuat || "Administrator KPU"}</p>
                </div>
              </section>
            </div>
          </aside>
        </div>
      )}

      {/* Modal Tambah / Edit Tahun Anggaran */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${
            isDark ? "bg-[#0f172a] border-white/10 text-white" : "bg-white border-slate-200 text-black"
          }`}>
            <div className={`p-4 border-b flex items-center justify-between ${
              isDark ? "border-white/10 bg-[#0a0f1d]" : "border-slate-200 bg-slate-50"
            }`}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Tahun Anggaran</p>
                <h3 className="text-sm font-bold">
                  {selectedItem ? `Edit Tahun Anggaran ${selectedItem.tahun}` : "Tambah Tahun Anggaran Baru"}
                </h3>
              </div>
              <button
                onClick={handleCloseForm}
                className="p-1 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-5 space-y-4 text-xs">
              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold mb-1">
                  Angka Tahun {selectedItem && selectedItem.status !== "draft" && <span className="text-rose-400">(Terkunci - Hanya draft yang dapat diubah)</span>}
                </label>
                <input
                  type="number"
                  required
                  disabled={selectedItem ? selectedItem.status !== "draft" : false}
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
                    selectedItem && selectedItem.status !== "draft" ? "opacity-60 cursor-not-allowed bg-slate-800" : isDark ? "bg-[#131b2e] border-white/10 text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                  }`}
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Status Lifecycle (Phase 9 Rules)</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as "draft" | "active" | "closed")}
                  className={`w-full px-3 py-2 rounded-xl border outline-none font-bold cursor-pointer ${
                    isDark ? "bg-[#131b2e] border-white/10 text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                  }`}
                >
                  {/* Allowed transitions based on Phase 9 lifecycle:
                      - From draft: can be draft or active
                      - From active: can be active or closed
                      - From closed: closed only (read-only)
                  */}
                  {!selectedItem && (
                    <>
                      <option value="draft">Draft (Persiapan)</option>
                      <option value="active">Active (Aktif & Buat Auto-Pagu)</option>
                    </>
                  )}
                  {selectedItem && selectedItem.status === "draft" && (
                    <>
                      <option value="draft">Draft (Tetap Draft)</option>
                      <option value="active">Active (Aktifkan & Trigger Auto-Pagu)</option>
                    </>
                  )}
                  {selectedItem && selectedItem.status === "active" && (
                    <>
                      <option value="active">Active (Sedang Berjalan)</option>
                      <option value="closed">Closed (Tutup Tahun Anggaran)</option>
                    </>
                  )}
                  {selectedItem && selectedItem.status === "closed" && (
                    <option value="closed">Closed (Sudah Ditutup - Permanen)</option>
                  )}
                </select>
                <p className="mt-1 text-[10px] text-slate-400">
                  {formStatus === "active" && "Mengaktifkan tahun akan memicu pembuatan pagu otomatis untuk seluruh akun aktif."}
                  {formStatus === "closed" && "Tahun yang ditutup akan dikunci secara permanen dan tidak dapat dibuka kembali."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Tanggal Mulai</label>
                  <input
                    type="date"
                    required
                    value={formMulai}
                    onChange={(e) => setFormMulai(e.target.value)}
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
                    min={formMulai}
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
                  placeholder="Keterangan tahun anggaran..."
                  className={`w-full px-3 py-2 rounded-xl border outline-none ${
                    isDark ? "bg-[#131b2e] border-white/10 text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                  }`}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  disabled={submitting}
                  className={`px-4 py-2 rounded-xl border font-bold cursor-pointer ${
                    isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-kpu-red px-5 py-2 text-white font-bold rounded-xl flex items-center gap-2 cursor-pointer shadow-md hover:opacity-95"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {submitting ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
