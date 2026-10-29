import React, { useState } from "react"
import { X, Send, FileEdit, Sparkles } from "lucide-react"
import type { SuratKeluarFormState } from "./types"

interface BuatDraftSuratModalProps {
  theme: "light" | "dark"
  isOpen: boolean
  onClose: () => void
  onSubmit: (formData: SuratKeluarFormState) => void
}

export function BuatDraftSuratModal({ theme, isOpen, onClose, onSubmit }: BuatDraftSuratModalProps) {
  if (!isOpen) return null
  const isDark = theme === "dark"

  const [formData, setFormData] = useState<SuratKeluarFormState>({
    penerima: "",
    perihal: "",
    tujuan: "KPU Kabupaten / Kota",
    kategoriSurat: "Surat Edaran",
    isiSurat: "",
    catatanInternal: "",
    fileName: "",
  })

  const handleTemplateSelect = (templateType: string) => {
    if (templateType === "edaran") {
      setFormData((prev) => ({
        ...prev,
        perihal: "Surat Edaran Pelaksanaan Tahapan Pilkada Serentak 2026",
        tujuan: "KPU Kabupaten / Kota se-Sulawesi Utara",
        kategoriSurat: "Surat Edaran",
        isiSurat:
          "Sehubungan dengan pelaksanaan tahapan Pemilihan Kepala Daerah Tahun 2026, bersama ini disampaikan instruksi agar seluruh Satker KPU Kab/Kota melengkapi laporan progres logistik paling lambat hari Jumat.",
      }))
    } else if (templateType === "undangan") {
      setFormData((prev) => ({
        ...prev,
        perihal: "Undangan Rapat Koordinasi Evaluasi Keuangan & SIMAK BMN",
        tujuan: "Sekretaris KPU Kabupaten / Kota",
        kategoriSurat: "Surat Undangan",
        isiSurat:
          "Mengundang Bapak/Ibu Kasubag Keuangan dan Operator SIMAK BMN untuk hadir pada Rapat Koordinasi yang akan dilaksanakan pada tanggal 15 Agustus 2026 di Aula KPU Sulut.",
      }))
    } else if (templateType === "nota") {
      setFormData((prev) => ({
        ...prev,
        perihal: "Nota Dinas Pengajuan Kebutuhan Pemeliharaan Server Portal",
        tujuan: "UMLOG (Umum dan Logistik)",
        kategoriSurat: "Nota Dinas Internal",
        isiSurat:
          "Diajukan permohonan pemeliharaan berkala server dan upgrade bandwidth internet kantor KPU Provinsi Sulawesi Utara guna mendukung kelancaran aplikasi PTP-KPU.",
      }))
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setFormData((prev) => ({ ...prev, fileName: file.name }))
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.perihal || !formData.penerima) {
      alert("Mohon isi Tujuan Penerima dan Perihal Draft!")
      return
    }
    onSubmit({
      ...formData,
      fileName: formData.fileName || `Draft_${formData.kategoriSurat.replace(/\s+/g, "_")}.docx`,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`relative w-full max-w-2xl rounded-2xl shadow-2xl border overflow-hidden ${isDark ? "bg-[#0d1322] border-[#1e293b] text-white" : "bg-white border-slate-200 text-slate-900"
          }`}
      >
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between ${isDark ? "border-[#1e293b] bg-[#131d30]" : "border-slate-200 bg-slate-50"}`}>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-red-500/10 text-red-500">
              <FileEdit className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Buat Draft Surat Keluar & Nota Dinas</h3>
              <p className={`text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                Langkah 1: Pembuatan konsep draft oleh staf/konseptor sebelum verifikasi pejabat
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isDark ? "hover:bg-slate-800 text-gray-400 hover:text-white" : "hover:bg-slate-200 text-slate-500"
              }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Quick Template Picker */}
          <div className={`p-3 rounded-xl border ${isDark ? "bg-[#131d30]/60 border-[#1e293b]" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs font-semibold">Gunakan Template Cepat:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleTemplateSelect("edaran")}
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500/20 cursor-pointer transition-colors"
              >
                Template Surat Edaran
              </button>
              <button
                type="button"
                onClick={() => handleTemplateSelect("undangan")}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer ${isDark
                    ? "bg-slate-800 text-gray-300 border-slate-700 hover:bg-slate-700"
                    : "bg-slate-200 text-slate-700 border-slate-300 hover:bg-slate-300"
                  }`}
              >
                Template Undangan Rapat
              </button>
              <button
                type="button"
                onClick={() => handleTemplateSelect("nota")}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer ${isDark
                    ? "bg-slate-800 text-gray-300 border-slate-700 hover:bg-slate-700"
                    : "bg-slate-200 text-slate-700 border-slate-300 hover:bg-slate-300"
                  }`}
              >
                Template Nota Dinas Internal
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Kategori Surat */}
            <div>
              <label className="block text-xs font-semibold mb-1">Jenis Dokumen</label>
              <select
                value={formData.kategoriSurat}
                onChange={(e) => setFormData({ ...formData, kategoriSurat: e.target.value })}
                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none cursor-pointer ${isDark ? "bg-[#131d30] border-[#1e293b] focus:border-red-500" : "bg-slate-50 border-slate-200 focus:border-red-500"
                  }`}
              >
                <option value="Surat Biasa / Dinas">Surat Biasa / Dinas</option>
                <option value="Surat Edaran">Surat Edaran</option>
                <option value="Surat Undangan">Surat Undangan</option>
                <option value="Nota Dinas Internal">Nota Dinas Internal</option>
                <option value="Surat Tugas">Surat Tugas</option>
              </select>
            </div>

            {/* Tujuan Instansi / Penerima */}
            <div>
              <label className="block text-xs font-semibold mb-1">
                Tujuan / Penerima Surat <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: KPU Kabupaten Minahasa / Instansi Terkait"
                value={formData.penerima}
                onChange={(e) => setFormData({ ...formData, penerima: e.target.value, tujuan: e.target.value })}
                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${isDark ? "bg-[#131d30] border-[#1e293b] focus:border-red-500" : "bg-slate-50 border-slate-200 focus:border-red-500"
                  }`}
              />
            </div>
          </div>

          {/* Perihal */}
          <div>
            <label className="block text-xs font-semibold mb-1">
              Perihal Surat <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: Permohonan Klarifikasi Data Anggaran Triwulan III"
              value={formData.perihal}
              onChange={(e) => setFormData({ ...formData, perihal: e.target.value })}
              className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${isDark ? "bg-[#131d30] border-[#1e293b] focus:border-red-500" : "bg-slate-50 border-slate-200 focus:border-red-500"
                }`}
            />
          </div>

          {/* Isi Surat / Konsep Draft */}
          <div>
            <label className="block text-xs font-semibold mb-1">Draf / Substansi Ringkas Isi Surat</label>
            <textarea
              rows={4}
              placeholder="Tuliskan pokok-pokok narasi draft surat di sini..."
              value={formData.isiSurat}
              onChange={(e) => setFormData({ ...formData, isiSurat: e.target.value })}
              className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-sans ${isDark ? "bg-[#131d30] border-[#1e293b] focus:border-red-500" : "bg-slate-50 border-slate-200 focus:border-red-500"
                }`}
            />
          </div>

          {/* Upload Lampiran File PDF */}
          <div>
            <label className="block text-xs font-semibold mb-1 font-sans">Unggah Lampiran Digital (Jika Ada)</label>
            <div className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-colors ${isDark ? "border-[#1e293b] hover:border-red-500 bg-[#131d30]/50" : "border-slate-300 hover:border-red-500 bg-slate-50"}`}>
              <input type="file" accept=".pdf,.doc,.docx" onChange={handleFileChange} className="hidden" id="file-upload-keluar" />
              <label htmlFor="file-upload-keluar" className="cursor-pointer flex items-center justify-center gap-2">
                <span className="text-xs text-red-400 font-medium">
                  {formData.fileName ? `File Terpilih: ${formData.fileName}` : "Unggah Berkas PDF / DOCX"}
                </span>
              </label>
            </div>
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-700/30">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-xs rounded-xl font-semibold transition-colors cursor-pointer ${isDark ? "bg-slate-800 text-gray-300 hover:bg-slate-700" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                }`}
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn-kpu-red px-5 py-2.5 text-white text-xs rounded-xl font-bold flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Send className="w-4 h-4" />
              <span>Simpan & Ajukan Verifikasi</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
