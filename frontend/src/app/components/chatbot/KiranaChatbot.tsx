import { useState, useRef, useEffect, useMemo } from "react"
import { useAuth } from "../../context/AuthContext"
import {
  MessageSquare,
  Send,
  Bot,
  User,
  Minimize2,
  Download,
  FileText,
  Loader2,
  Sparkles,
  History,
  Trash2,
  Plus,
  ArrowLeft,
  Clock,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Maximize2,
  MessageCircle,
} from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "../ui/card"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { ScrollArea } from "../ui/scroll-area"
import { Avatar, AvatarFallback } from "../ui/avatar"

export interface GeneratedFile {
  name: string
  content: string
  mimeType: string
  sizeStr: string
}

export interface ChatMessage {
  id: string
  sender: "user" | "bot"
  text: string
  timestamp: string
  fileAttachment?: GeneratedFile
}

export interface ChatSession {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

const STORAGE_SESSIONS_KEY = "ptp_kpu_kirana_sessions"
const STORAGE_CURRENT_SESSION_ID = "ptp_kpu_kirana_active_session_id"

const createDefaultSession = (): ChatSession => {
  const now = new Date()
  const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}`
  const dateStr = now.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })

  return {
    id: "session-" + Date.now(),
    title: "Percakapan Baru",
    createdAt: `${dateStr} ${timeStr}`,
    updatedAt: `${dateStr} ${timeStr}`,
    messages: [
      {
        id: "welcome-1",
        sender: "bot",
        text: "Halo! Saya KIRANA Agent, Asisten AI Sistem Informasi KPU Sulut. Silakan ajukan pertanyaan atau klik salah satu Chip Cepat di bawah ini untuk membuat dokumen & laporan otomatis.",
        timestamp: timeStr,
      },
    ],
  }
}

export function KiranaChatbot({ theme = "light" }: { theme?: "light" | "dark" }) {
  const { currentUser } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [inputMessage, setInputMessage] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)

  // Account-specific storage keys based on currentUser NIP/email
  const userIdentifier = currentUser?.nip || currentUser?.email || "guest"
  const storageSessionsKey = `${STORAGE_SESSIONS_KEY}_${userIdentifier}`
  const storageCurrentSessionKey = `${STORAGE_CURRENT_SESSION_ID}_${userIdentifier}`

  // Load chat sessions from localStorage for the current user
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(storageSessionsKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch (e) {
      console.warn("Failed to load saved Kirana chat sessions", e)
    }
    return [createDefaultSession()]
  })

  // Active session ID for the current user
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    try {
      const savedId = localStorage.getItem(storageCurrentSessionKey)
      if (savedId) return savedId
    } catch (e) {
      console.warn("Failed to load active session ID", e)
    }
    return sessions[0]?.id || ""
  })

  // Whenever the logged-in user changes, reload their distinct chat sessions
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageSessionsKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed)
          const savedActiveId = localStorage.getItem(storageCurrentSessionKey)
          if (savedActiveId && parsed.some((s: ChatSession) => s.id === savedActiveId)) {
            setActiveSessionId(savedActiveId)
          } else {
            setActiveSessionId(parsed[0].id)
          }
          return
        }
      }
    } catch (e) {
      console.warn("Failed to switch user chat sessions", e)
    }

    // Default if user has no saved sessions
    const defaultSess = createDefaultSession()
    setSessions([defaultSess])
    setActiveSessionId(defaultSess.id)
  }, [userIdentifier, storageSessionsKey, storageCurrentSessionKey])

  // Ensure active session exists
  useEffect(() => {
    if (!sessions.some((s) => s.id === activeSessionId)) {
      if (sessions.length > 0) {
        setActiveSessionId(sessions[0].id)
      } else {
        const newSess = createDefaultSession()
        setSessions([newSess])
        setActiveSessionId(newSess.id)
      }
    }
  }, [sessions, activeSessionId])

  // Save sessions to localStorage under the user-specific key
  useEffect(() => {
    try {
      localStorage.setItem(storageSessionsKey, JSON.stringify(sessions))
    } catch (e) {
      console.warn("Failed to save Kirana sessions", e)
    }
  }, [sessions, storageSessionsKey])

  // Save active session ID under the user-specific key
  useEffect(() => {
    try {
      if (activeSessionId) {
        localStorage.setItem(storageCurrentSessionKey, activeSessionId)
      }
    } catch (e) {
      console.warn("Failed to save active session ID", e)
    }
  }, [activeSessionId, storageCurrentSessionKey])

  // Filtered recorded history sessions: only those with at least 1 user prompt
  const recordedSessions = useMemo(() => {
    return sessions.filter((s) => s.messages.some((m) => m.sender === "user"))
  }, [sessions])

  // Current active session
  const currentSession = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId) || sessions[0] || createDefaultSession()
  }, [sessions, activeSessionId])

  // Dispatch custom event for toasts
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("kirana-chatbot-toggle", { detail: { isOpen } }))
  }, [isOpen])

  const scrollRef = useRef<HTMLDivElement>(null)
  const isDark = theme === "dark"

  const quickChips = [
    "Surat Dinas",
    "Nota Dinas",
    "Lap. Anggaran",
    "Rekap Surat",
    "Jadwal",
    "Arsip Dokumen",
  ]

  useEffect(() => {
    if (!showHistory && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [currentSession.messages, isOpen, isProcessing, showHistory])

  // Pattern matching logic for agent processing
  const processAgent = (query: string): { reply: string; fileAttachment?: GeneratedFile } => {
    const lower = query.toLowerCase()

    if (lower.includes("surat dinas") || lower.includes("surat_dinas")) {
      const fileContent = `KPU PROVINSI SULAWESI UTARA
Jl. Diponegoro No. 12, Manado
--------------------------------------------------
SURAT DINAS
Nomor : 045/SD/KPU-SULUT/VIII/2026
Lamp. : 1 Berkas
Hal   : Koordinasi Logistik Pilkada Sulut 2026

Kepada Yth.
Ketua KPU Kabupaten/Kota se-Sulawesi Utara

Dengan hormat,
Sehubungan dengan pelaksanaan tahapan Pilkada 2026, bersama ini disampaikan jadwal verifikasi dan distribusi logistik ke daerah masing-masing.

Dimohon seluruh Ketua KPU Kab/Kota menugaskan UMLOG (Umum dan Logistik) untuk hadir pada:
Hari/Tanggal : Senin, 10 Agustus 2026
Waktu        : 09.00 WITA - Selesai
Tempat       : Aula KPU Provinsi Sulut

Demikian surat dinas ini disampaikan untuk dilaksanakan sebagaimana mestinya.

Manado, 6 Agustus 2026
Ketua KPU Provinsi Sulawesi Utara

[DRAFT GENERATED BY KIRANA AGENT]`

      return {
        reply: "Tentu! KIRANA telah menyusun draf Surat Dinas Koordinasi Logistik Pilkada 2026. Anda dapat mengunduh berkas lengkapnya di bawah ini.",
        fileAttachment: {
          name: "Surat_Dinas_KPU_Sulut_045.txt",
          content: fileContent,
          mimeType: "text/plain",
          sizeStr: "1.2 KB",
        },
      }
    }

    if (lower.includes("nota dinas") || lower.includes("nota_dinas")) {
      const fileContent = `KPU PROVINSI SULAWESI UTARA
==================================================
NOTA DINAS
Nomor: ND-102/KPU-SULUT/SUBBAG-TEKNIS/2026

Kepada Yth : Sekretaris KPU Provinsi Sulawesi Utara
Dari       : Kasubbag Teknis Penyelenggaraan
Tanggal    : 6 Agustus 2026
Sifat      : Penting
Perihal    : Pengajuan Kebutuhan Alat Tulis & Sistem Informasi Rapat Pleno

Sehubungan dengan persiapan Rapat Pleno Terbuka Rekapitulasi Pemilih, dengan ini diajukan dukungan sarana penunjang operasional berupa unit pengolahan data dan ruang server backup.

Demikian Nota Dinas ini kami sampaikan. Mohon petunjuk lebih lanjut.`

      return {
        reply: "Berikut draf Nota Dinas Pengajuan Sarana Rapat Pleno yang dibuat oleh KIRANA Agent. Silakan unduh dokumen untuk keperluan internal.",
        fileAttachment: {
          name: "Nota_Dinas_Subbag_Teknis.txt",
          content: fileContent,
          mimeType: "text/plain",
          sizeStr: "0.8 KB",
        },
      }
    }

    if (lower.includes("lap. anggaran") || lower.includes("laporan anggaran") || lower.includes("anggaran")) {
      const csvContent = `Kode_PA,Program_Anggaran,Pagu_PTP,Realisasi_Bulan_Ini,Sisa_Anggaran,Persentase
001,Honorarium Panitia Pemilihan,750000000,520000000,230000000,69.3%
002,Pengadaan Logistik & Kotak Suara,1200000000,980000000,220000000,81.6%
003,Sosialisasi & Edukasi Pemilih,450000000,310000000,140000000,68.8%
004,Sistem Informasi & Infrastruktur PTP,300000000,245000000,55000000,81.6%
TOTAL,,2700000000,2055000000,645000000,76.1%`

      return {
        reply: "Berikut Ringkasan Laporan Rekapitulasi Realisasi Anggaran PTP-KPU Sulut Tahun 2026. Berkas format CSV siap diunduh.",
        fileAttachment: {
          name: "Laporan_Realisasi_Anggaran_KPU_2026.csv",
          content: csvContent,
          mimeType: "text/csv",
          sizeStr: "2.4 KB",
        },
      }
    }

    if (lower.includes("rekap surat") || lower.includes("rekap_surat")) {
      const csvContent = `No_Surat,Tanggal,Pengirim,Perihal,Status,Kategori
001/KPU-SU/VI/2026,20 Jun 2026,Ketua KPU Provinsi,Undangan Rapat Pleno DPT,terkirim,Surat Keluar
002/KPU-SU/VI/2026,19 Jun 2026,KPU Kab. Minahasa,Laporan DPT Minahasa 2026,diterima,Surat Masuk
003/KPU-SU/VI/2026,18 Jun 2026,Bawaslu Sulut,Klarifikasi Data Pemilih,diproses,Surat Masuk
004/KPU-SU/VI/2026,17 Jun 2026,Subbagian Logistik,Nota Dinas Pengadaan Logistik,draft,Internal`

      return {
        reply: "KIRANA telah merekapitulasi seluruh daftar Surat Masuk & Keluar terbaru dalam file CSV berikut.",
        fileAttachment: {
          name: "Rekapitulasi_Surat_Menyurat_2026.csv",
          content: csvContent,
          mimeType: "text/csv",
          sizeStr: "1.8 KB",
        },
      }
    }

    if (lower.includes("jadwal") || lower.includes("agenda")) {
      const fileContent = `JADWAL TAHAPAN & AGENDA KPU PROVINSI SULUT (AGUSTUS 2026)
============================================================
1. 08 Agustus 2026 - Rapat Koordinasi Teknis Penyelenggaraan Pilkada (Aula KPU)
2. 12 Agustus 2026 - Batas Akhir Penyerahan Perbaikan Berkas DPT Kab/Kota
3. 15 Agustus 2026 - Pleno Terbuka Penetapan DPT Tingkat Provinsi
4. 20 Agustus 2026 - Simulasi Pemungutan & Penghitungan Suara Digital PTP
5. 25 Agustus 2026 - Bimbingan Teknis Petugas KPPS & PPK`

      return {
        reply: "Berikut jadwal lengkap tahapan agenda kegiatan KPU Sulawesi Utara untuk bulan Agustus 2026.",
        fileAttachment: {
          name: "Jadwal_Agenda_KPU_Sulut_Agustus_2026.txt",
          content: fileContent,
          mimeType: "text/plain",
          sizeStr: "0.9 KB",
        },
      }
    }

    if (lower.includes("arsip") || lower.includes("dokumen")) {
      const fileContent = `DAFTAR ARSIP DOKUMEN SISTEM INFORMASI KPU SULUT
------------------------------------------------
1. ARSIP-2026-001: SK Penetapan Tahapan Pilkada Sulut
2. ARSIP-2026-002: Berita Acara Rapat Pleno DPT Minahasa & Sangihe
3. ARSIP-2026-003: Draf MOU Kerjasama Media Massa & Sosialisasi
4. ARSIP-2026-004: Laporan Audit Keuangan Operasional Tahunan`

      return {
        reply: "Daftar berkas Arsip Dokumen KPU Sulut telah dikompilasi oleh KIRANA Agent.",
        fileAttachment: {
          name: "Daftar_Arsip_KPU_2026.txt",
          content: fileContent,
          mimeType: "text/plain",
          sizeStr: "0.7 KB",
        },
      }
    }

    // Default unrecognized reply
    return {
      reply: "Maaf, perintah belum dikenali oleh KIRANA Agent. Silakan pilih salah satu Chip Cepat di atas seperti [Surat Dinas], [Nota Dinas], [Lap. Anggaran], [Rekap Surat], atau [Jadwal] agar KIRANA dapat langsung memprosesnya.",
    }
  }

  const handleSendMessageText = (userText: string) => {
    if (!userText.trim() || isProcessing) return

    // Ensure history drawer is closed when messaging
    setShowHistory(false)

    const now = new Date()
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now
      .getMinutes()
      .toString()
      .padStart(2, "0")}`
    const dateStr = now.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: userText,
      timestamp: timeStr,
    }

    // Determine topic title from the first prompt of session
    const isFirstUserMessage = currentSession.messages.filter((m) => m.sender === "user").length === 0
    const newTitle = isFirstUserMessage
      ? userText.trim().slice(0, 32) + (userText.trim().length > 32 ? "..." : "")
      : currentSession.title

    // Append user message immediately
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === currentSession.id) {
          return {
            ...s,
            title: newTitle,
            updatedAt: `${dateStr} ${timeStr}`,
            messages: [...s.messages, userMsg],
          }
        }
        return s
      })
    )

    setInputMessage("")
    setIsProcessing(true)

    // Simulate Agent Processing Delay
    setTimeout(() => {
      const agentResult = processAgent(userText)

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "bot",
        text: agentResult.reply,
        timestamp: timeStr,
        fileAttachment: agentResult.fileAttachment,
      }

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id === currentSession.id) {
            return {
              ...s,
              updatedAt: `${dateStr} ${timeStr}`,
              messages: [...s.messages, botMsg],
            }
          }
          return s
        })
      )
      setIsProcessing(false)
    }, 600)
  }

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    handleSendMessageText(inputMessage)
  }

  const handleDownloadFile = (file: GeneratedFile) => {
    const blob = new Blob([file.content], { type: file.mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Create a brand new session/topic (like ChatGPT / Claude New Chat)
  const handleCreateNewSession = () => {
    // If the active session is already clean/empty (no user message yet), just stay on it
    const activeHasUserMsg = currentSession.messages.some((m) => m.sender === "user")
    if (!activeHasUserMsg) {
      setShowHistory(false)
      return
    }

    // Clean up any other empty sessions so we don't accumulate blank drafts
    const cleanSessions = sessions.filter((s) => s.messages.some((m) => m.sender === "user"))
    const newSession = createDefaultSession()
    setSessions([newSession, ...cleanSessions])
    setActiveSessionId(newSession.id)
    setShowHistory(false)
  }

  // Delete an individual chat session
  const handleDeleteSession = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id)
      if (filtered.length === 0) {
        const fresh = createDefaultSession()
        setActiveSessionId(fresh.id)
        return [fresh]
      }
      if (activeSessionId === id) {
        setActiveSessionId(filtered[0].id)
      }
      return filtered
    })
    setConfirmDeleteId(null)
  }

  // Clear all chat sessions
  const handleClearAllSessions = () => {
    const fresh = createDefaultSession()
    setSessions([fresh])
    setActiveSessionId(fresh.id)
    localStorage.removeItem(storageSessionsKey)
    localStorage.removeItem(storageCurrentSessionKey)
    setConfirmClearAll(false)
    setShowHistory(false)
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen ? (
        <Card
          className={`shadow-2xl flex flex-col backdrop-blur-md rounded-2xl border transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 overflow-hidden w-[95vw] sm:w-[600px] md:w-[680px] lg:w-[740px] h-[86vh] min-h-[700px] max-h-[96vh] ${
            isDark
              ? "border-[#1e293b] bg-[#0c1220]/95 text-gray-100 shadow-black/80"
              : "border-slate-200 bg-white/95 text-slate-800 shadow-slate-400/50"
          }`}
        >
          {/* Header */}
          <CardHeader
            className={`px-4 py-3 border-b flex flex-row items-center justify-between shrink-0 ${
              isDark ? "border-[#1e293b] bg-[#11192b]" : "border-slate-200 bg-slate-50"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-red-800 border border-red-400/30 flex items-center justify-center text-white font-bold shadow-md shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div className="truncate">
                <CardTitle
                  className={`text-sm font-bold flex items-center gap-2 ${
                    isDark ? "text-gray-100" : "text-slate-900"
                  }`}
                >
                  <span className="truncate">KIRANA Agent</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Online
                  </span>
                </CardTitle>
                <p className={`text-[11px] truncate font-medium ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                  {showHistory ? "Riwayat Topik Percakapan" : currentSession.title || "Percakapan Baru"}
                </p>
              </div>
            </div>

            {/* Header Action Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Toggle History List Button */}
              <button
                type="button"
                onClick={() => setShowHistory((prev) => !prev)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  showHistory
                    ? "bg-red-600 text-white border-red-500 shadow-sm"
                    : isDark
                    ? "border-[#1e293b] text-gray-300 hover:text-white hover:bg-[#1a253c]"
                    : "border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-200/70"
                }`}
                title="Lihat Daftar Topik Percakapan (History)"
              >
                <History className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Topik</span>
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold transition-colors ${
                    isDark
                      ? "bg-[#0b1329] text-red-500 border border-blue-900/60"
                      : showHistory
                      ? "bg-white text-red-700"
                      : "bg-red-600 text-white"
                  }`}
                >
                  {recordedSessions.length}
                </span>
              </button>

              {/* + Topik Baru Button */}
              <button
                type="button"
                onClick={handleCreateNewSession}
                className="btn-kpu-red px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs hover:scale-105 active:scale-95"
                title="Mulai Topik Percakapan Baru"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Topik Baru</span>
              </button>

              {/* Minimize Widget Button */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className={`p-1.5 rounded-xl transition-all cursor-pointer border ${
                  isDark
                    ? "border-[#1e293b] text-gray-400 hover:text-white hover:bg-[#1e293b]"
                    : "border-slate-200 text-slate-400 hover:text-slate-800 hover:bg-slate-200"
                }`}
                title="Tutup Widget"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </CardHeader>

          {/* MAIN BODY: Split / Toggle View for History vs Active Chat */}
          <div className="flex-1 flex overflow-hidden relative">
            {/* HISTORY DRAWER / VIEW */}
            {showHistory ? (
              <div className="w-full h-full flex flex-col bg-transparent animate-in fade-in duration-150">
                {/* History Header & Action Bar */}
                <div
                  className={`px-4 py-2.5 border-b flex items-center justify-between text-xs shrink-0 ${
                    isDark ? "bg-[#090e1a] border-[#1e293b]" : "bg-slate-100/80 border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-red-500" />
                    <span className="font-bold">Semua Topik Percakapan ({recordedSessions.length})</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Only show Hapus Semua if there are recorded sessions */}
                    {recordedSessions.length > 0 && (
                      confirmClearAll ? (
                        <div className="flex items-center gap-1.5 animate-in fade-in">
                          <span className="text-[10px] text-red-500 font-semibold">Hapus semua?</span>
                          <button
                            type="button"
                            onClick={handleClearAllSessions}
                            className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold hover:bg-red-700 cursor-pointer"
                          >
                            Ya
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmClearAll(false)}
                            className={`px-2 py-0.5 rounded text-[10px] border cursor-pointer ${
                              isDark ? "border-slate-700 text-gray-300" : "border-slate-300 text-slate-700"
                            }`}
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmClearAll(true)}
                          className="text-[11px] text-red-500 hover:text-red-600 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                        >
                          <Trash2 className="w-3 h-3" /> Hapus Semua
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* History Topics List */}
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-2.5">
                    {recordedSessions.length === 0 ? (
                      <div className="py-16 px-4 text-center flex flex-col items-center justify-center animate-in fade-in">
                        <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mb-3 border border-red-500/20">
                          <MessageSquare className="w-6 h-6" />
                        </div>
                        <p className={`text-sm font-bold mb-1 ${isDark ? "text-gray-200" : "text-slate-800"}`}>
                          Belum Ada Riwayat Percakapan
                        </p>
                        <p className={`text-xs max-w-[280px] leading-relaxed ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                          Mulai percakapan dengan mengetik pesan atau memilih Chip Cepat agar tersimpan di riwayat.
                        </p>
                      </div>
                    ) : (
                      recordedSessions.map((sess) => {
                        const isActive = sess.id === activeSessionId
                        const userMsgCount = sess.messages.filter((m) => m.sender === "user").length
                        const lastMsg = sess.messages[sess.messages.length - 1]?.text || ""

                        return (
                          <div
                            key={sess.id}
                            onClick={() => {
                              setActiveSessionId(sess.id)
                              setShowHistory(false)
                            }}
                            className={`p-3.5 rounded-xl border transition-all cursor-pointer group flex items-start justify-between gap-3 ${
                              isActive
                                ? isDark
                                  ? "bg-red-950/20 border-red-500/50 shadow-sm"
                                  : "bg-red-50/70 border-red-300 shadow-sm"
                                : isDark
                                ? "bg-[#131d30]/70 border-[#1e293b] hover:border-red-500/40 hover:bg-[#17233a]"
                                : "bg-white border-slate-200 hover:border-red-300 hover:bg-slate-50 shadow-xs"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-xs font-bold truncate ${
                                    isActive
                                      ? "text-red-600 dark:text-red-400"
                                      : "group-hover:text-red-500 transition-colors"
                                  }`}
                                >
                                  {sess.title}
                                </span>
                                {isActive && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-red-600 text-white font-bold shrink-0">
                                    Aktif
                                  </span>
                                )}
                              </div>

                              <p
                                className={`text-[11px] mt-1 line-clamp-1 italic ${
                                  isDark ? "text-gray-400" : "text-slate-500"
                                }`}
                              >
                                {lastMsg}
                              </p>

                              <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-400">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span>{sess.updatedAt}</span>
                                <span>•</span>
                                <span>{userMsgCount} prompt</span>
                              </div>
                            </div>

                            {/* Delete Session Button */}
                            <div className="shrink-0 flex items-center gap-1">
                              {confirmDeleteId === sess.id ? (
                                <div
                                  className="flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => handleDeleteSession(sess.id, e)}
                                    className="px-2 py-1 rounded bg-red-600 text-white text-[10px] font-bold hover:bg-red-700 cursor-pointer"
                                  >
                                    Hapus
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setConfirmDeleteId(null)
                                    }}
                                    className={`px-1.5 py-1 rounded text-[10px] border cursor-pointer ${
                                      isDark ? "border-slate-700 text-gray-300" : "border-slate-300 text-slate-700"
                                    }`}
                                  >
                                    X
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setConfirmDeleteId(sess.id)
                                  }}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-all cursor-pointer opacity-70 group-hover:opacity-100"
                                  title="Hapus topik percakapan ini"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </ScrollArea>

                {/* Footer of History: Back to active conversation */}
                <div
                  className={`p-3.5 border-t flex items-center justify-center shrink-0 ${
                    isDark ? "border-[#1e293b] bg-[#0c1220]" : "border-slate-200 bg-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setShowHistory(false)}
                    className={`w-full text-xs font-bold flex items-center justify-center gap-2 py-2.5 rounded-xl border transition-all cursor-pointer ${
                      isDark
                        ? "border-[#1e293b] hover:bg-[#1a253c] text-gray-300"
                        : "border-slate-300 hover:bg-slate-100 text-slate-700"
                    }`}
                  >
                    <ArrowLeft className="w-4 h-4" /> Buka Percakapan Aktif
                  </button>
                </div>
              </div>
            ) : (
              /* ACTIVE CHAT INTERFACE */
              <div className="w-full h-full flex flex-col overflow-hidden">
                {/* Quick Suggestions Chips Section */}
                <div
                  className={`px-4 py-2 border-b flex items-center gap-1.5 overflow-x-auto custom-scrollbar shrink-0 ${
                    isDark ? "bg-[#090e1a] border-[#1e293b]" : "bg-slate-100/70 border-slate-200"
                  }`}
                >
                  <span className="text-[11px] font-bold text-red-600 dark:text-red-400 shrink-0 flex items-center gap-1 mr-1">
                    <Sparkles className="w-3.5 h-3.5" /> Chip Cepat:
                  </span>
                  {quickChips.map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendMessageText(chip)}
                      disabled={isProcessing}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all cursor-pointer border shrink-0 ${
                        isDark
                          ? "bg-[#131d30] border-[#1e293b] text-gray-300 hover:border-red-500 hover:text-white hover:bg-red-950/40"
                          : "bg-white border-slate-300 text-slate-700 hover:border-red-500 hover:text-red-600 hover:bg-red-50 shadow-xs"
                      }`}
                    >
                      [{chip}]
                    </button>
                  ))}
                </div>

                {/* Messages Area */}
                <CardContent className="p-4 flex-1 overflow-hidden">
                  <ScrollArea className="h-full pr-3" ref={scrollRef}>
                    <div className="space-y-4 pb-2">
                      {currentSession.messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex items-start gap-3 ${
                            msg.sender === "user" ? "flex-row-reverse" : "flex-row"
                          }`}
                        >
                          <Avatar className="w-9 h-9 shrink-0 shadow-xs">
                            <AvatarFallback
                              className={
                                msg.sender === "user"
                                  ? "bg-red-600 text-white text-xs font-bold"
                                  : isDark
                                  ? "bg-[#1e293b] text-red-400 text-xs border border-red-500/30"
                                  : "bg-red-50 text-red-600 border border-red-200 text-xs"
                              }
                            >
                              {msg.sender === "user" ? (
                                <User className="w-4 h-4" />
                              ) : (
                                <Bot className="w-4 h-4" />
                              )}
                            </AvatarFallback>
                          </Avatar>

                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                              msg.sender === "user"
                                ? "bg-red-600 text-white rounded-tr-none shadow-md shadow-red-600/20"
                                : isDark
                                ? "bg-[#162032] text-gray-200 border border-[#1e293b] rounded-tl-none shadow-sm"
                                : "bg-slate-100 text-slate-800 border border-slate-200 rounded-tl-none shadow-sm"
                            }`}
                          >
                            <p className="whitespace-pre-line">{msg.text}</p>

                            {/* File Attachment Box & Download Button */}
                            {msg.fileAttachment && (
                              <div
                                className={`mt-3 p-3 rounded-xl border flex items-center justify-between gap-3 ${
                                  isDark
                                    ? "bg-[#0b101c] border-red-500/40 text-gray-200"
                                    : "bg-white border-red-200 text-slate-800 shadow-sm"
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="p-2 rounded-lg bg-red-600/10 text-red-500 shrink-0">
                                    <FileText className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-bold text-xs truncate">{msg.fileAttachment.name}</p>
                                    <span className="text-[10px] text-gray-400 block font-mono">
                                      {msg.fileAttachment.sizeStr} • Siap Diunduh
                                    </span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadFile(msg.fileAttachment!)}
                                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm hover:scale-105 active:scale-95 transition-all"
                                  title="Unduh file hasil generate"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Unduh</span>
                                </button>
                              </div>
                            )}

                            <span
                              className={`text-[10px] block mt-1.5 text-right font-mono ${
                                msg.sender === "user"
                                  ? "text-red-100"
                                  : isDark
                                  ? "text-gray-400"
                                  : "text-slate-400"
                              }`}
                            >
                              {msg.timestamp}
                            </span>
                          </div>
                        </div>
                      ))}

                      {/* Processing Indicator */}
                      {isProcessing && (
                        <div className="flex items-start gap-3">
                          <Avatar className="w-8 h-8 shrink-0">
                            <AvatarFallback
                              className={
                                isDark
                                  ? "bg-[#1e293b] text-red-400 text-xs"
                                  : "bg-red-50 text-red-600 border border-red-200 text-xs"
                              }
                            >
                              <Bot className="w-4 h-4" />
                            </AvatarFallback>
                          </Avatar>
                          <div
                            className={`rounded-2xl rounded-tl-none px-4 py-3 text-xs flex items-center gap-2.5 italic ${
                              isDark
                                ? "bg-[#162032] text-red-400 border border-[#1e293b]"
                                : "bg-red-50 text-red-600 border border-red-200"
                            }`}
                          >
                            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                            <span>KIRANA sedang memproses dan menyusun berkas...</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>

                {/* Input Area */}
                <CardFooter
                  className={`p-4 border-t shrink-0 ${
                    isDark ? "border-[#1e293b] bg-[#0c1220]" : "border-slate-200 bg-white"
                  }`}
                >
                  <form onSubmit={handleSubmit} className="flex items-center gap-2.5 w-full">
                    <Input
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      placeholder="Tulis perintah atau pilih Chip Cepat di atas..."
                      disabled={isProcessing}
                      className={`h-12 text-sm px-4 rounded-xl focus:border-red-500 ${
                        isDark
                          ? "bg-[#131b2e] border-[#1e293b] text-gray-100 placeholder:text-gray-500"
                          : "bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:bg-white"
                      }`}
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={isProcessing || !inputMessage.trim()}
                      className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white cursor-pointer shadow-md shadow-red-600/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </form>
                </CardFooter>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="relative group p-3.5 rounded-2xl bg-gradient-to-br from-red-600 via-red-700 to-red-900 text-white shadow-xl shadow-red-900/40 hover:shadow-2xl hover:shadow-red-600/50 hover:scale-105 active:scale-95 transition-all duration-300 flex items-center justify-center cursor-pointer border border-red-400/30 overflow-visible"
          title="Buka KIRANA Agent AI"
        >
          {/* Subtle Ambient Pulse Ring */}
          <span className="absolute inset-0 rounded-2xl bg-red-500/20 animate-ping opacity-60 pointer-events-none" />

          {/* Icon Composition: Modern Chat + Sparkle/AI Touch */}
          <div className="relative flex items-center justify-center">
            <MessageSquare className="w-6 h-6 stroke-[2.2] drop-shadow-sm" />
            <Sparkles className="w-3.5 h-3.5 text-amber-300 absolute -top-1.5 -right-1.5 fill-amber-300/80 drop-shadow-sm animate-pulse" />
          </div>

          {/* Elegant Floating Badge */}
          <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 bg-slate-950 text-amber-300 border border-amber-400/40 rounded-full text-[8px] font-black tracking-wider flex items-center gap-0.5 shadow-md">
            AI
          </span>
        </button>
      )}
    </div>
  )
}
