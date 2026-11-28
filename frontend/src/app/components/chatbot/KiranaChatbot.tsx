import { showToast } from "../../../services/activity"
import { saveFile } from "../../../services/csv"
import { useState, useRef, useEffect, useCallback } from "react"
import {
  MessageSquare,
  Send,
  Bot,
  User,
  Minimize2,
  Maximize2,
  Download,
  Loader2,
  Sparkles,
  Square,
  Copy,
  Check,
  RotateCcw,
  SquarePen,
  Database,
  History,
  Trash2,
  Plus,
  ChevronLeft,
} from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "../ui/card"
import { Button } from "../ui/button"
import { Avatar, AvatarFallback } from "../ui/avatar"
import { streamChatMessage, type ChatTurn } from "../../../services/api"
import { MarkdownMessage } from "./MarkdownMessage"

export interface ChatMessage {
  id: string
  sender: "user" | "bot"
  text: string
  timestamp: string
  /** Answer came from the database tool */
  usedDatabase?: boolean
  /** Request failed; excluded from the history sent to the model */
  isError?: boolean
}

export interface ChatThread {
  id: string
  title: string
  updatedAt: string
  messages: ChatMessage[]
}

const STORAGE_THREADS_KEY = "ptp_kpu_kirana_threads_v2"
const MAX_STORED_THREADS = 30
const MAX_STORED_MESSAGES_PER_THREAD = 60
const MAX_HISTORY_TURNS = 12

const WELCOME_TEXT =
  "Halo! Saya **KIRANA**, asisten AI Sistem Informasi KPU Sulut. Saya bisa menjawab pertanyaan, menyusun draf surat, dan membaca data surat, arsip, pegawai, serta anggaran langsung dari database. Ada yang bisa saya bantu?"

const SUGGESTIONS: { label: string; prompt: string }[] = [
  { label: "Rekap surat", prompt: "Berapa jumlah surat keluar per status saat ini?" },
  { label: "Surat terbaru", prompt: "Tampilkan 5 surat keluar terbaru beserta perihal dan statusnya." },
  { label: "Realisasi anggaran", prompt: "Berapa total pagu aktif dan total realisasi anggaran yang sudah terverifikasi?" },
  { label: "Arsip", prompt: "Dokumen arsip apa saja yang terakhir diunggah?" },
  { label: "Draf nota dinas", prompt: "Buatkan draf nota dinas tentang permohonan pengadaan alat tulis kantor." },
]

