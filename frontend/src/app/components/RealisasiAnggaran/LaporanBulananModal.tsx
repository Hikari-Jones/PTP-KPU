import { useState } from "react"
import { X, Download, Filter, FileSpreadsheet } from "lucide-react"
import type { TransaksiRealisasi } from "./types"
import { Card, CardContent } from "../ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { Badge } from "../ui/badge"

interface Props {
  isOpen: boolean
  onClose: () => void
  transaksiList: TransaksiRealisasi[]
  theme: "light" | "dark"
}

export function LaporanBulananModal({ isOpen, onClose, transaksiList, theme }: Props) {
  const isDark = theme === "dark"

  const [selectedPeriode, setSelectedPeriode] = useState("Semua")
  const [selectedSubbagian, setSelectedSubbagian] = useState("Semua")

  if (!isOpen) return null

  const filteredList = transaksiList.filter((item) => {
    const matchPeriode = selectedPeriode === "Semua" || item.periode === selectedPeriode
    const matchSubbagian = selectedSubbagian === "Semua" || item.subbagian === selectedSubbagian
    return matchPeriode && matchSubbagian
  })

  const totalJumlah = filteredList.reduce((acc, curr) => acc + curr.jumlah, 0)

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val)
  }

  const handleDownloadExcel = () => {
    let csv = "No_Dokumen,Tanggal,Kode_Akun,Nama_Akun,Subbagian,Usulan_Kegiatan,Jumlah_Realisasi_Rp,Status,Periode\n"
    filteredList.forEach((t) => {
      csv += `"${t.noDokumen}","${t.tanggal}","${t.kodeAkun}","${t.namaAkun}","${t.subbagian}","${t.usulanKegiatan}",${t.jumlah},"${t.status}","${t.periode}"\n`
    })

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `Laporan_Realisasi_Anggaran_${selectedPeriode.replace(/\s+/g, "_")}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className={`w-full max-w-4xl rounded-2xl border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${isDark ? "bg-[#0c1220] border-[#1e293b] text-white" : "bg-white border-slate-200 text-black"
          }`}
      >
        {/* Modal Header */}
        <div
          className={`p-4 border-b flex items-center justify-between ${isDark ? "border-[#1e293b] bg-[#11192b]" : "border-slate-200 bg-slate-50"
            }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-red-600 text-white shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-base font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>
                Laporan Bulanan Realisasi Anggaran
              </h2>
              <p className={`text-[11px] font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                Rekapitulasi rincian transaksi penyerapan anggaran per periode dan subbagian
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isDark ? "hover:bg-[#1e293b] text-gray-300" : "hover:bg-slate-200 text-slate-700"
              }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Filters */}
        <div
          className={`p-4 border-b flex flex-wrap items-center justify-between gap-3 ${isDark ? "bg-[#090e1a] border-[#1e293b]" : "bg-slate-100/80 border-slate-200"
            }`}
        >
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-red-600">
              <Filter className="w-3.5 h-3.5" /> Filter:
            </div>

            <div>
              <select
                value={selectedPeriode}
                onChange={(e) => setSelectedPeriode(e.target.value)}
                className={`rounded-lg px-2.5 py-1.5 border text-xs font-bold ${isDark ? "bg-[#131b2e] border-[#1e293b] text-white" : "bg-white border-slate-300 text-black"
                  }`}
              >
                <option value="Semua">Semua Periode</option>
                <option value="Agustus 2026">Agustus 2026</option>
                <option value="Juli 2026">Juli 2026</option>
                <option value="Q2 2026">Q2 2026</option>
                <option value="Q1 2026">Q1 2026</option>
              </select>
            </div>

            <div>
              <select
                value={selectedSubbagian}
                onChange={(e) => setSelectedSubbagian(e.target.value)}
                className={`rounded-lg px-2.5 py-1.5 border text-xs font-bold ${isDark ? "bg-[#131b2e] border-[#1e293b] text-white" : "bg-white border-slate-300 text-black"
                  }`}
              >
                <option value="Semua">Semua Subbagian</option>
                <option value="Keuangan">Keuangan</option>
                <option value="Teknis Penyelenggaraan Pemilu">Teknis Penyelenggaraan Pemilu</option>
                <option value="SDM (Partisipasi Hubungan Masyarakat dan Sumber Daya Manusia)">SDM</option>
                <option value="RENDATIN (Perencanaan, Data dan Informasi)">RENDATIN</option>
                <option value="Hukum">Hukum</option>
                <option value="UMLOG (Umum dan Logistik)">UMLOG</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleDownloadExcel}
            className="btn-kpu-red px-3.5 py-1.5 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shrink-0 active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Unduh Laporan (.xlsx / .csv)</span>
          </button>
        </div>

        {/* Modal Table Body */}
        <div className="p-4 overflow-y-auto flex-1">
          <Card className={isDark ? "bg-[#0d1322] border-white/10" : "bg-white border-slate-200"}>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className={isDark ? "border-b border-white/30 bg-[#0a0e1a]" : "border-b border-slate-200 bg-slate-100"}>
                    <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>No. Dokumen</TableHead>
                    <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Tanggal</TableHead>
                    <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Kode & Nama Akun</TableHead>
                    <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Subbagian</TableHead>
                    <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Usulan Kegiatan</TableHead>
                    <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Jumlah (Rp)</TableHead>
                    <TableHead className={`text-[11px] font-extrabold uppercase ${isDark ? "text-white" : "text-black"}`}>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-slate-400 text-xs">
                        Tidak ada transaksi realisasi anggaran yang sesuai dengan filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredList.map((item) => (
                      <TableRow
                        key={item.id}
                        className={
                          isDark ? "border-b border-white/20" : "border-b border-slate-100"
                        }
                      >
                        <TableCell className="font-mono text-xs font-bold text-red-600 dark:text-red-400">{item.noDokumen}</TableCell>
                        <TableCell className={`text-xs font-semibold whitespace-nowrap ${isDark ? "text-gray-300" : "text-black"}`}>{item.tanggal}</TableCell>
                        <TableCell className="text-xs">
                          <span className={`font-mono font-bold block ${isDark ? "text-white" : "text-black"}`}>{item.kodeAkun}</span>
                          <span className={`text-[11px] font-semibold ${isDark ? "text-gray-300" : "text-slate-800"}`}>{item.namaAkun}</span>
                        </TableCell>
                        <TableCell className={`text-xs font-bold ${isDark ? "text-gray-200" : "text-black"}`}>{item.subbagian}</TableCell>
                        <TableCell className={`font-bold text-xs max-w-xs truncate ${isDark ? "text-white" : "text-black"}`}>{item.usulanKegiatan}</TableCell>
                        <TableCell className="text-xs font-black text-red-600 dark:text-red-400 whitespace-nowrap">
                          {formatRupiah(item.jumlah)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.status === "Disetujui"
                                ? "terkirim"
                                : item.status === "Menunggu Verifikasi"
                                  ? "diproses"
                                  : item.status === "Draft"
                                    ? "draft"
                                    : "diterima"
                            }
                          >
                            {item.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Modal Footer Summary */}
        <div
          className={`p-4 border-t flex items-center justify-between shrink-0 text-xs font-bold ${isDark ? "border-[#1e293b] bg-[#11192b] text-white" : "border-slate-200 bg-slate-50 text-black"
            }`}
        >
          <span>Total Realisasi Terfilter ({filteredList.length} Transaksi):</span>
          <span className="text-base font-black text-red-600 dark:text-red-400">{formatRupiah(totalJumlah)}</span>
        </div>
      </div>
    </div>
  )
}
