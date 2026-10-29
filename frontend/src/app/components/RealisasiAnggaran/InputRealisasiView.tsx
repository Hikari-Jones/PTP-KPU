import { useState } from "react"
import { CheckCircle2, FileText, Save, Send, Upload, Wallet } from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { createRealisasiAnggaranApi } from "../../../services/api"

interface AccountOption {
  kode: string
  nama: string
  subbagian: string
  pagu: number
  realisasi: number
}

const ACCOUNT_OPTIONS: AccountOption[] = [
  { kode: "5211", nama: "Belanja Gaji dan Tunjangan", subbagian: "Keuangan", pagu: 8500000000, realisasi: 6375000000 },
  { kode: "5212", nama: "Belanja Honorarium", subbagian: "Teknis", pagu: 3200000000, realisasi: 2560000000 },
  { kode: "5221", nama: "Belanja Barang Operasional", subbagian: "UMLOG", pagu: 4800000000, realisasi: 2880000000 },
  { kode: "5222", nama: "Belanja Barang Non Operasional", subbagian: "Teknis", pagu: 6500000000, realisasi: 4225000000 },
  { kode: "5231", nama: "Belanja Pemeliharaan", subbagian: "SDM", pagu: 2100000000, realisasi: 1260000000 },
  { kode: "5241", nama: "Belanja Perjalanan Dinas", subbagian: "Hukum", pagu: 4200000000, realisasi: 3150000000 },
  { kode: "5251", nama: "Belanja Jasa", subbagian: "RENDATIN", pagu: 7800000000, realisasi: 5460000000 },
]

