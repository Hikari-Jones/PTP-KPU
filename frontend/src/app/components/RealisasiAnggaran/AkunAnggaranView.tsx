import { useState } from "react"
import {
  Search,
  Download,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X
} from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import type { AkunAnggaran } from "./types"

interface Props {
  theme: "light" | "dark"
  onNavigate?: (tab: string) => void
}

const INITIAL_AKUN_DATA: AkunAnggaran[] = [
  {
    kode: "5211",
    nama: "Belanja Gaji dan Tunjangan",
    tahun: 2025,
    subbagian: "Keuangan",
    pagu: 8500000000,
    realisasi: 6375000000,
    sisa: 2125000000,
    persentase: 75,
  },
  {
    kode: "5212",
    nama: "Belanja Honorarium",
    tahun: 2025,
    subbagian: "Teknis",
    pagu: 3200000000,
    realisasi: 2560000000,
    sisa: 640000000,
    persentase: 80,
  },
  {
    kode: "5221",
    nama: "Belanja Barang Operasional",
    tahun: 2025,
    subbagian: "UMLOG",
    pagu: 4800000000,
    realisasi: 2880000000,
    sisa: 1920000000,
    persentase: 60,
  },
  {
    kode: "5222",
    nama: "Belanja Barang Non Operasional",
    tahun: 2025,
    subbagian: "Teknis",
    pagu: 6500000000,
    realisasi: 4225000000,
    sisa: 2275000000,
    persentase: 65,
  },
  {
    kode: "5231",
    nama: "Belanja Pemeliharaan",
    tahun: 2025,
    subbagian: "SDM",
    pagu: 2100000000,
    realisasi: 1260000000,
    sisa: 840000000,
    persentase: 60,
  },
  {
    kode: "5241",
    nama: "Belanja Perjalanan Dinas",
    tahun: 2025,
    subbagian: "Hukum",
    pagu: 4200000000,
    realisasi: 3150000000,
    sisa: 1050000000,
    persentase: 75,
  },
  {
    kode: "5251",
    nama: "Belanja Jasa",
    tahun: 2026,
    subbagian: "RENDATIN",
    pagu: 7800000000,
    realisasi: 5460000000,
    sisa: 2340000000,
    persentase: 70,
  },
  {
    kode: "5311",
    nama: "Belanja Modal Peralatan",
    tahun: 2026,
    subbagian: "UMLOG",
    pagu: 3680000000,
    realisasi: 2576000000,
    sisa: 1104000000,
    persentase: 70,
  },
  {
    kode: "5321",
    nama: "Belanja Modal Gedung",
    tahun: 2026,
    subbagian: "SDM",
    pagu: 5000000000,
    realisasi: 2760000000,
    sisa: 2240000000,
    persentase: 55,
  },
]

