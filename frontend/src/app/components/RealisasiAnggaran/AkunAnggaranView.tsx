import { useState, useEffect, useCallback, useRef } from "react"
import {
  Search,
  Download,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { Badge } from "../ui/badge"
import { useAuth } from "../../context/AuthContext"
import {
  akunAnggaranApi,
  bagianApi,
  tahunAnggaranApi,
} from "../../../services/api"
import type {
  AkunAnggaranResponse,
  AkunAnggaranCreatePayload,
  AkunAnggaranUpdatePayload,
  BagianResponse,
  TahunAnggaranResponse,
} from "./types"

interface Props {
  theme: "light" | "dark"
  onNavigate?: (tab: string) => void
}

const ITEMS_PER_PAGE = 10

export function AkunAnggaranView({ theme }: Props) {
  const isDark = theme === "dark"
  const readOnly = !useAuth().canEdit("anggaran")

  // Data states
  const [akunList, setAkunList] = useState<AkunAnggaranResponse[]>([])
  const [bagianList, setBagianList] = useState<BagianResponse[]>([])
  const [tahunList, setTahunList] = useState<TahunAnggaranResponse[]>([])

  // Filters
  const [selectedBagianId, setSelectedBagianId] = useState<number | "Semua">("Semua")
  const [selectedStatus, setSelectedStatus] = useState<string>("Semua Status")
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)

  // Loading & Error states
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<AkunAnggaranResponse | null>(null)

  // Form states
  const [formBagianId, setFormBagianId] = useState<number | "">("")
  const [formKode, setFormKode] = useState("")
  const [formNama, setFormNama] = useState("")
  const [formJenisBelanja, setFormJenisBelanja] = useState("Operasional")
  const [formProgram, setFormProgram] = useState("")
  const [formSubProgram, setFormSubProgram] = useState("")
  const [formStatus, setFormStatus] = useState<"active" | "inactive">("active")

  const requestIdRef = useRef(0)

  const formatRupiah = (val: number) => `Rp ${new Intl.NumberFormat("id-ID").format(val)}`

  // 1. Initial Load: Fetch Bagian & Tahun Anggaran
  useEffect(() => {
    let isMounted = true
    const initMaster = async () => {
      try {
        const [bgRes, taRes] = await Promise.all([
          bagianApi.getAll({ limit: 100 }).catch(() => []),
          tahunAnggaranApi.getAll({ limit: 100 }).catch(() => ({ total: 0, items: [] })),
        ])
        if (!isMounted) return
        setBagianList(bgRes)
        setTahunList(taRes.items || [])
      } catch (e: any) {
        console.warn("Gagal memuat master bagian / tahun", e)
      }
    }
    initMaster()
    return () => { isMounted = false }
  }, [])

  // 2. Fetch Akun Anggaran from backend
  const fetchAkunAnggaran = useCallback(async () => {
    const currentReq = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await akunAnggaranApi.getAll({
        id_bagian: selectedBagianId !== "Semua" ? Number(selectedBagianId) : undefined,
        status: selectedStatus !== "Semua Status" ? (selectedStatus as "active" | "inactive") : undefined,
        limit: 300,
      })
      if (currentReq === requestIdRef.current) {
        setAkunList(res.items || [])
      }
    } catch (e: any) {
      if (currentReq === requestIdRef.current) {
        setError(e.message || "Gagal memuat akun anggaran dari server")
      }
    } finally {
      if (currentReq === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [selectedBagianId, selectedStatus])

  useEffect(() => {
    fetchAkunAnggaran()
  }, [fetchAkunAnggaran])

  // Filter Search
  const filteredData = akunList.filter((item) => {
    const term = searchQuery.toLowerCase()
    return (
      item.kode_akun.toLowerCase().includes(term) ||
      item.nama_akun.toLowerCase().includes(term) ||
      (item.nama_bagian || "").toLowerCase().includes(term) ||
      (item.jenis_belanja || "").toLowerCase().includes(term) ||
      (item.program || "").toLowerCase().includes(term)
    )
  })

  const totalPages = Math.max(1, Math.ceil(filteredData.length / ITEMS_PER_PAGE))
  const activePage = Math.min(currentPage, totalPages)
  const firstItemIndex = (activePage - 1) * ITEMS_PER_PAGE
  const paginatedData = filteredData.slice(firstItemIndex, firstItemIndex + ITEMS_PER_PAGE)

  const handleOpenAdd = () => {
    setSelectedItem(null)
    setFormKode("")
    setFormNama("")
    setFormBagianId(bagianList.length > 0 ? bagianList[0].id_bagian : "")
    setFormJenisBelanja("Operasional")
    setFormProgram("")
    setFormSubProgram("")
    setFormStatus("active")
    setError(null)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (item: AkunAnggaranResponse) => {
    setSelectedItem(item)
    setFormKode(item.kode_akun)
    setFormNama(item.nama_akun)
    setFormBagianId(item.id_bagian)
    setFormJenisBelanja(item.jenis_belanja || "Operasional")
    setFormProgram(item.program || "")
    setFormSubProgram(item.sub_program || "")
    setFormStatus(item.status)
    setError(null)
    setIsModalOpen(true)
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formBagianId) {
      setError("Pilih bagian / divisi pengampu akun anggaran.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (selectedItem) {
        // Update Akun
        const payload: AkunAnggaranUpdatePayload = {
          id_bagian: Number(formBagianId),
          kode_akun: formKode.trim(),
          nama_akun: formNama.trim(),
          jenis_belanja: formJenisBelanja.trim() || undefined,
          program: formProgram.trim() || undefined,
          sub_program: formSubProgram.trim() || undefined,
          status: formStatus,
        }
        await akunAnggaranApi.update(selectedItem.id_akun_anggaran, payload)
        setSuccessMessage(`Akun ${formKode} berhasil diperbarui!`)
      } else {
        // Create Akun (Auto-Pagu akan otomatis dibuat oleh backend untuk tahun aktif!)
        const payload: AkunAnggaranCreatePayload = {
          id_bagian: Number(formBagianId),
          kode_akun: formKode.trim(),
          nama_akun: formNama.trim(),
          jenis_belanja: formJenisBelanja.trim() || undefined,
          program: formProgram.trim() || undefined,
          sub_program: formSubProgram.trim() || undefined,
          status: formStatus,
        }
        await akunAnggaranApi.create(payload)
        setSuccessMessage(`Akun anggaran ${formKode} berhasil dibuat! Pagu untuk tahun aktif dibuat otomatis oleh backend.`)
      }
      setTimeout(() => setSuccessMessage(null), 4000)
      setIsModalOpen(false)
      setSelectedItem(null)
      await fetchAkunAnggaran()
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan akun anggaran")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (item: AkunAnggaranResponse) => {
    if (confirm(`Apakah Anda yakin ingin menghapus akun ${item.kode_akun} — ${item.nama_akun}? Akun hanya dapat dihapus jika belum memiliki transaksi.`)) {
      setLoading(true)
      try {
        await akunAnggaranApi.delete(item.id_akun_anggaran)
        setSuccessMessage(`Akun ${item.kode_akun} berhasil dihapus.`)
        setTimeout(() => setSuccessMessage(null), 4000)
        await fetchAkunAnggaran()
      } catch (e: any) {
        setError(e.message || "Gagal menghapus akun anggaran")
      } finally {
        setLoading(false)
      }
    }
  }

  const handleExport = () => {
    let csv = "ID,Kode MAK,Nama Akun,Bagian,Jenis Belanja,Program,Sub Program,Status\n"
    filteredData.forEach((row) => {
      csv += `"${row.id_akun_anggaran}","${row.kode_akun}","${row.nama_akun}","${row.nama_bagian || ""}","${row.jenis_belanja || ""}","${row.program || ""}","${row.sub_program || ""}","${row.status}"\n`
    })
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `Master_Akun_Anggaran_KPU_Sulut_${new Date().toISOString().split("T")[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
            Realisasi Anggaran
          </p>
          <h1 className={`text-xl font-bold tracking-tight my-0 ${isDark ? "text-white" : "text-black"}`}>
            Master Akun Anggaran
          </h1>
          <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
            Kelola data master kode MAK dan klasifikasi belanja KPU Sulut. Akun aktif otomatis mendapatkan alokasi pagu pada tahun anggaran berjalan.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchAkunAnggaran}
            disabled={loading}
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
              isDark ? "border-slate-700 bg-slate-900 text-white hover:bg-slate-800" : "border-slate-300 bg-white text-black hover:bg-slate-50"
            }`}
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-red-500" : ""}`} />
            Refresh
          </button>
          <button
            onClick={handleExport}
            className={`px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-all active:scale-95 shadow-xs ${
              isDark ? "border-slate-700 bg-slate-900 text-white hover:bg-slate-800" : "border-slate-300 bg-white text-black hover:bg-slate-50"
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
              <span>Tambah Akun</span>
            </button>
          )}
        </div>
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

      {/* Filter Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Filter Bagian */}
        <div className="relative">
          <select
            value={selectedBagianId}
            onChange={(e) => {
              setSelectedBagianId(e.target.value === "Semua" ? "Semua" : Number(e.target.value))
              setCurrentPage(1)
            }}
            className={`appearance-none font-bold text-xs px-3.5 py-2 pr-8 rounded-xl border cursor-pointer outline-none ${
              isDark
                ? "bg-[#131b2e] border-[#1e293b] text-white hover:border-red-500"
                : "bg-slate-50 border-slate-300 text-black hover:border-red-500"
            }`}
          >
            <option value="Semua">Semua Bagian / Divisi</option>
            {bagianList.map((bg) => (
              <option key={bg.id_bagian} value={bg.id_bagian}>
                {bg.nama_bagian}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>

        {/* Filter Status */}
        <div className="relative">
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value)
              setCurrentPage(1)
            }}
            className={`appearance-none font-bold text-xs px-3.5 py-2 pr-8 rounded-xl border cursor-pointer outline-none ${
              isDark
                ? "bg-[#131b2e] border-[#1e293b] text-white hover:border-red-500"
                : "bg-slate-50 border-slate-300 text-black hover:border-red-500"
            }`}
          >
            <option value="Semua Status">Semua Status</option>
            <option value="active">Aktif (active)</option>
            <option value="inactive">Non-Aktif (inactive)</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>

        {/* Search Input */}
        <div className="relative flex-1">
          <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-gray-400" : "text-slate-500"}`} />
          <input
            type="text"
            placeholder="Cari kode MAK, nama akun, bagian, atau program..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border outline-none font-medium transition-colors ${
              isDark
                ? "bg-[#131b2e] border-[#1e293b] text-white placeholder-gray-500 focus:border-red-500"
                : "bg-slate-50 border-slate-300 text-black placeholder-slate-400 focus:border-red-500"
            }`}
          />
        </div>
      </div>

      {/* Sub-bar Indicator */}
      <div className={`flex items-center justify-between text-xs px-1 ${isDark ? "text-gray-300" : "text-slate-700"}`}>
        <span className="font-semibold">{filteredData.length} akun terdaftar di server</span>
        <span className="font-bold text-emerald-600 dark:text-emerald-400">
          Auto-Pagu Enabled (Phase 9 & 13)
        </span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 gap-3 text-xs font-semibold text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-red-600" />
          Memuat data akun anggaran dari server...
        </div>
      )}

      {/* Main Table */}
      {!loading && (
        <Card className={`${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl overflow-hidden`}>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className={isDark ? "border-b border-white/10 bg-[#0a0f1d]" : "border-b border-slate-200 bg-slate-50"}>
                  <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>KODE MAK</TableHead>
                  <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>NAMA AKUN ANGGARAN</TableHead>
                  <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>BAGIAN / DIVISI</TableHead>
                  <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>JENIS BELANJA</TableHead>
                  <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>PROGRAM</TableHead>
                  <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>STATUS</TableHead>
                  <TableHead className={`text-[11px] font-extrabold uppercase text-center ${isDark ? "text-gray-400" : "text-slate-600"}`}>AKSI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-xs text-gray-400">
                      Tidak ada akun anggaran yang sesuai dengan kriteria pencarian.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedData.map((row) => (
                    <TableRow
                      key={row.id_akun_anggaran}
                      className={`border-b ${isDark ? "border-white/10" : "border-slate-100"}`}
                    >
                      <TableCell className="font-mono text-xs font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                        {row.kode_akun}
                      </TableCell>
                      <TableCell className={`text-xs font-semibold ${isDark ? "text-gray-200" : "text-slate-800"}`}>
                        {row.nama_akun}
                      </TableCell>
                      <TableCell className={`text-xs font-medium max-w-[160px] truncate ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                        {row.nama_bagian || "-"}
                      </TableCell>
                      <TableCell className={`text-xs font-semibold whitespace-nowrap ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                        {row.jenis_belanja || "Operasional"}
                      </TableCell>
                      <TableCell className={`text-xs font-medium max-w-[180px] truncate ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                        {row.program || "-"}
                      </TableCell>
                      <TableCell>
                        {row.status === "active" ? (
                          <Badge variant="default">Aktif</Badge>
                        ) : (
                          <Badge variant="draft">Non-Aktif</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          {readOnly ? (
                            <span className="text-[11px] font-semibold text-slate-400">Baca saja</span>
                          ) : (
                            <>
                              <button
                                onClick={() => handleOpenEdit(row)}
                                title="Edit Akun"
                                className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(row)}
                                title="Hapus Akun"
                                className="p-1.5 rounded-lg hover:bg-red-500/20 text-rose-500 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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
              isDark ? "border-slate-800 text-gray-300" : "border-slate-200 text-slate-700"
            }`}>
              <span>
                {filteredData.length === 0
                  ? "Tidak ada data"
                  : `Menampilkan ${firstItemIndex + 1}-${Math.min(firstItemIndex + ITEMS_PER_PAGE, filteredData.length)} dari ${filteredData.length} akun`}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={activePage === 1}
                  className={`p-1.5 rounded-lg border transition-colors ${
                    activePage === 1 ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:border-red-500 hover:text-red-500"
                  } ${isDark ? "border-slate-700 text-white" : "border-slate-300 text-black"}`}
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
                          ? "border border-slate-700 text-gray-400 hover:border-red-500 hover:text-red-400"
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
                  } ${isDark ? "border-slate-700 text-white" : "border-slate-300 text-black"}`}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal Tambah / Edit Akun */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${
            isDark ? "bg-[#0c1220] border-[#1e293b] text-white" : "bg-white border-slate-200 text-black"
          }`}>
            <div className={`p-4 border-b flex items-center justify-between ${
              isDark ? "border-[#1e293b] bg-[#11192b]" : "border-slate-200 bg-slate-50"
            }`}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Master Akun Anggaran</p>
                <h3 className="text-sm font-bold">
                  {selectedItem ? `Edit Akun ${selectedItem.kode_akun}` : "Tambah Akun Anggaran Baru"}
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsModalOpen(false)
                  setSelectedItem(null)
                }}
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Kode MAK / Akun</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 521211"
                    value={formKode}
                    onChange={(e) => setFormKode(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border outline-none font-mono font-bold ${
                      isDark ? "bg-[#131b2e] border-[#1e293b] text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                    }`}
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as "active" | "inactive")}
                    className={`w-full px-3 py-2 rounded-xl border outline-none font-semibold cursor-pointer ${
                      isDark ? "bg-[#131b2e] border-[#1e293b] text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                    }`}
                  >
                    <option value="active">Aktif (active)</option>
                    <option value="inactive">Non-Aktif (inactive)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Bagian / Divisi Pengampu</label>
                <select
                  required
                  value={formBagianId}
                  onChange={(e) => setFormBagianId(Number(e.target.value))}
                  className={`w-full px-3 py-2 rounded-xl border outline-none font-semibold cursor-pointer ${
                    isDark ? "bg-[#131b2e] border-[#1e293b] text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                  }`}
                >
                  <option value="">-- Pilih Bagian --</option>
                  {bagianList.map((bg) => (
                    <option key={bg.id_bagian} value={bg.id_bagian}>
                      {bg.nama_bagian}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Nama Uraian Akun Anggaran</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Belanja Bahan / Logistik Pilkada"
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border outline-none font-semibold ${
                    isDark ? "bg-[#131b2e] border-[#1e293b] text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Jenis Belanja</label>
                  <input
                    type="text"
                    placeholder="Operasional / Modal"
                    value={formJenisBelanja}
                    onChange={(e) => setFormJenisBelanja(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? "bg-[#131b2e] border-[#1e293b] text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                    }`}
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Program</label>
                  <input
                    type="text"
                    placeholder="Program Pemilu / Lainnya"
                    value={formProgram}
                    onChange={(e) => setFormProgram(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isDark ? "bg-[#131b2e] border-[#1e293b] text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                    }`}
                  />
                </div>
              </div>

              <div className={`rounded-xl border p-3 ${isDark ? "border-emerald-500/20 bg-emerald-950/20" : "border-emerald-200 bg-emerald-50"}`}>
                <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  ℹ️ <strong>Auto-Pagu Otomatis:</strong> Saat akun baru dengan status aktif dibuat, alokasi pagu pada seluruh tahun anggaran yang aktif otomatis dibentuk oleh backend.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false)
                    setSelectedItem(null)
                  }}
                  disabled={submitting}
                  className={`px-4 py-2 rounded-xl border font-bold cursor-pointer ${
                    isDark ? "border-slate-700 text-gray-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
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
                  {submitting ? "Menyimpan..." : selectedItem ? "Simpan Perubahan" : "Tambah Akun"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
