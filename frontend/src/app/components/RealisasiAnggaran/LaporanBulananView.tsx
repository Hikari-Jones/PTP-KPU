import { useState } from "react"
import { Download } from "lucide-react"
import { Card, CardContent } from "../ui/card"

interface MonthlyReportRow {
  kode: string
  nama: string
  subbagian: string
  pagu: number
  months: number[]
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
const SUBBAGIAN = ["SDM", "RENDATIN", "Teknis", "Hukum", "Keuangan", "UMLOG"]

const REPORT_DATA: MonthlyReportRow[] = [
  { kode: "5211", nama: "Belanja Gaji dan Tunjangan", subbagian: "Keuangan", pagu: 8500000000, months: [530823095, 691974596, 795034642, 647806805, 765588915, 868648961, 559468822, 839203233, 677251732, 0, 0, 0] },
  { kode: "5212", nama: "Belanja Honorarium", subbagian: "Teknis", pagu: 3200000000, months: [212840647, 277875289, 319260970, 260138568, 397436490, 348822171, 224665127, 336997691, 271963048, 0, 0, 0] },
  { kode: "5221", nama: "Belanja Barang Operasional", subbagian: "UMLOG", pagu: 4800000000, months: [239445727, 312609700, 359168591, 292655889, 345866051, 392424946, 252748268, 379122402, 305958430, 0, 0, 0] },
  { kode: "5222", nama: "Belanja Barang Non Operasional", subbagian: "Teknis", pagu: 6500000000, months: [351270208, 458602771, 526985312, 429330254, 507390300, 575692841, 370785219, 556177829, 448845266, 0, 0, 0] },
  { kode: "5231", nama: "Belanja Pemeliharaan", subbagian: "SDM", pagu: 2100000000, months: [184757586, 136766744, 157136259, 128036952, 151316397, 171685912, 110577367, 165866051, 133856813, 0, 0, 0] },
  { kode: "5241", nama: "Belanja Perjalanan Dinas", subbagian: "Hukum", pagu: 4200000000, months: [261893764, 341916859, 392849647, 320002379, 378290993, 429214781, 276443418, 414665127, 334642032, 0, 0, 0] },
  { kode: "5251", nama: "Belanja Jasa", subbagian: "RENDATIN", pagu: 7800000000, months: [453949102, 592659889, 680923788, 554826790, 655704388, 743972286, 479168591, 718752887, 580046109, 0, 0, 0] },
  { kode: "5311", nama: "Belanja Modal Peralatan", subbagian: "UMLOG", pagu: 3680000000, months: [214179981, 279612009, 321256351, 261764434, 309357968, 351002309, 226069284, 339103926, 273662818, 0, 0, 0] },
  { kode: "5321", nama: "Belanja Modal Gedung", subbagian: "SDM", pagu: 5000000000, months: [229468822, 299584296, 344203233, 280461094, 331454965, 376073903, 242217909, 363325635, 293210162, 0, 0, 0] },
]

export function LaporanBulananView({ theme }: { theme: "light" | "dark" }) {
  const isDark = theme === "dark"
  const [selectedTA, setSelectedTA] = useState(2025)
  const [selectedSubbagian, setSelectedSubbagian] = useState("Semua Subbagian")

  const yearFactor = selectedTA === 2025 ? 1 : 0
  const filteredRows = REPORT_DATA.filter((row) => selectedSubbagian === "Semua Subbagian" || row.subbagian === selectedSubbagian)
  const formatRupiah = (value: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(value))}`
  const compactRupiah = (value: number) => value === 0 ? "—" : formatRupiah(value)

  const totalPagu = filteredRows.reduce((total, row) => total + row.pagu, 0)
  const monthlyTotals = MONTHS.map((_, index) => filteredRows.reduce((total, row) => total + row.months[index] * yearFactor, 0))
  const totalRealisasi = monthlyTotals.reduce((total, value) => total + value, 0)
  const totalSisa = totalPagu - totalRealisasi
  const totalPercentage = totalPagu > 0 ? Math.round((totalRealisasi / totalPagu) * 100) : 0

  const handleExport = () => {
    const header = ["Kode", "Nama Akun", "Subbagian", "Pagu", ...MONTHS, "Total Realisasi", "Sisa", "Persentase"]
    const rows = filteredRows.map((row) => {
      const values = row.months.map((value) => value * yearFactor)
      const realization = values.reduce((total, value) => total + value, 0)
      return [row.kode, `"${row.nama}"`, row.subbagian, row.pagu, ...values, realization, row.pagu - realization, `${Math.round((realization / row.pagu) * 100)}%`].join(",")
    })
    const url = URL.createObjectURL(new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv" }))
    const link = document.createElement("a")
    link.href = url
    link.download = `Laporan_Realisasi_Bulanan_TA_${selectedTA}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const filterClass = `rounded-xl border px-3 py-2 text-xs font-bold outline-none cursor-pointer ${isDark ? "bg-[#0f172a] border-white/10 text-white" : "bg-white border-slate-300 text-slate-900"}`

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">Laporan Anggaran</p>
          <h1 className={`m-0 text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-black"}`}>Laporan Realisasi Bulanan</h1>
          <p className={`mt-1 text-xs font-medium ${isDark ? "text-gray-400" : "text-slate-600"}`}>Rekap realisasi per akun dan bulan • TA {selectedTA}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={selectedTA} onChange={(event) => setSelectedTA(Number(event.target.value))} className={filterClass}><option value={2025}>TA 2025</option><option value={2026}>TA 2026</option></select>
          <select value={selectedSubbagian} onChange={(event) => setSelectedSubbagian(event.target.value)} className={`${filterClass} min-w-44`}><option>Semua Subbagian</option>{SUBBAGIAN.map((item) => <option key={item}>{item}</option>)}</select>
          <button type="button" onClick={handleExport} className="btn-kpu-red flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white cursor-pointer"><Download className="h-4 w-4" /> Export Excel</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Total Pagu", formatRupiah(totalPagu)],
          ["Total Realisasi", formatRupiah(totalRealisasi)],
          ["Sisa Anggaran", formatRupiah(totalSisa)],
          ["Serapan", `${totalPercentage}%`],
        ].map(([label, value]) => <div key={label} className={`rounded-xl border p-3 ${isDark ? "border-white/10 bg-[#111b2e]" : "border-slate-200 bg-slate-50"}`}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 truncate text-sm font-black ${label === "Total Realisasi" || label === "Serapan" ? "text-red-600 dark:text-red-400" : isDark ? "text-white" : "text-slate-900"}`}>{value}</p></div>)}
      </div>

      <Card className={`${isDark ? "bg-[#111827] border-[#263247]" : "bg-white border-slate-200"} overflow-hidden rounded-2xl shadow-lg`}>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-[1900px] w-full border-collapse text-left text-[10px]">
              <thead><tr className={isDark ? "bg-black text-white" : "bg-slate-200 text-slate-800"}>
                <th className="min-w-20 border-b border-r border-slate-700/20 px-3 py-3 font-extrabold">KODE</th>
                <th className="min-w-56 border-b border-r border-slate-700/20 px-3 py-3 font-extrabold">NAMA AKUN</th>
                <th className="min-w-32 border-b border-slate-700/20 px-3 py-3 font-extrabold">SUBBAGIAN</th>
                <th className="min-w-36 border-b border-slate-700/20 px-3 py-3 font-extrabold">PAGU</th>
                {MONTHS.map((month) => <th key={month} className="min-w-32 border-b border-slate-700/20 px-3 py-3 text-right font-extrabold">{month.toUpperCase()}</th>)}
                <th className="min-w-36 border-b border-slate-700/20 px-3 py-3 text-right font-extrabold">TOTAL REALISASI</th><th className="min-w-36 border-b border-slate-700/20 px-3 py-3 text-right font-extrabold">SISA</th><th className="min-w-16 border-b border-slate-700/20 px-3 py-3 text-right font-extrabold">%</th>
              </tr></thead>
              <tbody>
                {filteredRows.map((row) => {
                  const monthValues = row.months.map((value) => value * yearFactor)
                  const realization = monthValues.reduce((total, value) => total + value, 0)
                  const percentage = row.pagu > 0 ? Math.round((realization / row.pagu) * 100) : 0
                  return <tr key={row.kode} className={`border-b ${isDark ? "border-[#263247] bg-[#111827]" : "border-slate-100 bg-white"}`}>
                    <td className={`border-r px-3 py-3 font-mono font-bold text-red-600 dark:text-red-400 ${isDark ? "border-[#263247]" : "border-slate-100"}`}>{row.kode}</td>
                    <td className={`border-r px-3 py-3 font-bold ${isDark ? "border-[#263247] text-white" : "border-slate-100 text-slate-900"}`}>{row.nama}</td>
                    <td className={`px-3 py-3 font-semibold ${isDark ? "text-gray-300" : "text-slate-600"}`}>{row.subbagian}</td>
                    <td className="px-3 py-3 font-bold text-red-600 dark:text-red-400">{formatRupiah(row.pagu)}</td>
                    {monthValues.map((value, index) => <td key={`${row.kode}-${MONTHS[index]}`} className={`px-3 py-3 text-right font-semibold ${value === 0 ? "text-slate-500" : isDark ? "text-gray-200" : "text-slate-700"}`}>{compactRupiah(value)}</td>)}
                    <td className="px-3 py-3 text-right font-black text-red-600 dark:text-red-400">{formatRupiah(realization)}</td><td className={`px-3 py-3 text-right font-bold ${isDark ? "text-gray-200" : "text-slate-700"}`}>{formatRupiah(row.pagu - realization)}</td><td className="px-3 py-3 text-right font-black text-red-600 dark:text-red-400">{percentage}%</td>
                  </tr>
                })}
              </tbody>
              <tfoot><tr className={isDark ? "bg-[#2a1014] text-white" : "bg-red-50 text-slate-900"}>
                <td colSpan={3} className="px-3 py-3 font-black text-red-600 dark:text-red-400">TOTAL KESELURUHAN</td><td className="px-3 py-3 font-black text-red-600 dark:text-red-400">{formatRupiah(totalPagu)}</td>{monthlyTotals.map((value, index) => <td key={MONTHS[index]} className="px-3 py-3 text-right font-bold">{compactRupiah(value)}</td>)}<td className="px-3 py-3 text-right font-black text-red-600 dark:text-red-400">{formatRupiah(totalRealisasi)}</td><td className="px-3 py-3 text-right font-black">{formatRupiah(totalSisa)}</td><td className="px-3 py-3 text-right font-black text-red-600 dark:text-red-400">{totalPercentage}%</td>
              </tr></tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
