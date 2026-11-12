import { useState, useEffect } from "react"
import {
  ArrowLeft,
  FileText,
  UserCheck,
  FileEdit,
  ShieldCheck,
  History,
  Printer,
  CheckCircle2,
  Calendar,
  Send,
  Building,
  Info,
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
import { SuratDokumenViewer } from "./SuratDokumenViewer"
import { useAuth } from "../../context/AuthContext"
import { ReadOnlyBanner } from "../ui/read-only"

export interface SuratMenyuratModuleProps {
  theme: "light" | "dark"
  subTab?: "ringkasan" | "masuk" | "keluar"
}

export function SuratMenyuratModule({ theme, subTab = "ringkasan" }: SuratMenyuratModuleProps) {
  const isDark = theme === "dark"
  const { canEdit } = useAuth()
  const readOnly = !canEdit("surat")

  // Master State
  const [suratList, setSuratList] = useState<SuratItem[]>(INITIAL_SURAT_LIST)
  const [selectedSurat, setSelectedSurat] = useState<SuratItem | null>(null)
  const [activeDetailTab, setActiveDetailTab] = useState<"detail" | "disposisi" | "verifikasi" | "tte" | "audit">("detail")

  // Modals state
  const [isInputMasukOpen, setIsInputMasukOpen] = useState(false)
  const [isBuatDraftOpen, setIsBuatDraftOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [isChatbotOpen, setIsChatbotOpen] = useState(false)

  // Listen for chatbot widget state changes
  useEffect(() => {
    const handleChatToggle = (e: Event) => {
      const customEvent = e as CustomEvent<{ isOpen: boolean }>
      if (customEvent.detail !== undefined) {
        setIsChatbotOpen(customEvent.detail.isOpen)
      }
    }

    window.addEventListener("kirana-chatbot-toggle", handleChatToggle)
    return () => window.removeEventListener("kirana-chatbot-toggle", handleChatToggle)
  }, [])

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
      fileUrl: form.fileUrl,
      fileSize: form.fileSize,
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
      fileUrl: form.fileUrl,
      fileSize: form.fileSize,
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
      {/* Notification Toast - diposisikan di sebelah kiri chatbot dan menyesuaikan saat chatbot terbuka */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 z-50 p-4 px-5 rounded-2xl bg-red-600 text-white shadow-2xl flex items-center gap-3 transition-all duration-300 animate-in slide-in-from-bottom border border-white/20 max-w-sm sm:max-w-md ${
            isChatbotOpen ? "right-24 md:right-[420px]" : "right-24 sm:right-28"
          }`}
        >
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4 text-white" />
          </div>
          <p className="text-xs font-bold leading-snug">{toastMessage}</p>
        </div>
      )}

      {readOnly && <ReadOnlyBanner theme={theme} modul="surat menyurat" pengelola="Sub Bagian Umum dan Logistik (UMLOG)" />}

      {/* Main Container View Switch */}
      {!selectedSurat ? (
        /* Dashboard Component */
        <SuratDashboard
          theme={theme}
          suratList={suratList}
          readOnly={readOnly}
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
              { id: "disposisi", label: "Disposisi & Tindak Lanjut", icon: UserCheck, show: selectedSurat.jenis === "masuk" },
              { id: "verifikasi", label: "Verifikasi Draft Surat", icon: FileEdit, show: selectedSurat.jenis !== "masuk" },
              { id: "tte", label: "TTE Digital & Distribusi", icon: ShieldCheck, show: selectedSurat.jenis !== "masuk" },
              { id: "audit", label: "Log Audit Trail", icon: History },
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
            <Card
              className={`relative overflow-hidden transition-all ${
                isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"
              } backdrop-blur-md shadow-lg rounded-2xl`}
            >
              <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600"></div>
              <div className="p-5 pb-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-xs">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`text-sm font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>
                      Informasi Berkas & Ringkasan Dokumen
                    </h3>
                    <p className={`text-[11px] font-medium m-0 ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                      Detail metadata registrasi dan uraian substansi naskah dinas
                    </p>
                  </div>
                </div>
                <Badge variant={selectedSurat.jenis === "masuk" ? "info" : "terkirim"}>
                  {selectedSurat.jenis === "masuk" ? "Surat Masuk" : "Surat Keluar"}
                </Badge>
              </div>

              <CardContent className="p-6 space-y-6">
                <SuratDokumenViewer theme={theme} surat={selectedSurat} />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Card Pengirim */}
                  <div
                    className={`p-4 rounded-xl border relative overflow-hidden transition-all flex items-start gap-3.5 ${
                      isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-red-600/15 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                      <Send className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-red-600 dark:text-red-400 font-extrabold uppercase tracking-wider mb-0.5">
                        PENGIRIM
                      </p>
                      <p className={`font-bold text-xs truncate ${isDark ? "text-white" : "text-slate-900"}`}>
                        {selectedSurat.pengirim}
                      </p>
                      <p className={`text-[10px] mt-0.5 ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                        Asal Naskah / Instansi
                      </p>
                    </div>
                  </div>

                  {/* Card Penerima */}
                  <div
                    className={`p-4 rounded-xl border relative overflow-hidden transition-all flex items-start gap-3.5 ${
                      isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-red-600/15 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                      <Building className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-red-600 dark:text-red-400 font-extrabold uppercase tracking-wider mb-0.5">
                        PENERIMA / TUJUAN
                      </p>
                      <p className={`font-bold text-xs truncate ${isDark ? "text-white" : "text-slate-900"}`}>
                        {selectedSurat.penerima}
                      </p>
                      <p className={`text-[10px] mt-0.5 ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                        Tujuan Distribusi
                      </p>
                    </div>
                  </div>

                  {/* Card Tanggal Berkas */}
                  <div
                    className={`p-4 rounded-xl border relative overflow-hidden transition-all flex items-start gap-3.5 ${
                      isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-red-600/15 border border-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-red-600 dark:text-red-400 font-extrabold uppercase tracking-wider mb-0.5">
                        TANGGAL BERKAS
                      </p>
                      <p className={`font-bold text-xs ${isDark ? "text-white" : "text-slate-900"}`}>
                        {selectedSurat.tanggal}
                      </p>
                      <p className={`text-[10px] mt-0.5 ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                        Tanggal Registrasi Agenda
                      </p>
                    </div>
                  </div>
                </div>

                {/* Ringkasan Uraian Isi Surat */}
                <div
                  className={`p-5 rounded-2xl border ${
                    isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <h4 className="text-xs font-extrabold text-red-600 dark:text-red-400 uppercase tracking-wider m-0">
                      Ringkasan Uraian Isi Surat
                    </h4>
                  </div>
                  <div
                    className={`p-4 rounded-xl border leading-relaxed text-xs shadow-inner ${
                      isDark ? "bg-[#0c1220] border-[#1e293b] text-gray-200" : "bg-white border-slate-200 text-slate-800"
                    }`}
                  >
                    {selectedSurat.ringkasanIsi || "Belum ada catatan deskripsi tambahan untuk naskah ini."}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeDetailTab === "disposisi" && (
            <DisposisiAlurPanel
              theme={theme}
              surat={selectedSurat}
              readOnly={readOnly}
              onSaveDisposisi={handleSaveDisposisi}
              onUpdateStatus={handleUpdateStatusDisposisi}
            />
          )}

          {activeDetailTab === "verifikasi" && (
            <VerifikasiDraftPanel
              theme={theme}
              surat={selectedSurat}
              readOnly={readOnly}
              onApproveDraft={handleApproveDraft}
              onRejectRevisiDraft={handleRejectRevisiDraft}
            />
          )}

          {activeDetailTab === "tte" && (
            <TteDistribusiPanel
              theme={theme}
              surat={selectedSurat}
              readOnly={readOnly}
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