export function AkunAnggaranView({ theme }: Props) {
  const isDark = theme === "dark"
  const [akunList, setAkunList] = useState<AkunAnggaran[]>(INITIAL_AKUN_DATA)
  const [selectedTA, setSelectedTA] = useState("Semua TA")
  const [selectedSubbagian, setSelectedSubbagian] = useState("Semua Subbagian")
  const [searchQuery, setSearchQuery] = useState("")
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<AkunAnggaran | null>(null)

  // Form states
  const [formKode, setFormKode] = useState("")
  const [formNama, setFormNama] = useState("")
  const [formSubbagian, setFormSubbagian] = useState("Keuangan")
  const [formTahun, setFormTahun] = useState(2025)
  const [formPagu, setFormPagu] = useState<number>(1000000000)

  const formatRupiah = (val: number) => {
    return "Rp " + new Intl.NumberFormat("id-ID").format(val)
  }

  const filteredData = akunList.filter((item) => {
    const matchSearch =
      item.kode.includes(searchQuery) ||
      item.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.subbagian && item.subbagian.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchSubbagian =
      selectedSubbagian === "Semua Subbagian" || item.subbagian === selectedSubbagian
    const matchTA = selectedTA === "Semua TA" || item.tahun === Number(selectedTA.replace("TA ", ""))
    return matchSearch && matchSubbagian && matchTA
  })

  const totalPagu = akunList.reduce((acc, curr) => acc + curr.pagu, 0)

  const handleDelete = (kode: string) => {
    if (confirm("Apakah Anda yakin ingin menghapus akun anggaran ini?")) {
      setAkunList((prev) => prev.filter((a) => a.kode !== kode))
    }
  }

  const handleOpenAdd = () => {
    setSelectedItem(null)
    setFormKode("")
    setFormNama("")
    setFormSubbagian("Keuangan")
    setFormTahun(selectedTA === "Semua TA" ? 2025 : Number(selectedTA.replace("TA ", "")))
    setFormPagu(1000000000)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (item: AkunAnggaran) => {
    setSelectedItem(item)
    setFormKode(item.kode)
    setFormNama(item.nama)
    setFormSubbagian(item.subbagian || "Keuangan")
    setFormTahun(item.tahun || 2025)
    setFormPagu(item.pagu)
    setIsModalOpen(true)
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedItem) {
      setAkunList((prev) =>
        prev.map((a) =>
          a.kode === selectedItem.kode
            ? {
                ...a,
                kode: formKode,
                nama: formNama,
                subbagian: formSubbagian,
                tahun: formTahun,
                pagu: Number(formPagu),
                sisa: Number(formPagu) - a.realisasi,
                persentase: a.pagu > 0 ? Math.round((a.realisasi / Number(formPagu)) * 100) : 0,
              }
            : a
        )
      )
    } else {
      const newItem: AkunAnggaran = {
        kode: formKode,
        nama: formNama,
        subbagian: formSubbagian,
        tahun: formTahun,
        pagu: Number(formPagu),
        realisasi: 0,
        sisa: Number(formPagu),
        persentase: 0,
      }
      setAkunList((prev) => [...prev, newItem])
    }
    setIsModalOpen(false)
  }

  const handleExport = () => {
    let csv = "Tahun,Kode,Nama Akun,Subbagian,Pagu Anggaran,Realisasi,Sisa,Serapan (%)\n"
    filteredData.forEach((row) => {
      csv += `"${row.tahun}","${row.kode}","${row.nama}","${row.subbagian}","${row.pagu}","${row.realisasi}","${row.sisa}","${row.persentase}%"\n`
    })
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "Akun_Anggaran_KPU_Sulut.csv"
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
            Akun Anggaran
          </h1>
          <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
            {filteredData.length} akun terdaftar — {selectedTA === "Semua TA" ? "Semua Tahun Anggaran" : `Tahun Anggaran ${selectedTA.replace("TA ", "")}`}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExport}
            className={`px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-all active:scale-95 shadow-sm ${
              isDark
                ? "border-slate-700 bg-slate-900 text-white hover:bg-slate-800"
                : "border-slate-300 bg-white text-black hover:bg-slate-50"
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="btn-kpu-red px-4 py-2 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Akun</span>
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative">
          <select
            value={selectedTA}
            onChange={(e) => setSelectedTA(e.target.value)}
            className={`appearance-none font-bold text-xs px-3.5 py-2 pr-8 rounded-xl border cursor-pointer outline-none ${
              isDark
                ? "bg-[#131b2e] border-[#1e293b] text-white hover:border-red-500"
                : "bg-slate-50 border-slate-300 text-black hover:border-red-500"
            }`}
          >
            <option value="Semua TA">Semua TA</option>
            <option value="TA 2025">TA 2025</option>
            <option value="TA 2026">TA 2026</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={selectedSubbagian}
            onChange={(e) => setSelectedSubbagian(e.target.value)}
            className={`appearance-none font-bold text-xs px-3.5 py-2 pr-8 rounded-xl border cursor-pointer outline-none ${
              isDark
                ? "bg-[#131b2e] border-[#1e293b] text-white hover:border-red-500"
                : "bg-slate-50 border-slate-300 text-black hover:border-red-500"
            }`}
          >
            <option value="Semua Subbagian">Semua Subbagian</option>
            <option value="SDM">SDM</option>
            <option value="RENDATIN">RENDATIN</option>
            <option value="Teknis">Teknis</option>
            <option value="Hukum">Hukum</option>
            <option value="Keuangan">Keuangan</option>
            <option value="UMLOG">UMLOG</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>

        <div className="relative flex-1">
          <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-gray-400" : "text-slate-500"}`} />
          <input
            type="text"
            placeholder="Cari kode atau nama akun..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border outline-none font-medium transition-colors ${
              isDark
                ? "bg-[#131b2e] border-[#1e293b] text-white placeholder-gray-500 focus:border-red-500"
                : "bg-slate-50 border-slate-300 text-black placeholder-slate-400 focus:border-red-500"
            }`}
          />
        </div>
      </div>

      {/* Sub-bar Indicator */}
      <div className={`flex items-center justify-between text-xs px-1 ${
        isDark ? "text-gray-300" : "text-slate-700"
      }`}>
        <span className="font-semibold">{filteredData.length} akun • {selectedTA}</span>
        <span className="font-bold text-red-600 dark:text-red-400">
          Total Pagu: Rp {(totalPagu / 1000000000).toFixed(2)} M
        </span>
      </div>

      {/* Main Table */}
      <Card className={`${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl overflow-hidden`}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className={isDark ? "border-b border-white/10 bg-[#0a0f1d]" : "border-b border-slate-200 bg-slate-50"}>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>KODE</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>TA</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>NAMA AKUN</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>SUBBAGIAN</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>PAGU ANGGARAN</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>REALISASI</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>SISA</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-gray-400" : "text-slate-600"}`}>SERAPAN</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase text-center ${isDark ? "text-gray-400" : "text-slate-600"}`}>AKSI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-xs text-gray-400">
                    Tidak ada akun anggaran yang sesuai dengan pencarian.
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((row) => (
                  <TableRow
                    key={row.kode}
                    className={`border-b ${
                      isDark ? "border-white/10" : "border-slate-100"
                    }`}
                  >
                    <TableCell className="font-mono text-xs font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                      {row.kode}
                    </TableCell>
                    <TableCell className={`text-xs font-bold whitespace-nowrap ${isDark ? "text-gray-300" : "text-slate-600"}`}>
                      {row.tahun}
                    </TableCell>
                    <TableCell className={`text-xs font-semibold ${isDark ? "text-gray-200" : "text-slate-800"}`}>
                      {row.nama}
                    </TableCell>
                    <TableCell className={`text-xs font-medium max-w-[160px] truncate ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                      {row.subbagian}
                    </TableCell>
                    <TableCell className={`text-xs font-semibold whitespace-nowrap ${isDark ? "text-gray-200" : "text-slate-800"}`}>
                      {formatRupiah(row.pagu)}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">
                      {formatRupiah(row.realisasi)}
                    </TableCell>
                    <TableCell className={`text-xs font-semibold whitespace-nowrap ${
                      isDark ? "text-gray-300" : "text-slate-800"
                    }`}>
                      {formatRupiah(row.sisa)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2 min-w-[100px]">
                        <div className="flex-1 bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-red-600"
                            style={{ width: `${row.persentase || 0}%` }}
                          ></div>
                        </div>
                        <span className="text-[11px] font-bold text-red-600 dark:text-red-400">
                          {row.persentase}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleOpenEdit(row)}
                          title="Edit Akun"
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(row.kode)}
                          title="Hapus Akun"
                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-500 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Table Footer / Pagination */}
          <div className={`p-4 flex items-center justify-between text-xs border-t ${
            isDark ? "border-slate-800 text-gray-300" : "border-slate-200 text-slate-700"
          }`}>
            <span>
              Menampilkan 1-{filteredData.length} dari {filteredData.length} akun
            </span>
            <div className="flex items-center gap-1.5">
              <button className="p-1 rounded-lg border border-slate-700 opacity-50 cursor-not-allowed">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="w-7 h-7 rounded-lg bg-red-600 text-white font-bold flex items-center justify-center text-xs shadow-xs">
                1
              </span>
              <button className="p-1 rounded-lg border border-slate-700 opacity-50 cursor-not-allowed">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal Tambah / Edit Akun */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${
            isDark ? "bg-[#0c1220] border-[#1e293b] text-white" : "bg-white border-slate-200 text-black"
          }`}>
            <div className={`p-4 border-b flex items-center justify-between ${
              isDark ? "border-[#1e293b] bg-[#11192b]" : "border-slate-200 bg-slate-50"
            }`}>
              <h3 className="text-sm font-bold">
                {selectedItem ? "Edit Akun Anggaran" : "Tambah Akun Anggaran Baru"}
              </h3>
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
              <div>
                <label className="block font-semibold mb-1">Tahun Anggaran</label>
                <select
                  value={formTahun}
                  onChange={(e) => setFormTahun(Number(e.target.value))}
                  className={`w-full px-3 py-2 rounded-xl border outline-none font-semibold cursor-pointer ${
                    isDark ? "bg-[#131b2e] border-[#1e293b] text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                  }`}
                >
                  <option value={2025}>TA 2025</option>
                  <option value={2026}>TA 2026</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Kode Akun (4 Digit)</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: 5261"
                  value={formKode}
                  onChange={(e) => setFormKode(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border outline-none font-mono font-bold ${
                    isDark ? "bg-[#131b2e] border-[#1e293b] text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                  }`}
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Nama Akun</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Belanja Hibah Pilkada"
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border outline-none font-semibold ${
                    isDark ? "bg-[#131b2e] border-[#1e293b] text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                  }`}
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Subbagian Pengampu</label>
                <select
                  value={formSubbagian}
                  onChange={(e) => setFormSubbagian(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border outline-none font-semibold cursor-pointer ${
                    isDark ? "bg-[#131b2e] border-[#1e293b] text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                  }`}
                >
                  <option value="SDM">SDM</option>
                  <option value="RENDATIN">RENDATIN</option>
                  <option value="Teknis">Teknis</option>
                  <option value="Hukum">Hukum</option>
                  <option value="Keuangan">Keuangan</option>
                  <option value="UMLOG">UMLOG</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Alokasi Pagu Anggaran (Rp)</label>
                <input
                  type="number"
                  required
                  min={0}
                  step={1000000}
                  value={formPagu}
                  onChange={(e) => setFormPagu(Number(e.target.value))}
                  className={`w-full px-3 py-2 rounded-xl border outline-none font-bold ${
                    isDark ? "bg-[#131b2e] border-[#1e293b] text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-black focus:border-red-500"
                  }`}
                />
                <p className={`text-[11px] mt-1 ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                  Terbaca: {formatRupiah(formPagu)}
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false)
                    setSelectedItem(null)
                  }}
                  className={`px-4 py-2 rounded-xl border font-bold ${
                    isDark ? "border-slate-700 text-gray-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-kpu-red px-5 py-2 text-white font-bold rounded-xl"
                >
                  {selectedItem ? "Simpan Perubahan" : "Tambah Akun"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
