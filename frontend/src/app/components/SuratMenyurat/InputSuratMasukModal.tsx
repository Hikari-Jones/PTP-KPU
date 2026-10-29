import React, { useState } from "react"
import { X, Upload, FileText, ArrowRight } from "lucide-react"
import type { SuratMasukFormState } from "./types"

interface InputSuratMasukModalProps {
  theme: "light" | "dark"
  isOpen: boolean
  onClose: () => void
  onSubmit: (formData: SuratMasukFormState) => void
}

export function InputSuratMasukModal({ theme, isOpen, onClose, onSubmit }: InputSuratMasukModalProps) {
  if (!isOpen) return null
  const isDark = theme === "dark"

  const [formData, setFormData] = useState<SuratMasukFormState>({
    pengirim: "",
    penerima: "Ketua KPU Provinsi Sulawesi Utara",
    nomorSurat: "",
    perihal: "",
    tanggal: new Date().toISOString().split("T")[0],
    prioritas: "biasa",
    ringkasanIsi: "",
    fileName: "",
  })

  const [simulatedFile, setSimulatedFile] = useState<File | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.nomorSurat || !formData.perihal || !formData.pengirim) {
      alert("Mohon lengkapi Nomor Surat, Pengirim, dan Perihal!")
      return
    }
    onSubmit({
      ...formData,
      fileName: simulatedFile ? simulatedFile.name : formData.fileName || "Dokumen_Surat_Masuk.pdf",
    })
    onClose()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSimulatedFile(e.target.files[0])
      setFormData((prev) => ({ ...prev, fileName: e.target.files![0].name }))
    }
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
            <div className="p-2 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Registrasi / Input Surat Masuk</h3>
              <p className={`text-xs ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                Langkah 1: Pendataan dokumen fisik / digital ke agenda persuratan KPU
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

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nomor Surat */}
            <div>
              <label className="block text-xs font-semibold mb-1">
                Nomor Surat Masuk <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: 120/KPU-RI/VIII/2026"
                value={formData.nomorSurat}
                onChange={(e) => setFormData({ ...formData, nomorSurat: e.target.value })}
                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-mono ${isDark ? "bg-[#131d30] border-[#1e293b] focus:border-red-500" : "bg-slate-50 border-slate-200 focus:border-red-500"
                  }`}
              />
            </div>

            {/* Tanggal Surat */}
            <div>
              <label className="block text-xs font-semibold mb-1">
                Tanggal Surat <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={formData.tanggal}
                onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${isDark ? "bg-[#131d30] border-[#1e293b] focus:border-red-500" : "bg-slate-50 border-slate-200 focus:border-red-500"
                  }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pengirim */}
            <div>
              <label className="block text-xs font-semibold mb-1">
                Instansi / Pengirim <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: Bawaslu Sulut / Pemprov Sulut"
                value={formData.pengirim}
                onChange={(e) => setFormData({ ...formData, pengirim: e.target.value })}
                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${isDark ? "bg-[#131d30] border-[#1e293b] focus:border-red-500" : "bg-slate-50 border-slate-200 focus:border-red-500"
                  }`}
              />
            </div>

            {/* Penerima Tujuan */}
            <div>
              <label className="block text-xs font-semibold mb-1">Ditujukan Kepada</label>
              <select
                value={formData.penerima}
                onChange={(e) => setFormData({ ...formData, penerima: e.target.value })}
                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none cursor-pointer ${isDark ? "bg-[#131d30] border-[#1e293b] focus:border-red-500" : "bg-slate-50 border-slate-200 focus:border-red-500"
                  }`}
              >
                <option value="Ketua KPU Provinsi Sulawesi Utara">Ketua KPU Provinsi Sulawesi Utara</option>
                <option value="Sekretaris KPU Provinsi Sulawesi Utara">Sekretaris KPU Provinsi Sulawesi Utara</option>
                <option value="UMLOG (Umum dan Logistik)">UMLOG (Umum dan Logistik)</option>
                <option value="Teknis Penyelenggaraan Pemilu">Teknis Penyelenggaraan Pemilu</option>
              </select>
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
              placeholder="Contoh: Permohonan Data Logistik Pilkada 2026"
              value={formData.perihal}
              onChange={(e) => setFormData({ ...formData, perihal: e.target.value })}
              className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${isDark ? "bg-[#131d30] border-[#1e293b] focus:border-red-500" : "bg-slate-50 border-slate-200 focus:border-red-500"
                }`}
            />
          </div>

          {/* Prioritas Surat */}
          <div>
            <label className="block text-xs font-semibold mb-1">Kategori / Prioritas Surat</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: "biasa", label: "Biasa" },
                { id: "penting", label: "Penting" },
                { id: "sangat_penting", label: "Sangat Penting" },
                { id: "rahasia", label: "Rahasia" },
              ].map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setFormData({ ...formData, prioritas: p.id as any })}
                  className={`py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${formData.prioritas === p.id
                      ? "bg-red-600 text-white border-red-600 shadow-sm"
                      : isDark
                        ? "bg-[#131d30] border-[#1e293b] text-gray-400 hover:text-white"
                        : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                    }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ringkasan Isi */}
          <div>
            <label className="block text-xs font-semibold mb-1">Ringkasan / Catatan Berkas</label>
            <textarea
              rows={3}
              placeholder="Catatan singkat perihal pokok isi surat..."
              value={formData.ringkasanIsi}
              onChange={(e) => setFormData({ ...formData, ringkasanIsi: e.target.value })}
              className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${isDark ? "bg-[#131d30] border-[#1e293b] focus:border-red-500" : "bg-slate-50 border-slate-200 focus:border-red-500"
                }`}
            />
          </div>

          {/* Upload Lampiran File PDF */}
          <div>
            <label className="block text-xs font-semibold mb-1">Unggah Lampiran Digital (PDF)</label>
            <div
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${isDark ? "border-[#1e293b] hover:border-red-500 bg-[#131d30]/50" : "border-slate-300 hover:border-red-500 bg-slate-50"
                }`}
            >
              <input type="file" accept=".pdf,.doc,.docx" onChange={handleFileChange} className="hidden" id="file-upload-masuk" />
              <label htmlFor="file-upload-masuk" className="cursor-pointer flex flex-col items-center justify-center gap-1">
                <Upload className="w-6 h-6 text-red-500 dark:text-red-400" />
                <p className="text-xs font-medium">
                  {simulatedFile ? (
                    <span className="text-emerald-500 font-bold">File Terpilih: {simulatedFile.name}</span>
                  ) : (
                    "Klik atau seret file PDF surat masuk di sini"
                  )}
                </p>
                <p className="text-[10px] text-gray-400">Format PDF, DOCX maks 10MB</p>
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
              <span>Simpan & Masukkan Ke Agenda</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
