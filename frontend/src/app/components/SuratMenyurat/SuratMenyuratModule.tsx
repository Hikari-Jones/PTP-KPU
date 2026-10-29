import { useState } from "react"
import {
  ArrowLeft,
  FileText,
  UserCheck,
  FileEdit,
  ShieldCheck,
  History,
  Printer,
  CheckCircle2,
} from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Badge } from "../ui/badge"
import type { SuratItem, DisposisiFormState, SuratMasukFormState, SuratKeluarFormState } from "./types"
import { INITIAL_SURAT_LIST } from "./mockData"

// Import modular components
import { SuratDashboard } from "./SuratDashboard"
import { InputSuratMasukModal } from "./InputSuratMasukModal"
import { BuatDraftSuratModal } from "./BuatDraftSuratModal"
import { DisposisiAlurPanel } from "./DisposisiAlurPanel"
import { VerifikasiDraftPanel } from "./VerifikasiDraftPanel"
import { TteDistribusiPanel } from "./TteDistribusiPanel"
import { AuditTrailLog } from "./AuditTrailLog"

export interface SuratMenyuratModuleProps {
  theme: "light" | "dark"
  subTab?: "ringkasan" | "masuk" | "keluar"
}

export function SuratMenyuratModule({ theme, subTab = "ringkasan" }: SuratMenyuratModuleProps) {
  const isDark = theme === "dark"

  // Master State
  const [suratList, setSuratList] = useState<SuratItem[]>(INITIAL_SURAT_LIST)
  const [selectedSurat, setSelectedSurat] = useState<SuratItem | null>(null)
  const [activeDetailTab, setActiveDetailTab] = useState<"detail" | "disposisi" | "verifikasi" | "tte" | "audit">("detail")

  // Modals state
  const [isInputMasukOpen, setIsInputMasukOpen] = useState(false)
  const [isBuatDraftOpen, setIsBuatDraftOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 4000)
  }

  // Handle Input Surat Masuk Submit
  const handleInputSuratMasuk = (form: SuratMasukFormState) => {
    const newSurat: SuratItem = {
      id: `SRT-2026-${Math.floor(100 + Math.random() * 900)}`,
      nomorSurat: form.nomorSurat,
      perihal: form.perihal,
      jenis: "masuk",
      pengirim: form.pengirim,
      penerima: form.penerima,
      tanggal: form.tanggal,
      prioritas: form.prioritas,
      status: "menunggu_disposisi",
      fileName: form.fileName,
      ringkasanIsi: form.ringkasanIsi,
      history: [
        {
          id: `h-${Date.now()}`,
          tanggal: new Date().toISOString().split("T")[0],
          waktu: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " WITA",
          aktor: "Staf Agenda Persuratan",
          jabatan: "Pengelola Persuratan",
          aksi: "Registrasi Surat Masuk",
          keterangan: `Input surat masuk nomor ${form.nomorSurat} dari ${form.pengirim}`,
        },
      ],
    }

    setSuratList([newSurat, ...suratList])
    showToast(`Surat Masuk No. ${form.nomorSurat} berhasil diregistrasi!`)
  }

  // Handle Buat Draft Surat Keluar Submit
  const handleBuatDraftSurat = (form: SuratKeluarFormState) => {
    const newDraft: SuratItem = {
      id: `SRT-2026-${Math.floor(100 + Math.random() * 900)}`,
      nomorSurat: "DRAFT-KONSEP-" + Math.floor(10 + Math.random() * 90),
      perihal: form.perihal,
      jenis: form.kategoriSurat.includes("Nota") ? "nota_dinas" : "keluar",
      pengirim: "Subbagian Konseptor PTP-KPU",
      penerima: form.penerima,
      tanggal: new Date().toISOString().split("T")[0],
      prioritas: "penting",
      status: "draft",
      fileName: form.fileName,
      ringkasanIsi: form.isiSurat,
      history: [
        {
          id: `h-${Date.now()}`,
          tanggal: new Date().toISOString().split("T")[0],
          waktu: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " WITA",
          aktor: "Staf Konseptor",
          jabatan: "Konseptor Surat",
          aksi: "Buat Draft Surat Keluar",
          keterangan: `Konsep draft diajukan untuk verifikasi pejabat. Catatan: ${form.catatanInternal || "Tanpa catatan"}`,
        },
      ],
    }

    setSuratList([newDraft, ...suratList])
    showToast(`Draft Surat "${form.perihal.substring(0, 30)}..." berhasil disimpan!`)
  }

  // Handle Disposisi Save
  const handleSaveDisposisi = (suratId: string, disposisiData: DisposisiFormState) => {
    setSuratList((prev) =>
      prev.map((s) => {
        if (s.id === suratId) {
          const updatedHistory = [
            ...s.history,
            {
              id: `h-${Date.now()}`,
              tanggal: new Date().toISOString().split("T")[0],
              waktu: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " WITA",
              aktor: "Drs. Meidy Tinangon, M.Si",
              jabatan: "Ketua KPU Provinsi",
              aksi: "Perekaman Disposisi",
              keterangan: `Disposisi diteruskan ke ${disposisiData.tujuanUnit} dengan instruksi: "${disposisiData.catatan}"`,
            },
          ]
          const updated: SuratItem = {
            ...s,
            status: "dalam_proses",
            disposisi: {
              ...disposisiData,
              tanggalDisposisi: new Date().toISOString().split("T")[0],
              disposisiOleh: "Drs. Meidy Tinangon, M.Si (Ketua KPU)",
            },
            history: updatedHistory,
          }
          if (selectedSurat?.id === suratId) setSelectedSurat(updated)
          return updated
        }
        return s
      })
    )
    showToast("Disposisi pimpinan berhasil direkam dan diteruskan!")
  }

  // Handle Update Status Disposisi
  const handleUpdateStatusDisposisi = (suratId: string, status: SuratItem["status"], keterangan: string) => {
    setSuratList((prev) =>
      prev.map((s) => {
        if (s.id === suratId) {
          const updatedHistory = [
            ...s.history,
            {
              id: `h-${Date.now()}`,
              tanggal: new Date().toISOString().split("T")[0],
              waktu: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " WITA",
              aktor: "Kasubag Unit Pelaksana",
              jabatan: "Kasubag Target Disposisi",
              aksi: "Proses Verifikasi / Tindak Lanjut",
              keterangan: keterangan,
            },
          ]
          const updated: SuratItem = {
            ...s,
            status: status,
            history: updatedHistory,
          }
          if (selectedSurat?.id === suratId) setSelectedSurat(updated)
          return updated
        }
        return s
      })
    )
    showToast(`Status surat diperbarui menjadi: ${status.replace("_", " ").toUpperCase()}`)
  }

  // Handle Approve Draft
  const handleApproveDraft = (suratId: string, nomorOtomatis: string) => {
    setSuratList((prev) =>
      prev.map((s) => {
        if (s.id === suratId) {
          const updatedHistory = [
            ...s.history,
            {
              id: `h-${Date.now()}`,
              tanggal: new Date().toISOString().split("T")[0],
              waktu: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " WITA",
              aktor: "Dr. Salman S., M.Si",
              jabatan: "Sekretaris KPU / Pejabat Penyetuju",
              aksi: "Verifikasi / Approval Draft",
              keterangan: `Draft disetujui. Nomor Registrasi Otomatis terbit: ${nomorOtomatis}. Lanjut ke alur Otorisasi TTE.`,
            },
          ]
          const updated: SuratItem = {
            ...s,
            nomorSurat: nomorOtomatis,
            status: "menunggu_tte",
            catatanRevisi: undefined,
            history: updatedHistory,
          }
          if (selectedSurat?.id === suratId) setSelectedSurat(updated)
          return updated
        }
        return s
      })
    )
    showToast(`Draft Disetujui! Nomor Otomatis ${nomorOtomatis} Diterbitkan.`)
  }

  // Handle Reject Draft (Revisi)
  const handleRejectRevisiDraft = (suratId: string, catatanRevisi: string) => {
    setSuratList((prev) =>
      prev.map((s) => {
        if (s.id === suratId) {
          const updatedHistory = [
            ...s.history,
            {
              id: `h-${Date.now()}`,
              tanggal: new Date().toISOString().split("T")[0],
              waktu: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " WITA",
              aktor: "Pejabat Penyetuju",
              jabatan: "Kabag / Sekretaris KPU",
              aksi: "Permintaan Revisi Draft",
              keterangan: `Draft dikembalikan ke konseptor. Catatan revisi: "${catatanRevisi}"`,
            },
          ]
          const updated: SuratItem = {
            ...s,
            status: "revisi",
            catatanRevisi: catatanRevisi,
            history: updatedHistory,
          }
          if (selectedSurat?.id === suratId) setSelectedSurat(updated)
          return updated
        }
        return s
      })
    )
    showToast("Catatan revisi dikirimkan kembali ke konseptor!")
  }

  // Handle Sign TTE
  const handleSignTte = (suratId: string, _passphrase: string, penandatangan: string) => {
    setSuratList((prev) =>
      prev.map((s) => {
        if (s.id === suratId) {
          const updatedHistory = [
            ...s.history,
            {
              id: `h-${Date.now()}`,
              tanggal: new Date().toISOString().split("T")[0],
              waktu: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " WITA",
              aktor: penandatangan,
              jabatan: "Ketua / Sekretaris KPU",
              aksi: "Otorisasi Tanda Tangan Digital (TTE)",
              keterangan: "Sertifikat BSrE BSSN valid & Hash barcode terbukti sah.",
            },
          ]
          const updated: SuratItem = {
            ...s,
            status: "disetujui",
            tteInfo: {
              penandatangan: penandatangan,
              jabatan: "Ketua KPU Provinsi Sulawesi Utara",
              tanggalTte: new Date().toLocaleString(),
              barcodeData: `KPU-SULUT-TTE-${Date.now()}`,
            },
            history: updatedHistory,
          }
          if (selectedSurat?.id === suratId) setSelectedSurat(updated)
          return updated
        }
        return s
      })
    )
    showToast("Tanda Tangan Digital (TTE) BSrE Berhasil Dibubuhkan!")
  }

  // Handle Distribusi Surat
  const handleDistribusiSurat = (suratId: string, metode: "email" | "cetak" | "internal") => {
    const resiCode = `DIST-${metode.toUpperCase()}-${Date.now().toString().slice(-6)}`
    setSuratList((prev) =>
      prev.map((s) => {
        if (s.id === suratId) {
          const updatedHistory = [
            ...s.history,
            {
              id: `h-${Date.now()}`,
              tanggal: new Date().toISOString().split("T")[0],
              waktu: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " WITA",
              aktor: "System Auto Gateway",
              jabatan: "Modul Distribusi PTP",
              aksi: "Pengiriman & Terarsip",
              keterangan: `Pengiriman via kanal ${metode.toUpperCase()} sukses. Bukti resi: ${resiCode}. Status akhir Terkirim & Terarsip.`,
            },
          ]
          const updated: SuratItem = {
            ...s,
            status: "terkirim_terarsip",
            pengiriman: {
              metode: metode,
              tanggalKirim: new Date().toLocaleString(),
              nomorResiAtauBukti: resiCode,
            },
            history: updatedHistory,
          }
          if (selectedSurat?.id === suratId) setSelectedSurat(updated)
          return updated
        }
        return s
      })
    )
    showToast(`Pengiriman Berhasil via ${metode.toUpperCase()}! Berkas Otomatis Terarsip.`)
  }

  return (
    <div className="space-y-6">
      {/* Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-emerald-600 text-white shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom duration-300">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <p className="text-xs font-bold">{toastMessage}</p>
        </div>
      )}

      {/* Main Container View Switch */}
      {!selectedSurat ? (
        /* Dashboard Component */
        <SuratDashboard
          theme={theme}
          suratList={suratList}
          initialTab={subTab === "masuk" ? "masuk" : subTab === "keluar" ? "keluar" : "semua"}
          onOpenInputSuratMasuk={() => setIsInputMasukOpen(true)}
          onOpenBuatDraft={() => setIsBuatDraftOpen(true)}
          onSelectSurat={(surat) => {
            setSelectedSurat(surat)
            if (surat.jenis === "masuk") setActiveDetailTab("disposisi")
            else if (surat.status === "draft" || surat.status === "revisi") setActiveDetailTab("verifikasi")
            else if (surat.status === "menunggu_tte") setActiveDetailTab("tte")
            else setActiveDetailTab("detail")
          }}
        />
      ) : (
        /* Detailed Workflow view for selected Surat */
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Top Bar with Back Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedSurat(null)}
                className={`p-2 rounded-xl border transition-colors cursor-pointer ${isDark ? "bg-[#0d1322] border-[#1e293b] text-gray-300 hover:bg-[#131d30]" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-red-500">{selectedSurat.nomorSurat}</span>
                  <Badge variant={selectedSurat.jenis === "masuk" ? "info" : "success"}>
                    {selectedSurat.jenis.toUpperCase()}
                  </Badge>
                </div>
                <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{selectedSurat.perihal}</h2>
              </div>
            </div>

            {/* Print / Export Quick Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${isDark ? "bg-[#0d1322] border-[#1e293b] text-gray-300 hover:bg-[#131d30]" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Lembar Disposisi</span>
              </button>
            </div>
          </div>

          {/* Navigation Tabs for Details */}
          <div className={`flex items-center gap-2 p-1.5 rounded-2xl border ${isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200"}`}>
            {[
              { id: "detail", label: "Substansi & Ringkasan", icon: FileText },
              { id: "disposisi", label: "2. Disposisi & Tindak Lanjut", icon: UserCheck, show: selectedSurat.jenis === "masuk" },
              { id: "verifikasi", label: "3. Verifikasi Draft Surat", icon: FileEdit, show: selectedSurat.jenis !== "masuk" },
              { id: "tte", label: "4. TTE Digital & Distribusi", icon: ShieldCheck, show: selectedSurat.jenis !== "masuk" },
              { id: "audit", label: "5. Log Audit Trail", icon: History },
            ]
              .filter((tab) => tab.show !== false)
              .map((tab) => {
                const Icon = tab.icon
                const isActive = activeDetailTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveDetailTab(tab.id as any)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${isActive
                        ? "bg-red-600 text-white shadow-md"
                        : isDark
                          ? "text-gray-400 hover:bg-[#131d30] hover:text-white"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                )
              })}
          </div>

          {/* Tab Content Display */}
          {activeDetailTab === "detail" && (
            <Card className={isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}>
              <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className={`p-4 rounded-xl border ${isDark ? "bg-[#131d30]/50 border-[#1e293b]" : "bg-slate-50 border-slate-200"}`}>
                    <p className="text-[10px] text-gray-400 font-mono">PENGIRIM</p>
                    <p className="font-bold text-xs mt-1">{selectedSurat.pengirim}</p>
                  </div>
                  <div className={`p-4 rounded-xl border ${isDark ? "bg-[#131d30]/50 border-[#1e293b]" : "bg-slate-50 border-slate-200"}`}>
                    <p className="text-[10px] text-gray-400 font-mono">PENERIMA</p>
                    <p className="font-bold text-xs mt-1">{selectedSurat.penerima}</p>
                  </div>
                  <div className={`p-4 rounded-xl border ${isDark ? "bg-[#131d30]/50 border-[#1e293b]" : "bg-slate-50 border-slate-200"}`}>
                    <p className="text-[10px] text-gray-400 font-mono">TANGGAL BERKAS</p>
                    <p className="font-bold text-xs mt-1">{selectedSurat.tanggal}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-mono text-gray-400 uppercase mb-2">RINGKASAN URAIAN ISI SURAT</h4>
                  <p className={`p-4 rounded-xl border leading-relaxed text-xs ${isDark ? "bg-[#131d30] border-[#1e293b]" : "bg-slate-50 border-slate-200"}`}>
                    {selectedSurat.ringkasanIsi || "Belum ada catatan deskripsi tambaha."}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {activeDetailTab === "disposisi" && (
            <DisposisiAlurPanel
              theme={theme}
              surat={selectedSurat}
              onSaveDisposisi={handleSaveDisposisi}
              onUpdateStatus={handleUpdateStatusDisposisi}
            />
          )}

          {activeDetailTab === "verifikasi" && (
            <VerifikasiDraftPanel
              theme={theme}
              surat={selectedSurat}
              onApproveDraft={handleApproveDraft}
              onRejectRevisiDraft={handleRejectRevisiDraft}
            />
          )}

          {activeDetailTab === "tte" && (
            <TteDistribusiPanel
              theme={theme}
              surat={selectedSurat}
              onSignTte={handleSignTte}
              onDistribusi={handleDistribusiSurat}
            />
          )}

          {activeDetailTab === "audit" && <AuditTrailLog theme={theme} surat={selectedSurat} />}
        </div>
      )}

      {/* Modals */}
      <InputSuratMasukModal
        theme={theme}
        isOpen={isInputMasukOpen}
        onClose={() => setIsInputMasukOpen(false)}
        onSubmit={handleInputSuratMasuk}
      />

      <BuatDraftSuratModal
        theme={theme}
        isOpen={isBuatDraftOpen}
        onClose={() => setIsBuatDraftOpen(false)}
        onSubmit={handleBuatDraftSurat}
      />
    </div>
  )
}
