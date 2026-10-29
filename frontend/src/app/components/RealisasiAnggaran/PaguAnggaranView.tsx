import { useState } from "react"
import { BarChart3, Download, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"

type Subbagian = "SDM" | "RENDATIN" | "Teknis" | "Hukum" | "Keuangan" | "UMLOG"

interface PaguItem {
  id: string
  tahun: number
  kode: string
  nama: string
  subbagian: Subbagian
  pagu: number
  realisasi: number
}

interface RevisiItem {
  id: string
  nomor: string
  tahun: number
  tanggal: string
  kodeAkun: string
  namaAkun: string
  paguSebelum: number
  paguSesudah: number
  alasan: string
}

const SUBBAGIAN_OPTIONS: Subbagian[] = ["SDM", "RENDATIN", "Teknis", "Hukum", "Keuangan", "UMLOG"]

const INITIAL_PAGU: PaguItem[] = [
  { id: "p-5211-2025", tahun: 2025, kode: "5211", nama: "Belanja Gaji dan Tunjangan", subbagian: "Keuangan", pagu: 8500000000, realisasi: 6375000000 },
  { id: "p-5212-2025", tahun: 2025, kode: "5212", nama: "Belanja Honorarium", subbagian: "Teknis", pagu: 3200000000, realisasi: 2560000000 },
  { id: "p-5221-2025", tahun: 2025, kode: "5221", nama: "Belanja Barang Operasional", subbagian: "UMLOG", pagu: 4800000000, realisasi: 2880000000 },
  { id: "p-5222-2025", tahun: 2025, kode: "5222", nama: "Belanja Barang Non Operasional", subbagian: "Teknis", pagu: 6500000000, realisasi: 4225000000 },
  { id: "p-5231-2025", tahun: 2025, kode: "5231", nama: "Belanja Pemeliharaan", subbagian: "SDM", pagu: 2100000000, realisasi: 1260000000 },
  { id: "p-5241-2025", tahun: 2025, kode: "5241", nama: "Belanja Perjalanan Dinas", subbagian: "Hukum", pagu: 4200000000, realisasi: 3150000000 },
  { id: "p-5251-2025", tahun: 2025, kode: "5251", nama: "Belanja Jasa", subbagian: "RENDATIN", pagu: 7800000000, realisasi: 5460000000 },
  { id: "p-5311-2025", tahun: 2025, kode: "5311", nama: "Belanja Modal Peralatan", subbagian: "UMLOG", pagu: 3680000000, realisasi: 2576000000 },
  { id: "p-5321-2025", tahun: 2025, kode: "5321", nama: "Belanja Modal Gedung", subbagian: "SDM", pagu: 5000000000, realisasi: 2760000000 },
  { id: "p-5211-2026", tahun: 2026, kode: "5211", nama: "Belanja Gaji dan Tunjangan", subbagian: "Keuangan", pagu: 9100000000, realisasi: 0 },
  { id: "p-5221-2026", tahun: 2026, kode: "5221", nama: "Belanja Barang Operasional", subbagian: "UMLOG", pagu: 5250000000, realisasi: 0 },
  { id: "p-5251-2026", tahun: 2026, kode: "5251", nama: "Belanja Jasa", subbagian: "RENDATIN", pagu: 8250000000, realisasi: 0 },
]

const INITIAL_REVISI: RevisiItem[] = [
  { id: "r-001", nomor: "REV-001/2025", tahun: 2025, tanggal: "2025-03-10", kodeAkun: "5221", namaAkun: "Belanja Barang Operasional", paguSebelum: 4200000000, paguSesudah: 4800000000, alasan: "Penambahan kebutuhan kegiatan operasional" },
  { id: "r-002", nomor: "REV-002/2025", tahun: 2025, tanggal: "2025-05-22", kodeAkun: "5241", namaAkun: "Belanja Perjalanan Dinas", paguSebelum: 3500000000, paguSesudah: 4200000000, alasan: "Peningkatan frekuensi koordinasi wilayah" },
  { id: "r-003", nomor: "REV-003/2025", tahun: 2025, tanggal: "2025-07-15", kodeAkun: "5251", namaAkun: "Belanja Jasa", paguSebelum: 6900000000, paguSesudah: 7800000000, alasan: "Penambahan kontrak jasa layanan pendukung" },
  { id: "r-004", nomor: "REV-004/2025", tahun: 2025, tanggal: "2025-08-30", kodeAkun: "5231", namaAkun: "Belanja Pemeliharaan", paguSebelum: 2400000000, paguSesudah: 2100000000, alasan: "Efisiensi belanja pemeliharaan kantor" },
]

export function PaguAnggaranView({ theme }: { theme: "light" | "dark"; onNavigate?: (tab: string) => void }) {
  const isDark = theme === "dark"
  const [activeTab, setActiveTab] = useState<"pagu" | "revisi">("pagu")
  const [paguList, setPaguList] = useState<PaguItem[]>(INITIAL_PAGU)
  const [revisiList, setRevisiList] = useState<RevisiItem[]>(INITIAL_REVISI)
  const [selectedTA, setSelectedTA] = useState(2025)
  const [selectedSubbagian, setSelectedSubbagian] = useState("Semua Subbagian")
  const [searchQuery, setSearchQuery] = useState("")
  const [modalType, setModalType] = useState<"pagu" | "revisi" | null>(null)
  const [editingPaguId, setEditingPaguId] = useState<string | null>(null)
  const [editingRevisiId, setEditingRevisiId] = useState<string | null>(null)

  const [formKode, setFormKode] = useState("")
  const [formNama, setFormNama] = useState("")
  const [formSubbagian, setFormSubbagian] = useState<Subbagian>("Keuangan")
  const [formPagu, setFormPagu] = useState(0)
  const [formRealisasi, setFormRealisasi] = useState(0)
  const [formTanggal, setFormTanggal] = useState("2025-09-01")
  const [formAkunId, setFormAkunId] = useState("")
  const [formPaguSebelum, setFormPaguSebelum] = useState(0)
  const [formPaguSesudah, setFormPaguSesudah] = useState(0)
  const [formAlasan, setFormAlasan] = useState("")

  const formatRupiah = (value: number) => `Rp ${new Intl.NumberFormat("id-ID").format(value)}`

  const filteredPagu = paguList.filter((item) => {
    const matchesTA = item.tahun === selectedTA
    const matchesSubbagian = selectedSubbagian === "Semua Subbagian" || item.subbagian === selectedSubbagian
    const term = searchQuery.toLowerCase()
    const matchesSearch = item.kode.includes(term) || item.nama.toLowerCase().includes(term) || item.subbagian.toLowerCase().includes(term)
    return matchesTA && matchesSubbagian && matchesSearch
  })

  const filteredRevisi = revisiList.filter((item) => {
    const term = searchQuery.toLowerCase()
    return item.tahun === selectedTA && (
      item.nomor.toLowerCase().includes(term) ||
      item.kodeAkun.includes(term) ||
      item.namaAkun.toLowerCase().includes(term) ||
      item.alasan.toLowerCase().includes(term)
    )
  })

  const totalPagu = filteredPagu.reduce((total, item) => total + item.pagu, 0)

  const closeModal = () => {
    setModalType(null)
    setEditingPaguId(null)
    setEditingRevisiId(null)
  }

  const openAddPagu = () => {
    setEditingPaguId(null)
    setFormKode("")
    setFormNama("")
    setFormSubbagian("Keuangan")
    setFormPagu(0)
    setFormRealisasi(0)
    setModalType("pagu")
  }

  const openEditPagu = (item: PaguItem) => {
    setEditingPaguId(item.id)
    setFormKode(item.kode)
    setFormNama(item.nama)
    setFormSubbagian(item.subbagian)
    setFormPagu(item.pagu)
    setFormRealisasi(item.realisasi)
    setModalType("pagu")
  }

  const submitPagu = (event: React.FormEvent) => {
    event.preventDefault()
    if (editingPaguId) {
      setPaguList((items) => items.map((item) => item.id === editingPaguId
        ? { ...item, kode: formKode, nama: formNama, subbagian: formSubbagian, pagu: formPagu, realisasi: formRealisasi }
        : item))
    } else {
      setPaguList((items) => [...items, {
        id: `p-${formKode}-${selectedTA}-${items.length + 1}`,
        tahun: selectedTA,
        kode: formKode,
        nama: formNama,
        subbagian: formSubbagian,
        pagu: formPagu,
        realisasi: formRealisasi,
      }])
    }
    closeModal()
  }

  const openAddRevisi = () => {
    const firstAkun = paguList.find((item) => item.tahun === selectedTA)
    setEditingRevisiId(null)
    setFormTanggal(`${selectedTA}-09-01`)
    setFormAkunId(firstAkun?.id || "")
    setFormPaguSebelum(firstAkun?.pagu || 0)
    setFormPaguSesudah(firstAkun?.pagu || 0)
    setFormAlasan("")
    setModalType("revisi")
  }

  const openEditRevisi = (item: RevisiItem) => {
    const akun = paguList.find((pagu) => pagu.tahun === item.tahun && pagu.kode === item.kodeAkun)
    setEditingRevisiId(item.id)
    setFormTanggal(item.tanggal)
    setFormAkunId(akun?.id || "")
    setFormPaguSebelum(item.paguSebelum)
    setFormPaguSesudah(item.paguSesudah)
    setFormAlasan(item.alasan)
    setModalType("revisi")
  }

  const selectedRevisionAccount = paguList.find((item) => item.id === formAkunId)

  const submitRevisi = (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedRevisionAccount) return

    const previousRevision = revisiList.find((item) => item.id === editingRevisiId)
    const nomor = previousRevision?.nomor || `REV-${String(revisiList.length + 1).padStart(3, "0")}/${selectedTA}`
    const revision: RevisiItem = {
      id: previousRevision?.id || `r-${selectedTA}-${revisiList.length + 1}`,
      nomor,
      tahun: selectedTA,
      tanggal: formTanggal,
      kodeAkun: selectedRevisionAccount.kode,
      namaAkun: selectedRevisionAccount.nama,
      paguSebelum: formPaguSebelum,
      paguSesudah: formPaguSesudah,
      alasan: formAlasan,
    }

    setRevisiList((items) => previousRevision
      ? items.map((item) => item.id === previousRevision.id ? revision : item)
      : [...items, revision])
    setPaguList((items) => items.map((item) => item.id === selectedRevisionAccount.id ? { ...item, pagu: formPaguSesudah } : item))
    closeModal()
  }

  const handleExport = () => {
    const rows = activeTab === "pagu"
      ? ["Tahun,Kode,Nama Akun,Subbagian,Pagu,Realisasi", ...filteredPagu.map((item) => `${item.tahun},${item.kode},"${item.nama}",${item.subbagian},${item.pagu},${item.realisasi}`)]
      : ["No Revisi,Tanggal,Kode Akun,Nama Akun,Pagu Sebelum,Pagu Sesudah,Alasan", ...filteredRevisi.map((item) => `${item.nomor},${item.tanggal},${item.kodeAkun},"${item.namaAkun}",${item.paguSebelum},${item.paguSesudah},"${item.alasan}"`)]
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `${activeTab === "pagu" ? "Pagu" : "Revisi"}_Anggaran_TA_${selectedTA}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const inputClass = `w-full rounded-xl border px-3 py-2 text-xs font-semibold outline-none transition-colors ${isDark ? "bg-[#131b2e] border-white/10 text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-slate-900 focus:border-red-500"}`

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className={`flex items-center gap-6 border-b ${isDark ? "border-white/10" : "border-slate-200"}`}>
        <button type="button" onClick={() => { setActiveTab("pagu"); setSearchQuery("") }} className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-bold transition-colors cursor-pointer ${activeTab === "pagu" ? "border-red-600 text-red-600 dark:text-red-400" : "border-transparent text-slate-500 hover:text-red-500"}`}>
          <BarChart3 className="h-4 w-4" /> Pagu Anggaran
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${isDark ? "bg-white/5" : "bg-slate-100"}`}>{paguList.length}</span>
        </button>
        <button type="button" onClick={() => { setActiveTab("revisi"); setSearchQuery("") }} className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-bold transition-colors cursor-pointer ${activeTab === "revisi" ? "border-red-600 text-red-600 dark:text-red-400" : "border-transparent text-slate-500 hover:text-red-500"}`}>
          <RefreshCw className="h-4 w-4" /> Revisi Anggaran
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${isDark ? "bg-white/5" : "bg-slate-100"}`}>{revisiList.length}</span>
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">Realisasi Anggaran</p>
          <h1 className={`m-0 text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-black"}`}>{activeTab === "pagu" ? "Pagu Anggaran" : "Revisi Anggaran"}</h1>
          <p className={`mt-1 text-xs font-medium ${isDark ? "text-gray-400" : "text-slate-600"}`}>
            {activeTab === "pagu" ? `${filteredPagu.length} pagu terdaftar` : `${filteredRevisi.length} revisi tercatat`} — Tahun Anggaran {selectedTA}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={handleExport} className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold cursor-pointer ${isDark ? "bg-[#0f172a] border-white/10 text-gray-300 hover:bg-[#1e293b]" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
            <Download className="h-4 w-4" /> Export
          </button>
          <button type="button" onClick={activeTab === "pagu" ? openAddPagu : openAddRevisi} className="btn-kpu-red flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white cursor-pointer">
            <Plus className="h-4 w-4" /> {activeTab === "pagu" ? "Tambah Pagu" : "Tambah Revisi"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <select value={selectedTA} onChange={(event) => { setSelectedTA(Number(event.target.value)); setSearchQuery("") }} className={`${inputClass} md:w-32 cursor-pointer`}>
          <option value={2025}>TA 2025</option>
          <option value={2026}>TA 2026</option>
        </select>
        {activeTab === "pagu" && (
          <select value={selectedSubbagian} onChange={(event) => setSelectedSubbagian(event.target.value)} className={`${inputClass} md:w-52 cursor-pointer`}>
            <option>Semua Subbagian</option>
            {SUBBAGIAN_OPTIONS.map((item) => <option key={item}>{item}</option>)}
          </select>
        )}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={activeTab === "pagu" ? "Cari kode, nama akun, atau subbagian..." : "Cari nomor, akun, atau alasan revisi..."} className={`${inputClass} pl-9`} />
        </div>
      </div>

      {activeTab === "pagu" ? (
        <>
          <div className={`flex items-center justify-between px-1 text-xs ${isDark ? "text-gray-400" : "text-slate-600"}`}>
            <span>{filteredPagu.length} pagu • TA {selectedTA}</span>
            <span className="font-bold text-red-600 dark:text-red-400">Total Pagu: {formatRupiah(totalPagu)}</span>
          </div>
          <Card className={`${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} overflow-hidden rounded-2xl shadow-lg backdrop-blur-md`}>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow className={isDark ? "bg-[#0a0f1d]" : "bg-slate-50"}>
                  {['KODE', 'NAMA AKUN', 'SUBBAGIAN', 'PAGU ANGGARAN', 'REALISASI', 'SERAPAN', 'AKSI'].map((head) => <TableHead key={head} className={`text-[11px] font-extrabold ${head === 'AKSI' ? 'text-center' : ''} ${isDark ? "text-gray-400" : "text-slate-600"}`}>{head}</TableHead>)}
                </TableRow></TableHeader>
                <TableBody>
                  {filteredPagu.length === 0 ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-xs text-slate-500">Tidak ada data pagu untuk filter ini.</TableCell></TableRow> : filteredPagu.map((item) => {
                    const percentage = item.pagu > 0 ? Math.min(100, Math.round((item.realisasi / item.pagu) * 100)) : 0
                    return <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs font-bold text-red-600 dark:text-red-400">{item.kode}</TableCell>
                      <TableCell className={`max-w-[220px] text-xs font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{item.nama}</TableCell>
                      <TableCell className={`text-xs font-semibold ${isDark ? "text-gray-300" : "text-slate-600"}`}>{item.subbagian}</TableCell>
                      <TableCell className={`whitespace-nowrap text-xs font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{formatRupiah(item.pagu)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs font-bold text-red-600 dark:text-red-400">{formatRupiah(item.realisasi)}</TableCell>
                      <TableCell><div className="flex min-w-[105px] items-center gap-2"><div className={`h-2 flex-1 overflow-hidden rounded-full ${isDark ? "bg-slate-800" : "bg-slate-200"}`}><div className="h-full rounded-full bg-red-600" style={{ width: `${percentage}%` }} /></div><span className="text-[11px] font-bold text-red-600 dark:text-red-400">{percentage}%</span></div></TableCell>
                      <TableCell><div className="flex justify-center gap-1"><button onClick={() => openEditPagu(item)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-500/15 cursor-pointer" title="Edit pagu"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => setPaguList((items) => items.filter((row) => row.id !== item.id))} className="rounded-lg p-1.5 text-red-600 hover:bg-red-500/15 cursor-pointer" title="Hapus pagu"><Trash2 className="h-3.5 w-3.5" /></button></div></TableCell>
                    </TableRow>
                  })}
                </TableBody>
              </Table>
              <div className={`border-t p-4 text-xs ${isDark ? "border-white/10 text-gray-400" : "border-slate-200 text-slate-600"}`}>Menampilkan {filteredPagu.length} data pagu</div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className={`${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} overflow-hidden rounded-2xl shadow-lg backdrop-blur-md`}>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow className={isDark ? "bg-[#0a0f1d]" : "bg-slate-50"}>
                {['NO. REVISI', 'TANGGAL', 'AKUN ANGGARAN', 'PAGU SEBELUM', 'PAGU SESUDAH', 'SELISIH', 'ALASAN', 'AKSI'].map((head) => <TableHead key={head} className={`text-[11px] font-extrabold ${head === 'AKSI' ? 'text-center' : ''} ${isDark ? "text-gray-400" : "text-slate-600"}`}>{head}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {filteredRevisi.length === 0 ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-xs text-slate-500">Belum ada revisi pada tahun anggaran ini.</TableCell></TableRow> : filteredRevisi.map((item) => {
                  const difference = item.paguSesudah - item.paguSebelum
                  return <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs font-bold text-red-600 dark:text-red-400">{item.nomor}</TableCell>
                    <TableCell className={`whitespace-nowrap text-xs ${isDark ? "text-gray-300" : "text-slate-600"}`}>{item.tanggal}</TableCell>
                    <TableCell><p className={`text-xs font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{item.namaAkun}</p><span className="text-[10px] text-slate-500">{item.kodeAkun}</span></TableCell>
                    <TableCell className={`whitespace-nowrap text-xs font-semibold ${isDark ? "text-gray-200" : "text-slate-700"}`}>{formatRupiah(item.paguSebelum)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs font-bold text-red-600 dark:text-red-400">{formatRupiah(item.paguSesudah)}</TableCell>
                    <TableCell className={`whitespace-nowrap text-xs font-bold ${difference >= 0 ? "text-red-600 dark:text-red-400" : isDark ? "text-gray-300" : "text-slate-600"}`}>{difference >= 0 ? "+" : "−"}{formatRupiah(Math.abs(difference))}</TableCell>
                    <TableCell className={`max-w-[220px] truncate text-xs ${isDark ? "text-gray-300" : "text-slate-600"}`} title={item.alasan}>{item.alasan}</TableCell>
                    <TableCell><div className="flex justify-center gap-1"><button onClick={() => openEditRevisi(item)} className="rounded-lg p-1.5 text-red-600 hover:bg-red-500/15 cursor-pointer" title="Edit revisi"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => setRevisiList((items) => items.filter((row) => row.id !== item.id))} className="rounded-lg p-1.5 text-red-600 hover:bg-red-500/15 cursor-pointer" title="Hapus revisi"><Trash2 className="h-3.5 w-3.5" /></button></div></TableCell>
                  </TableRow>
                })}
              </TableBody>
            </Table>
            <div className={`border-t p-4 text-xs ${isDark ? "border-white/10 text-gray-400" : "border-slate-200 text-slate-600"}`}>Menampilkan {filteredRevisi.length} data revisi</div>
          </CardContent>
        </Card>
      )}

      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className={`w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl ${isDark ? "bg-[#0f172a] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-white/10 bg-[#0a0f1d]" : "border-slate-200 bg-slate-50"}`}>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">TA {selectedTA}</p><h2 className="text-sm font-bold">{modalType === "pagu" ? `${editingPaguId ? "Edit" : "Tambah"} Pagu Anggaran` : `${editingRevisiId ? "Edit" : "Tambah"} Revisi Anggaran`}</h2></div>
              <button type="button" onClick={closeModal} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/15 hover:text-red-500 cursor-pointer"><X className="h-4 w-4" /></button>
            </div>

            {modalType === "pagu" ? (
              <form onSubmit={submitPagu} className="space-y-4 p-5 text-xs">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="space-y-1 font-semibold">Kode Akun<input required value={formKode} onChange={(e) => setFormKode(e.target.value)} className={inputClass} /></label><label className="space-y-1 font-semibold">Subbagian<select value={formSubbagian} onChange={(e) => setFormSubbagian(e.target.value as Subbagian)} className={inputClass}>{SUBBAGIAN_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></label></div>
                <label className="block space-y-1 font-semibold">Nama Akun<input required value={formNama} onChange={(e) => setFormNama(e.target.value)} className={inputClass} /></label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="space-y-1 font-semibold">Pagu Anggaran (Rp)<input required min={0} type="number" value={formPagu} onChange={(e) => setFormPagu(Number(e.target.value))} className={inputClass} /></label><label className="space-y-1 font-semibold">Realisasi (Rp)<input required min={0} type="number" value={formRealisasi} onChange={(e) => setFormRealisasi(Number(e.target.value))} className={inputClass} /></label></div>
                <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={closeModal} className={`rounded-xl border px-4 py-2 font-bold cursor-pointer ${isDark ? "border-white/10 text-gray-300" : "border-slate-300 text-slate-700"}`}>Batal</button><button type="submit" className="btn-kpu-red rounded-xl px-5 py-2 font-bold text-white cursor-pointer">Simpan Pagu</button></div>
              </form>
            ) : (
              <form onSubmit={submitRevisi} className="space-y-4 p-5 text-xs">
                <label className="block space-y-1 font-semibold">Tanggal Revisi<input required type="date" min={`${selectedTA}-01-01`} max={`${selectedTA}-12-31`} value={formTanggal} onChange={(e) => setFormTanggal(e.target.value)} className={inputClass} /></label>
                <label className="block space-y-1 font-semibold">Akun Anggaran<select required value={formAkunId} onChange={(e) => { const account = paguList.find((item) => item.id === e.target.value); setFormAkunId(e.target.value); setFormPaguSebelum(account?.pagu || 0); setFormPaguSesudah(account?.pagu || 0) }} className={inputClass}>{paguList.filter((item) => item.tahun === selectedTA).map((item) => <option key={item.id} value={item.id}>{item.kode} — {item.nama}</option>)}</select></label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="space-y-1 font-semibold">Pagu Sebelum<input readOnly value={formatRupiah(formPaguSebelum)} className={`${inputClass} opacity-70`} /></label><label className="space-y-1 font-semibold">Pagu Sesudah (Rp)<input required min={0} type="number" value={formPaguSesudah} onChange={(e) => setFormPaguSesudah(Number(e.target.value))} className={inputClass} /></label></div>
                <label className="block space-y-1 font-semibold">Alasan Revisi<textarea required rows={3} value={formAlasan} onChange={(e) => setFormAlasan(e.target.value)} placeholder="Jelaskan alasan perubahan pagu..." className={inputClass} /></label>
                <div className={`rounded-xl border p-3 ${isDark ? "border-red-500/20 bg-red-950/20" : "border-red-200 bg-red-50"}`}><span className="text-slate-500">Selisih revisi: </span><strong className="text-red-600 dark:text-red-400">{formatRupiah(formPaguSesudah - formPaguSebelum)}</strong></div>
                <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={closeModal} className={`rounded-xl border px-4 py-2 font-bold cursor-pointer ${isDark ? "border-white/10 text-gray-300" : "border-slate-300 text-slate-700"}`}>Batal</button><button type="submit" className="btn-kpu-red rounded-xl px-5 py-2 font-bold text-white cursor-pointer">Simpan Revisi</button></div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