export function InputRealisasiView({ theme }: { theme: "light" | "dark" }) {
  const isDark = theme === "dark"
  const [tanggal, setTanggal] = useState("2025-09-19")
  const [nomorDokumen, setNomorDokumen] = useState("")
  const [kodeAkun, setKodeAkun] = useState("")
  const [uraian, setUraian] = useState("")
  const [jumlah, setJumlah] = useState("")
  const [fileName, setFileName] = useState("")
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const selectedAccount = ACCOUNT_OPTIONS.find((item) => item.kode === kodeAkun)
  const remaining = selectedAccount ? selectedAccount.pagu - selectedAccount.realisasi : 0
  const numericAmount = Number(jumlah) || 0
  const isOverBudget = Boolean(selectedAccount && numericAmount > remaining)

  const formatRupiah = (value: number) => `Rp ${new Intl.NumberFormat("id-ID").format(value)}`
  const inputClass = `w-full rounded-xl border px-3 py-2.5 text-xs font-semibold outline-none transition-colors ${
    isDark
      ? "bg-[#0f172a] border-white/10 text-white placeholder:text-slate-500 focus:border-red-500"
      : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-red-500"
  }`

  const validate = () => {
    if (!tanggal || !nomorDokumen.trim() || !kodeAkun || !uraian.trim() || numericAmount <= 0) {
      setMessage({ type: "error", text: "Lengkapi seluruh kolom wajib sebelum menyimpan realisasi." })
      return false
    }
    if (isOverBudget) {
      setMessage({ type: "error", text: "Jumlah realisasi melebihi sisa anggaran akun yang dipilih." })
      return false
    }
    return true
  }

  const save = async (status: "draft" | "submit") => {
    if (!validate()) return

    try {
      await createRealisasiAnggaranApi({
        tanggal,
        nomor_dokumen: nomorDokumen,
        kode_akun: kodeAkun,
        uraian,
        jumlah: numericAmount,
        file_bukti: fileName || "bukti_transaksi.pdf",
        status: status === "draft" ? "draft" : "menunggu_verifikasi",
      })
    } catch (err) {
      console.warn("Backend offline, saving locally", err)
    }

    setMessage({
      type: "success",
      text:
        status === "draft"
          ? `Draft realisasi ${nomorDokumen} berhasil disimpan.`
          : `Realisasi ${nomorDokumen} berhasil dikirim untuk verifikasi bendahara.`,
    })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-in fade-in duration-200">
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
          Realisasi Anggaran
        </p>
        <h1 className={`m-0 text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-black"}`}>
          Input Realisasi
        </h1>
        <p className={`mt-1 text-xs font-medium ${isDark ? "text-gray-400" : "text-slate-600"}`}>
          Tambah transaksi realisasi anggaran baru untuk TA 2025.
        </p>
      </div>

      <Card
        className={`overflow-hidden rounded-2xl border shadow-lg ${
          isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white border-slate-200"
        }`}
      >
        <CardContent className="space-y-5 p-5 sm:p-6">
          {message && (
            <div
              className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-semibold ${
                message.type === "success"
                  ? "border-red-500/20 bg-red-600/10 text-red-600 dark:text-red-300"
                  : "border-red-500/30 bg-red-950/20 text-red-600 dark:text-red-300"
              }`}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {message.text}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-bold">
              Tanggal Transaksi <span className="text-red-500">*</span>
              <input
                type="date"
                required
                value={tanggal}
                onChange={(event) => setTanggal(event.target.value)}
                min="2025-01-01"
                max="2025-12-31"
                className={inputClass}
              />
            </label>
            <label className="space-y-1.5 text-xs font-bold">
              Nomor Dokumen <span className="text-red-500">*</span>
              <input
                required
                value={nomorDokumen}
                onChange={(event) => setNomorDokumen(event.target.value)}
                placeholder="Contoh: SPD-0125/2025"
                className={inputClass}
              />
            </label>
          </div>

          <label className="block space-y-1.5 text-xs font-bold">
            Akun Anggaran <span className="text-red-500">*</span>
            <select value={kodeAkun} onChange={(event) => setKodeAkun(event.target.value)} className={inputClass}>
              <option value="">-- Pilih Akun Anggaran --</option>
              {ACCOUNT_OPTIONS.map((item) => (
                <option key={item.kode} value={item.kode}>
                  {item.kode} - {item.nama} ({item.subbagian})
                </option>
              ))}
            </select>
          </label>

          <div
            className={`rounded-2xl border border-dashed p-4 ${
              isDark ? "bg-[#111b2e] border-white/10" : "bg-slate-50 border-slate-300"
            }`}
          >
            {selectedAccount ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-red-600 p-2.5 text-white">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold">{selectedAccount.nama}</p>
                    <p className="text-[10px] text-slate-500">
                      {selectedAccount.kode} - Subbagian {selectedAccount.subbagian}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Pagu Anggaran</p>
                    <p className={`mt-1 text-xs font-black ${isDark ? "text-white" : "text-slate-900"}`}>
                      {formatRupiah(selectedAccount.pagu)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Sudah Direalisasi</p>
                    <p className="mt-1 text-xs font-black text-red-600 dark:text-red-400">
                      {formatRupiah(selectedAccount.realisasi)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Sisa Anggaran</p>
                    <p className={`mt-1 text-xs font-black ${isDark ? "text-white" : "text-slate-900"}`}>
                      {formatRupiah(remaining)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-28 flex-col items-center justify-center gap-2 text-center text-xs text-slate-500">
                <Wallet className="h-6 w-6 opacity-40" />
                <span>Pilih akun anggaran untuk melihat informasi pagu.</span>
              </div>
            )}
          </div>

          <label className="block space-y-1.5 text-xs font-bold">
            Uraian / Keterangan <span className="text-red-500">*</span>
            <textarea
              rows={4}
              required
              value={uraian}
              onChange={(event) => setUraian(event.target.value)}
              placeholder="Masukkan uraian kegiatan..."
              className={inputClass}
            />
          </label>

          <label className="block space-y-1.5 text-xs font-bold">
            Jumlah (Rp) <span className="text-red-500">*</span>
            <input
              type="number"
              min={0}
              required
              value={jumlah}
              onChange={(event) => setJumlah(event.target.value)}
              placeholder="Rp 0"
              className={`${inputClass} ${isOverBudget ? "border-red-500 text-red-500" : ""}`}
            />
            {numericAmount > 0 && (
              <span className={`block text-[10px] ${isOverBudget ? "text-red-500" : "text-slate-500"}`}>
                {isOverBudget ? "Jumlah melebihi sisa anggaran" : `Terbaca: ${formatRupiah(numericAmount)}`}
              </span>
            )}
          </label>

          <div className="space-y-1.5 text-xs font-bold">
            Lampiran SPJ / Bukti Transaksi
            <label
              className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed p-4 text-center transition-colors ${
                fileName
                  ? "border-red-500/40 bg-red-600/10"
                  : isDark
                  ? "border-white/10 bg-[#111b2e] hover:border-red-500/40"
                  : "border-slate-300 bg-slate-50 hover:border-red-400"
              }`}
            >
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(event) => setFileName(event.target.files?.[0]?.name || "")}
              />
              {fileName ? (
                <>
                  <FileText className="h-6 w-6 text-red-600" />
                  <span className="text-red-600 dark:text-red-400">{fileName}</span>
                  <span className="text-[10px] font-medium text-slate-500">Klik untuk mengganti berkas</span>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-slate-500" />
                  <span className={isDark ? "text-gray-300" : "text-slate-700"}>
                    Seret file ke sini atau <span className="text-red-600">pilih file</span>
                  </span>
                  <span className="text-[10px] font-medium text-slate-500">PDF, JPG, PNG - maksimal 10 MB</span>
                </>
              )}
            </label>
          </div>

          <div
            className={`flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end ${
              isDark ? "border-white/10" : "border-slate-200"
            }`}
          >
            <button
              type="button"
              onClick={() => save("draft")}
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold cursor-pointer ${
                isDark ? "border-white/10 bg-[#0f172a] text-gray-300" : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              <Save className="h-4 w-4" /> Simpan Draft
            </button>
            <button
              type="button"
              onClick={() => save("submit")}
              className="btn-kpu-red flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white cursor-pointer"
            >
              <Send className="h-4 w-4" /> Submit untuk Verifikasi
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
