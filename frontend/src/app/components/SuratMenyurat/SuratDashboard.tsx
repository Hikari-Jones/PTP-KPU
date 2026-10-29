import { useState } from "react"
import {
  FileText,
  Mail,
  Send,
  Clock,
  FileCheck,
  Search,
  Plus,
  Eye,
  AlertCircle,
} from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Badge } from "../ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import type { SuratItem } from "./types"

interface SuratDashboardProps {
  theme: "light" | "dark"
  suratList: SuratItem[]
  initialTab?: string
  onOpenInputSuratMasuk: () => void
  onOpenBuatDraft: () => void
  onSelectSurat: (surat: SuratItem, tab?: string) => void
}

export function SuratDashboard({
  theme,
  suratList,
  initialTab = "semua",
  onOpenInputSuratMasuk,
  onOpenBuatDraft,
  onSelectSurat,
}: SuratDashboardProps) {
  const isDark = theme === "dark"

  // Active filter tab
  const [activeTab, setActiveTab] = useState<string>(initialTab)
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [jenisFilter, setJenisFilter] = useState<string>("semua")

  // Statistics calculation
  const totalSuratMasuk = suratList.filter((s) => s.jenis === "masuk").length
  const totalSuratKeluar = suratList.filter((s) => s.jenis === "keluar" || s.jenis === "nota_dinas").length
  const menungguDisposisi = suratList.filter((s) => s.status === "menunggu_disposisi").length
  const menungguTTE = suratList.filter((s) => s.status === "menunggu_tte").length

  // Filtered List
  const filteredSurat = suratList.filter((item) => {
    // Search query filter
    const matchesSearch =
      item.nomorSurat.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.perihal.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.pengirim.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.penerima.toLowerCase().includes(searchQuery.toLowerCase())

    // Jenis filter
    const matchesJenis = jenisFilter === "semua" || item.jenis === jenisFilter

    // Status filter tabs
    let matchesTab = true
    if (activeTab === "masuk") matchesTab = item.jenis === "masuk"
    else if (activeTab === "keluar") matchesTab = item.jenis === "keluar"
    else if (activeTab === "disposisi") matchesTab = item.status === "menunggu_disposisi" || item.status === "dalam_proses"
    else if (activeTab === "tte") matchesTab = item.status === "menunggu_tte"
    else if (activeTab === "terarsip") matchesTab = item.status === "terkirim_terarsip" || item.status === "selesai_disposisi"

    return matchesSearch && matchesJenis && matchesTab
  })

  const getStatusBadge = (status: SuratItem["status"]) => {
    switch (status) {
      case "menunggu_disposisi":
        return <Badge variant="warning">Menunggu Disposisi</Badge>
      case "dalam_proses":
        return <Badge variant="diproses">Dalam Proses</Badge>
      case "selesai_disposisi":
        return <Badge variant="success">Selesai Disposisi</Badge>
      case "draft":
        return <Badge variant="draft">Draft Konsep</Badge>
      case "revisi":
        return <Badge variant="default">Perlu Revisi</Badge>
      case "menunggu_tte":
        return <Badge variant="info">Menunggu TTE</Badge>
      case "disetujui":
        return <Badge variant="diproses">Disetujui (Siap TTE)</Badge>
      case "terkirim_terarsip":
        return <Badge variant="terkirim">Terkirim & Terarsip</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getPrioritasBadge = (prioritas: SuratItem["prioritas"]) => {
    switch (prioritas) {
      case "sangat_penting":
        return <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-600 text-white shadow-xs">Sangat Penting</span>
      case "penting":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600/15 text-red-600 dark:text-red-400 border border-red-500/30">Penting</span>
      case "rahasia":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-950">Rahasia</span>
      default:
        return <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isDark ? "bg-slate-800 text-gray-300" : "bg-slate-100 text-slate-800"}`}>Biasa</span>
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight my-0 ${isDark ? "text-white" : "text-black"}`}>
            Sistem Informasi Persuratan & Disposisi (PTP-KPU)
          </h1>
          <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
            Modul pengurusan alur registrasi surat masuk, disposisi pimpinan, draft surat keluar, TTE digital, dan arsip.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenInputSuratMasuk}
            className="btn-kpu-red px-3.5 py-2 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Registrasi Surat Masuk</span>
          </button>
          <button
            onClick={onOpenBuatDraft}
            className="btn-kpu-red px-3.5 py-2 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Draft Surat Keluar</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Surat Masuk */}
        <Card className={`transition-all ${isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}`}>
          <CardContent className="p-5 flex items-center justify-between min-h-[110px]">
            <div className="flex-1 flex flex-col justify-center space-y-1">
              <p className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                Total Surat Masuk
              </p>
              <h2 className={`text-2xl font-black ${isDark ? "text-white" : "text-black"}`}>{totalSuratMasuk} Berkas</h2>
              <span className="inline-flex items-center text-[10px] text-red-600 dark:text-red-400 font-bold">Ter-registrasi di agenda</span>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-950 flex items-center justify-center shrink-0 shadow-xs">
              <Mail className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* Surat Keluar */}
        <Card className={`transition-all ${isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}`}>
          <CardContent className="p-5 flex items-center justify-between min-h-[110px]">
            <div className="flex-1 flex flex-col justify-center space-y-1">
              <p className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                Surat Keluar / Nota
              </p>
              <h2 className={`text-2xl font-black ${isDark ? "text-white" : "text-black"}`}>{totalSuratKeluar} Berkas</h2>
              <span className="inline-flex items-center text-[10px] text-red-600 dark:text-red-400 font-bold">Telah diterbitkan</span>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Send className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* Menunggu Disposisi */}
        <Card className={`transition-all ${isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}`}>
          <CardContent className="p-5 flex items-center justify-between min-h-[110px]">
            <div className="flex-1 flex flex-col justify-center space-y-1">
              <p className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                Menunggu Disposisi
              </p>
              <h2 className={`text-2xl font-black ${isDark ? "text-white" : "text-black"}`}>{menungguDisposisi} Surat</h2>
              <span className="inline-flex items-center text-[10px] text-red-600 dark:text-red-400 font-bold">Perlu arahan pimpinan</span>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-950 flex items-center justify-center shrink-0 shadow-xs">
              <Clock className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        {/* Menunggu TTE */}
        <Card className={`transition-all ${isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}`}>
          <CardContent className="p-5 flex items-center justify-between min-h-[110px]">
            <div className="flex-1 flex flex-col justify-center space-y-1">
              <p className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                Menunggu TTE Digital
              </p>
              <h2 className={`text-2xl font-black ${isDark ? "text-white" : "text-black"}`}>{menungguTTE} Berkas</h2>
              <span className="inline-flex items-center text-[10px] text-red-600 dark:text-red-400 font-bold">Siap tanda tangan</span>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <FileCheck className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Section with Tabs & Search */}
      <Card className={isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}>
        {/* Navigation Tabs Header */}
        <div className={`p-4 border-b space-y-4 ${isDark ? "border-[#1e293b]" : "border-slate-200"}`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
              {[
                { id: "semua", label: "Semua Berkas", count: suratList.length },
                { id: "masuk", label: "Surat Masuk", count: totalSuratMasuk },
                { id: "keluar", label: "Surat Keluar", count: totalSuratKeluar },
                { id: "disposisi", label: "Perlu Disposisi", count: menungguDisposisi },
                { id: "tte", label: "Perlu TTE", count: menungguTTE },
                { id: "terarsip", label: "Terkirim & Terarsip", count: suratList.filter((s) => s.status === "terkirim_terarsip").length },
              ].map((tab) => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${isActive
                      ? "bg-red-600 text-white shadow-sm"
                      : isDark
                        ? "text-gray-300 hover:bg-[#131d30] hover:text-white"
                        : "text-slate-800 hover:bg-slate-100 hover:text-black"
                      }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isActive
                        ? "bg-white/20 text-white"
                        : isDark
                          ? "bg-slate-800 text-white"
                          : "bg-slate-200 text-black"
                        }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Quick Controls */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 md:w-64">
                <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-gray-400" : "text-slate-600"}`} />
                <input
                  type="text"
                  placeholder="Cari no. surat, perihal, pengirim..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-9 pr-3 py-1.5 text-xs font-semibold rounded-xl border outline-none transition-colors ${isDark
                    ? "bg-[#131d30] border-[#1e293b] text-white focus:border-red-500 placeholder-gray-500"
                    : "bg-slate-50 border-slate-300 text-black focus:border-red-500 placeholder-slate-500"
                    }`}
                />
              </div>

              <select
                value={jenisFilter}
                onChange={(e) => setJenisFilter(e.target.value)}
                className={`py-1.5 px-2.5 text-xs font-bold rounded-xl border outline-none cursor-pointer ${isDark ? "bg-[#131d30] border-[#1e293b] text-white" : "bg-slate-50 border-slate-300 text-black"
                  }`}
              >
                <option value="semua">Semua Jenis</option>
                <option value="masuk">Surat Masuk</option>
                <option value="keluar">Surat Keluar</option>
                <option value="nota_dinas">Nota Dinas</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className={isDark ? "border-b border-white/30 bg-[#080c14]/40" : "border-b border-slate-200 bg-slate-100"}>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Nomor Surat & Tanggal</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Perihal & Ringkasan</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Pengirim / Penerima</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Prioritas</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Status Alur</TableHead>
                <TableHead className={`text-[11px] font-extrabold uppercase text-right ${isDark ? "text-white" : "text-black"}`}>Aksi Alur</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSurat.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <div className="flex flex-col items-center justify-center gap-2 text-gray-400">
                      <AlertCircle className="w-8 h-8 opacity-40" />
                      <p className="text-xs font-semibold">Tidak ada data persuratan yang memenuhi filter.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredSurat.map((surat) => (
                  <TableRow
                    key={surat.id}
                    className={`cursor-pointer ${isDark ? "border-b border-white/20" : "border-b border-slate-100"
                      }`}
                    onClick={() => onSelectSurat(surat)}
                  >
                    {/* Nomor & Tanggal */}
                    <TableCell className="align-top py-3">
                      <div className="space-y-1">
                        <span className="font-mono text-xs font-bold text-red-600 dark:text-red-400 block">{surat.nomorSurat}</span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${isDark ? "bg-slate-800 text-white border border-slate-700" : "bg-slate-100 text-black border border-slate-300"
                              }`}
                          >
                            {surat.jenis.replace("_", " ")}
                          </span>
                          <span className={`text-[10px] font-semibold ${isDark ? "text-gray-300" : "text-slate-700"}`}>{surat.tanggal}</span>
                        </div>
                      </div>
                    </TableCell>

                    {/* Perihal & Ringkasan */}
                    <TableCell className="align-top py-3 max-w-xs">
                      <div>
                        <p className={`font-bold text-xs leading-snug ${isDark ? "text-white" : "text-black"}`}>
                          {surat.perihal}
                        </p>
                        {surat.ringkasanIsi && (
                          <p className={`text-[11px] font-medium line-clamp-1 mt-0.5 ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                            {surat.ringkasanIsi}
                          </p>
                        )}
                        {surat.fileName && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400 mt-1">
                            <FileText className="w-3 h-3" />
                            <span>{surat.fileName}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Pengirim / Penerima */}
                    <TableCell className="align-top py-3">
                      <div className="text-xs space-y-0.5 font-medium">
                        <p className={isDark ? "text-white" : "text-black"}>
                          <span className="text-[10px] font-bold text-red-600 dark:text-red-400">Dari:</span> {surat.pengirim}
                        </p>
                        <p className={isDark ? "text-gray-300" : "text-slate-700"}>
                          <span className="text-[10px] font-bold text-red-600 dark:text-red-400">Ke:</span> {surat.penerima}
                        </p>
                      </div>
                    </TableCell>

                    {/* Prioritas */}
                    <TableCell className="align-top py-3">{getPrioritasBadge(surat.prioritas)}</TableCell>

                    {/* Status Alur */}
                    <TableCell className="align-top py-3">
                      <div className="space-y-1">
                        {getStatusBadge(surat.status)}
                        {surat.disposisi && (
                          <p className="text-[10px] text-red-600 dark:text-red-400 font-mono font-bold">➡ {surat.disposisi.tujuanUnit}</p>
                        )}
                      </div>
                    </TableCell>

                    {/* Action Button */}
                    <TableCell className="align-top py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onSelectSurat(surat)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer active:scale-95 ${isDark
                          ? "bg-slate-800 text-white hover:bg-red-600 border border-slate-700"
                          : "bg-slate-100 text-black hover:bg-red-600 hover:text-white border border-slate-300"
                          }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Detail & Alur</span>
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