const timeNow = () => {
  const now = new Date()
  return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`
}

const welcomeMessage = (): ChatMessage => ({
  id: "welcome",
  sender: "bot",
  text: WELCOME_TEXT,
  timestamp: timeNow(),
})

const createNewThread = (): ChatThread => ({
  id: `thread-${Date.now()}`,
  title: "Percakapan Baru",
  updatedAt: new Date().toISOString(),
  messages: [welcomeMessage()],
})

const loadThreads = (storageKey: string): ChatThread[] => {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      const parsed = JSON.parse(saved) as ChatThread[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, MAX_STORED_THREADS)
      }
    }
  } catch {
    // fallback
  }
  return [createNewThread()]
}

export function KiranaChatbot({ theme = "light", userKey }: { theme?: "light" | "dark"; userKey: string }) {
  const threadsStorageKey = `${STORAGE_THREADS_KEY}:${userKey}`
  const [threads, setThreads] = useState<ChatThread[]>(() => loadThreads(threadsStorageKey))
  const [activeThreadId, setActiveThreadId] = useState<string>(() => threads[0]?.id || `thread-${Date.now()}`)
  const [showHistory, setShowHistory] = useState(false)

  // Sinkronisasi ulang data threads saat akun yang login (userKey) berganti
  useEffect(() => {
    const loaded = loadThreads(threadsStorageKey)
    setThreads(loaded)
    setActiveThreadId(loaded[0]?.id || `thread-${Date.now()}`)
    setShowHistory(false)
  }, [threadsStorageKey])

  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [inputMessage, setInputMessage] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [statusText, setStatusText] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const stickToBottomRef = useRef(true)
  const isDark = theme === "dark"

  const activeThread = threads.find((t) => t.id === activeThreadId) || threads[0] || createNewThread()
  const messages = activeThread.messages

  // Simpan threads ke LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(threadsStorageKey, JSON.stringify(threads.slice(0, MAX_STORED_THREADS)))
    } catch {
      // storage quota
    }
  }, [threads, threadsStorageKey])

  // Scroll otomatis ke bawah
  useEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages, isOpen, isProcessing, statusText, showHistory])

  useEffect(() => {
    if (isOpen && !showHistory) inputRef.current?.focus()
  }, [isOpen, showHistory])

  useEffect(() => () => abortRef.current?.abort(), [])

  const handleScroll = () => {
    const el = scrollRef.current
    if (el) stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  const updateActiveThreadMessages = (updater: (prevMessages: ChatMessage[]) => ChatMessage[], newTitle?: string) => {
    setThreads((prevThreads) =>
      prevThreads.map((t) => {
        if (t.id === activeThreadId) {
          const updatedMsgs = updater(t.messages).slice(-MAX_STORED_MESSAGES_PER_THREAD)
          return {
            ...t,
            title: newTitle || t.title,
            updatedAt: new Date().toISOString(),
            messages: updatedMsgs,
          }
        }
        return t
      })
    )
  }

  const patchMessage = (id: string, patch: (msg: ChatMessage) => ChatMessage) => {
    updateActiveThreadMessages((prev) => prev.map((msg) => (msg.id === id ? patch(msg) : msg)))
  }

  const askKirana = useCallback(
    async (question: string, currentThreadId: string) => {
      const targetThread = threads.find((t) => t.id === currentThreadId) || activeThread
      const previous = targetThread.messages

      const history: ChatTurn[] = previous
        .filter((msg) => msg.id !== "welcome" && !msg.isError && msg.text.trim())
        .slice(-MAX_HISTORY_TURNS)
        .map((msg) => ({ role: msg.sender === "user" ? "user" : "assistant", content: msg.text }))

      const botId = `bot-${Date.now()}`
      const controller = new AbortController()
      abortRef.current = controller
      stickToBottomRef.current = true

      // Update judul thread jika ini percakapan baru
      const needsTitle = targetThread.title === "Percakapan Baru" || previous.filter((m) => m.sender === "user").length === 0
      const threadTitle = needsTitle ? question.slice(0, 32) + (question.length > 32 ? "…" : "") : targetThread.title

      setThreads((prevThreads) =>
        prevThreads.map((t) => {
          if (t.id === currentThreadId) {
            return {
              ...t,
              title: threadTitle,
              updatedAt: new Date().toISOString(),
              messages: [
                ...t.messages,
                { id: `user-${Date.now()}`, sender: "user", text: question, timestamp: timeNow() },
                { id: botId, sender: "bot", text: "", timestamp: timeNow() },
              ],
            }
          }
          return t
        })
      )

      setIsProcessing(true)
      setStatusText("KIRANA sedang berpikir…")

      try {
        await streamChatMessage(
          question,
          history,
          (event) => {
            if (event.type === "token") {
              setStatusText("")
              patchMessage(botId, (msg) => ({ ...msg, text: msg.text + event.text }))
            } else if (event.type === "reset") {
              patchMessage(botId, (msg) => ({ ...msg, text: "" }))
            } else if (event.type === "status") {
              setStatusText(event.text)
            } else if (event.type === "done") {
              patchMessage(botId, (msg) => ({ ...msg, usedDatabase: event.used_database }))
            } else if (event.type === "error") {
              patchMessage(botId, (msg) => ({ ...msg, isError: true, text: `${msg.text}\n\n_${event.text}_` }))
            }
          },
          controller.signal
        )
      } catch (error) {
        const stopped = controller.signal.aborted
        patchMessage(botId, (msg) => {
          if (stopped) return msg.text.trim() ? msg : { ...msg, text: "_Jawaban dihentikan._", isError: true }
          return {
            ...msg,
            isError: true,
            text:
              (msg.text ? `${msg.text}\n\n` : "") +
              (error instanceof Error ? error.message : "Layanan AI tidak dapat dihubungi. Coba lagi."),
          }
        })
        if (!stopped) console.warn("KIRANA request failed", error)
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setIsProcessing(false)
        setStatusText("")
      }
    },
    [threads, activeThread]
  )

  const sendMessage = (text: string) => {
    const question = text.trim()
    if (!question || isProcessing) return
    setInputMessage("")
    if (inputRef.current) inputRef.current.style.height = "auto"
    void askKirana(question, activeThreadId)
  }

  const stopGenerating = () => abortRef.current?.abort()

  const regenerate = () => {
    if (isProcessing) return
    let lastUser = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === "user") {
        lastUser = i
        break
      }
    }
    if (lastUser === -1) return
    const question = messages[lastUser].text
    // Hapus pesan setelah user terakhir
    updateActiveThreadMessages((prev) => prev.slice(0, lastUser))
    void askKirana(question, activeThreadId)
  }

  const startNewThread = () => {
    abortRef.current?.abort()
    const newT = createNewThread()
    setThreads((prev) => [newT, ...prev])
    setActiveThreadId(newT.id)
    setShowHistory(false)
    setInputMessage("")
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const switchThread = (id: string) => {
    if (id === activeThreadId) {
      setShowHistory(false)
      return
    }
    abortRef.current?.abort()
    setActiveThreadId(id)
    setShowHistory(false)
  }

  const deleteThread = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const remaining = threads.filter((t) => t.id !== id)
    if (remaining.length === 0) {
      const fallback = createNewThread()
      setThreads([fallback])
      setActiveThreadId(fallback.id)
    } else {
      setThreads(remaining)
      if (activeThreadId === id) {
        setActiveThreadId(remaining[0].id)
      }
    }
  }

  const copyMessage = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.text)
      setCopiedId(msg.id)
      window.setTimeout(() => setCopiedId((current) => (current === msg.id ? null : current)), 1500)
    } catch {
      showToast("error", "Gagal menyalin: browser memblokir akses clipboard. Salin teks secara manual.")
    }
  }

  const downloadMessage = (msg: ChatMessage) => {
    const blob = new Blob([msg.text], { type: "text/plain;charset=utf-8" })
    saveFile(`KIRANA_${new Date().toISOString().slice(0, 10)}.txt`, blob)
  }

  const lastMessage = messages[messages.length - 1]
  const hasConversation = messages.some((msg) => msg.sender === "user")
  const actionButtonClass = `p-1 rounded transition-colors cursor-pointer ${
    isDark ? "text-gray-400 hover:text-white hover:bg-white/10" : "text-slate-400 hover:text-slate-800 hover:bg-slate-200"
  }`
  const headerButtonClass = `p-1.5 rounded-lg transition-colors cursor-pointer ${
    isDark ? "text-gray-400 hover:text-white hover:bg-[#1e293b]" : "text-slate-400 hover:text-slate-800 hover:bg-slate-200"
  }`

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen ? (
        <div
          style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
          className={`shadow-2xl flex flex-col transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] rounded-2xl overflow-hidden border ${
            isExpanded
              ? "w-[800px] h-[820px]"
              : "w-[440px] sm:w-[480px] h-[650px]"
          } ${
            isDark
              ? "border-white/10 bg-black/25 text-gray-100 shadow-black/80"
              : "border-slate-300/60 bg-white/30 text-slate-800 shadow-2xl"
          }`}
        >
          {/* Header */}
          <div
            style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
            className={`p-3.5 sm:p-4 border-b flex flex-row items-center justify-between shrink-0 transition-colors ${
              isDark ? "border-white/10 bg-[#0a101f]/60" : "border-slate-200/60 bg-white/60"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {showHistory ? (
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="p-1 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-500/10 transition-colors"
                  title="Kembali ke chat"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              ) : null}

              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-600 to-red-800 border border-red-500/40 flex items-center justify-center text-white font-bold shadow-xs">
                <Bot className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <CardTitle
                  className={`text-sm font-bold flex items-center gap-1.5 truncate ${
                    isDark ? "text-gray-100" : "text-slate-900"
                  }`}
                >
                  <span className="truncate">{showHistory ? "Riwayat Percakapan" : "KIRANA AI"}</span>
                  {!showHistory && (
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isProcessing ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                      }`}
                    />
                  )}
                </CardTitle>
                <p className={`text-[10px] truncate ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                  {showHistory
                    ? `${threads.length} topik tersimpan`
                    : `${activeThread.title} · ${isProcessing ? "Menjawab…" : "Aktif"}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Tombol Toggle History Chat */}
              <button
                type="button"
                onClick={() => setShowHistory((prev) => !prev)}
                className={`${headerButtonClass} ${showHistory ? "bg-red-600 text-white hover:bg-red-700" : ""}`}
                title="Riwayat Topik Obrolan"
                aria-label="Riwayat Obrolan"
              >
                <History className="w-4 h-4" />
              </button>

              {/* Tombol Buat Percakapan Baru */}
              <button
                type="button"
                onClick={startNewThread}
                className={headerButtonClass}
                title="Percakapan baru (+)"
                aria-label="Percakapan baru"
              >
                <Plus className="w-4 h-4" />
              </button>

              {/* Tombol Maximize/Expand */}
              <button
                type="button"
                onClick={() => setIsExpanded((value) => !value)}
                className={headerButtonClass}
                title={isExpanded ? "Ukuran Standar" : "Perbesar Penuh"}
                aria-label={isExpanded ? "Ukuran Standar" : "Perbesar Penuh"}
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              {/* Tombol Minimize/Tutup */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className={headerButtonClass}
                title="Tutup"
                aria-label="Tutup"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body: Tampilan History ATAU Percakapan Aktif */}
          {showHistory ? (
            /* Panel Daftar Topik Percakapan (History) */
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-transparent">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/60 dark:border-white/10">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Topik Obrolan Sebelumnya
                </span>
                <button
                  type="button"
                  onClick={startNewThread}
                  className="btn-kpu-red px-2.5 py-1 text-white text-[11px] font-bold rounded-lg flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Chat Baru
                </button>
              </div>

              {threads.map((t) => {
                const isActive = t.id === activeThreadId
                const promptCount = t.messages.filter((m) => m.sender === "user").length
                return (
                  <div
                    key={t.id}
                    onClick={() => switchThread(t.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                      isActive
                        ? isDark
                          ? "bg-red-950/30 border-red-500/50 text-white"
                          : "bg-red-50 border-red-300 text-red-900"
                        : isDark
                        ? "bg-[#111827]/60 border-white/5 hover:border-white/20 text-gray-200"
                        : "bg-white/60 border-slate-200 hover:border-slate-300 text-slate-800"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate">{t.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {promptCount} prompt · {new Date(t.updatedAt).toLocaleDateString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => deleteThread(e, t.id)}
                      title="Hapus topik ini"
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-500/20 text-slate-400 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            /* Panel Pesan Obrolan (Transparan dengan Sedikit Blur) */
            <div className="p-0 flex-1 min-h-0 relative bg-transparent flex flex-col">
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="h-full overflow-y-auto custom-scrollbar p-4 space-y-4 bg-transparent"
              >
                {messages.map((msg) => {
                  const isUser = msg.sender === "user"
                  const isStreamingThis = isProcessing && msg.id === lastMessage?.id && !isUser
                  if (isStreamingThis && !msg.text) return null

                  return (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
                    >
                      <Avatar className="w-8 h-8 shrink-0 shadow-xs">
                        <AvatarFallback
                          className={
                            isUser
                              ? "bg-red-600 text-white text-[11px]"
                              : isDark
                              ? "bg-[#1e293b] text-red-400 text-[11px] border border-red-500/20"
                              : "bg-red-50 text-red-600 border border-red-200 text-[11px]"
                          }
                        >
                          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                        </AvatarFallback>
                      </Avatar>

                      <div
                        className={`max-w-[85%] min-w-0 rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs ${
                          isUser
                            ? "bg-red-600 text-white rounded-tr-xs"
                            : isDark
                            ? "bg-[#141d33]/85 text-gray-100 border border-white/10 rounded-tl-xs"
                            : "bg-slate-100/85 text-slate-900 border border-slate-200 rounded-tl-xs"
                        }`}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                        ) : (
                          <MarkdownMessage text={msg.text} />
                        )}

                        <div className="flex items-center justify-between gap-2 mt-1.5 pt-1 border-t border-black/5 dark:border-white/5">
                          {!isUser && !isStreamingThis && msg.id !== "welcome" ? (
                            <div className="flex items-center gap-1 -ml-1">
                              <button
                                type="button"
                                onClick={() => void copyMessage(msg)}
                                className={actionButtonClass}
                                title="Salin jawaban"
                                aria-label="Salin jawaban"
                              >
                                {copiedId === msg.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadMessage(msg)}
                                className={actionButtonClass}
                                title="Unduh sebagai berkas .txt"
                                aria-label="Unduh sebagai berkas .txt"
                              >
                                <Download className="w-3 h-3" />
                              </button>
                              {msg.id === lastMessage?.id && (
                                <button
                                  type="button"
                                  onClick={regenerate}
                                  className={actionButtonClass}
                                  title="Jawab ulang"
                                  aria-label="Jawab ulang"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </button>
                              )}
                              {msg.usedDatabase && (
                                <span
                                  className={`ml-1 flex items-center gap-1 text-[9px] font-semibold ${
                                    isDark ? "text-emerald-400" : "text-emerald-600"
                                  }`}
                                  title="Jawaban disusun dari data di database"
                                >
                                  <Database className="w-3 h-3" /> dari database
                                </span>
                              )}
                            </div>
                          ) : (
                            <span />
                          )}
                          <span
                            className={`text-[9px] shrink-0 font-medium ${
                              isUser ? "text-red-100" : isDark ? "text-gray-400" : "text-slate-400"
                            }`}
                          >
                            {msg.timestamp}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Status Berpikir */}
                {isProcessing && statusText && (
                  <div className="flex items-start gap-2.5">
                    <Avatar className="w-8 h-8 shrink-0 shadow-xs">
                      <AvatarFallback
                        className={
                          isDark
                            ? "bg-[#1e293b] text-red-400 text-[11px] border border-red-500/20"
                            : "bg-red-50 text-red-600 border border-red-200 text-[11px]"
                        }
                      >
                        <Bot className="w-4 h-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={`rounded-2xl px-3.5 py-2.5 text-xs flex items-center gap-2 italic ${
                        isDark
                          ? "bg-[#141d33]/85 text-red-400 border border-white/10"
                          : "bg-red-50/90 text-red-600 border border-red-200"
                      }`}
                    >
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{statusText}</span>
                    </div>
                  </div>
                )}

                {/* Prompt Suggestions */}
                {!hasConversation && (
                  <div className="pt-2">
                    <p className="text-[11px] font-bold text-red-600 dark:text-red-400 flex items-center gap-1.5 mb-2">
                      <Sparkles className="w-3.5 h-3.5" /> Rekomendasi Pertanyaan:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {SUGGESTIONS.map((suggestion) => (
                        <button
                          key={suggestion.label}
                          type="button"
                          onClick={() => sendMessage(suggestion.prompt)}
                          disabled={isProcessing}
                          title={suggestion.prompt}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-medium transition-all cursor-pointer border shadow-2xs ${
                            isDark
                              ? "bg-[#111827]/70 border-white/10 text-gray-300 hover:border-red-500 hover:text-white hover:bg-red-950/40"
                              : "bg-white/80 border-slate-200 text-slate-700 hover:border-red-500 hover:text-red-600 hover:bg-red-50"
                          }`}
                        >
                          {suggestion.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Footer Input Chat (Hanya Muncul saat Membuka Chat Aktif) */}
          {!showHistory && (
            <div
              style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
              className={`p-3.5 border-t shrink-0 flex flex-col items-stretch gap-1.5 ${
                isDark ? "border-white/10 bg-[#0a101f]/60" : "border-slate-200/60 bg-white/60"
              }`}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  sendMessage(inputMessage)
                }}
                className="flex items-end gap-2 w-full"
              >
                <textarea
                  ref={inputRef}
                  value={inputMessage}
                  rows={1}
                  onChange={(e) => {
                    setInputMessage(e.target.value)
                    autoGrow(e.target)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      sendMessage(inputMessage)
                    }
                  }}
                  placeholder="Tanyakan informasi persuratan, anggaran, arsip, atau draf surat…"
                  aria-label="Pesan untuk KIRANA"
                  className={`flex-1 resize-none rounded-xl border px-3.5 py-2.5 text-xs outline-none focus:border-red-500 shadow-2xs transition-all ${
                    isDark
                      ? "bg-[#111827]/80 border-white/10 text-gray-100 placeholder:text-gray-500 focus:bg-[#111827]"
                      : "bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:bg-white"
                  }`}
                />
                {isProcessing ? (
                  <Button
                    type="button"
                    size="icon"
                    onClick={stopGenerating}
                    title="Hentikan jawaban"
                    aria-label="Hentikan jawaban"
                    className="shrink-0 bg-slate-700 hover:bg-slate-800 text-white cursor-pointer rounded-xl h-10 w-10"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!inputMessage.trim()}
                    title="Kirim Pesan"
                    aria-label="Kirim Pesan"
                    className="shrink-0 bg-red-600 hover:bg-red-700 text-white cursor-pointer rounded-xl h-10 w-10 shadow-xs active:scale-95 transition-all"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                )}
              </form>
              <p className={`text-[10px] text-center ${isDark ? "text-gray-400" : "text-slate-400"}`}>
                Enter untuk kirim · Shift+Enter baris baru · Respon AI terintegrasi basis data lokal KPU Sulut.
              </p>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className={`relative group p-3.5 sm:p-4 rounded-2xl transition-all duration-300 flex items-center justify-center cursor-pointer active:scale-95 hover:scale-105 border ${
            isDark
              ? "bg-gradient-to-br from-red-600 via-red-700 to-red-900 border-red-500/30 text-white shadow-[0_8px_25px_-5px_rgba(220,38,38,0.5)] hover:shadow-[0_12px_30px_-4px_rgba(220,38,38,0.65)] hover:border-red-400/50"
              : "bg-gradient-to-br from-red-500 via-red-600 to-red-700 border-red-400/40 text-white shadow-[0_8px_20px_-3px_rgba(220,38,38,0.4)] hover:shadow-[0_12px_28px_-3px_rgba(220,38,38,0.55)] hover:border-red-300"
          }`}
          title="Buka Asisten AI KIRANA"
          aria-label="Buka Asisten AI KIRANA"
        >
          {/* Subtle Glow Effect di Balik Icon */}
          <div className="absolute inset-0 rounded-2xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

          {/* Icon Chatbot dengan Sparkle Subtil */}
          <div className="relative flex items-center justify-center">
            <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 drop-shadow-sm transition-transform duration-300 group-hover:-translate-y-0.5" />
            <Sparkles className="w-3 h-3 text-amber-300 absolute -top-1.5 -right-2 animate-pulse" />
          </div>

          {/* Badge AI Modern & Rapi */}
          <span
            className={`absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider border shadow-sm transition-transform duration-300 group-hover:scale-110 flex items-center justify-center ${
              isDark
                ? "bg-[#0b1120] text-red-400 border-red-500/40"
                : "bg-white text-red-600 border-red-200"
            }`}
          >
            AI
          </span>
        </button>
      )}
    </div>
  )
}
