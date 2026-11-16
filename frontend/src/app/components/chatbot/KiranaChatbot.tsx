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

const STORAGE_KEY = "ptp_kpu_kirana_chat"
const MAX_STORED_MESSAGES = 60
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

const loadMessages = (): ChatMessage[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as ChatMessage[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    // corrupted or unavailable storage: start a fresh conversation
  }
  return [welcomeMessage()]
}

export function KiranaChatbot({ theme = "light" }: { theme?: "light" | "dark" }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [inputMessage, setInputMessage] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [statusText, setStatusText] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const stickToBottomRef = useRef(true)
  const isDark = theme === "dark"

  // Keep the conversation across page reloads
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)))
    } catch {
      // storage full or unavailable: the chat still works, just is not saved
    }
  }, [messages])

  // Follow the answer while it streams, unless the user scrolled up to read
  useEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages, isOpen, isProcessing, statusText])

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  // Stop any running generation when the widget unmounts
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

  const patchMessage = (id: string, patch: (msg: ChatMessage) => ChatMessage) =>
    setMessages((prev) => prev.map((msg) => (msg.id === id ? patch(msg) : msg)))

  const askKirana = useCallback(async (question: string, previous: ChatMessage[]) => {
    const history: ChatTurn[] = previous
      .filter((msg) => msg.id !== "welcome" && !msg.isError && msg.text.trim())
      .slice(-MAX_HISTORY_TURNS)
      .map((msg) => ({ role: msg.sender === "user" ? "user" : "assistant", content: msg.text }))

    const botId = `bot-${Date.now()}`
    const controller = new AbortController()
    abortRef.current = controller
    stickToBottomRef.current = true

    setMessages([
      ...previous,
      { id: `user-${Date.now()}`, sender: "user", text: question, timestamp: timeNow() },
      { id: botId, sender: "bot", text: "", timestamp: timeNow() },
    ])
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
            // the text so far was only a preamble before a database lookup
            patchMessage(botId, (msg) => ({ ...msg, text: "" }))
          } else if (event.type === "status") {
            setStatusText(event.text)
          } else if (event.type === "done") {
            patchMessage(botId, (msg) => ({ ...msg, usedDatabase: event.used_database }))
          } else if (event.type === "error") {
            patchMessage(botId, (msg) => ({ ...msg, text: `${msg.text}\n\n_${event.text}_` }))
          }
        },
        controller.signal,
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
            "Maaf, layanan AI tidak dapat dihubungi. Pastikan backend berjalan, lalu coba lagi.",
        }
      })
      if (!stopped) console.warn("KIRANA request failed", error)
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setIsProcessing(false)
      setStatusText("")
    }
  }, [])

  const sendMessage = (text: string) => {
    const question = text.trim()
    if (!question || isProcessing) return
    setInputMessage("")
    if (inputRef.current) inputRef.current.style.height = "auto"
    void askKirana(question, messages)
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
    void askKirana(messages[lastUser].text, messages.slice(0, lastUser))
  }

  const newConversation = () => {
    abortRef.current?.abort()
    setMessages([welcomeMessage()])
    setInputMessage("")
    inputRef.current?.focus()
  }

  const copyMessage = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.text)
      setCopiedId(msg.id)
      window.setTimeout(() => setCopiedId((current) => (current === msg.id ? null : current)), 1500)
    } catch {
      // clipboard blocked by the browser: nothing to do
    }
  }

  const downloadMessage = (msg: ChatMessage) => {
    const blob = new Blob([msg.text], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `KIRANA_${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
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
        <Card
          className={`shadow-2xl flex flex-col backdrop-blur-md transition-all duration-200 animate-in fade-in slide-in-from-bottom-5 max-w-[calc(100vw-3rem)] max-h-[calc(100vh-3rem)] ${
            isExpanded ? "w-[640px] h-[760px]" : "w-80 md:w-96 h-[560px]"
          } ${
            isDark
              ? "border-[#1e293b] bg-[#0c1220]/95 text-gray-100"
              : "border-slate-200 bg-white/95 text-slate-800 shadow-slate-300/60"
          }`}
        >
          {/* Header */}
          <CardHeader
            className={`p-3.5 border-b flex flex-row items-center justify-between shrink-0 ${
              isDark ? "border-[#1e293b] bg-[#11192b]" : "border-slate-200 bg-slate-50"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-600 font-bold">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <CardTitle
                  className={`text-sm font-bold flex items-center gap-1.5 ${isDark ? "text-gray-100" : "text-slate-900"}`}
                >
                  KIRANA
                  <span
                    className={`w-2 h-2 rounded-full ${isProcessing ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`}
                  ></span>
                </CardTitle>
                <p className={`text-[10px] ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                  Asisten AI KPU Sulut | {isProcessing ? "Menjawab…" : "Siap"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={newConversation}
                className={headerButtonClass}
                title="Percakapan baru"
                aria-label="Percakapan baru"
              >
                <SquarePen className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded((value) => !value)}
                className={headerButtonClass}
                title={isExpanded ? "Perkecil jendela" : "Perbesar jendela"}
                aria-label={isExpanded ? "Perkecil jendela" : "Perbesar jendela"}
              >
                <Maximize2 className="w-4 h-4" />
              </button>
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
          </CardHeader>

          {/* Messages */}
          <CardContent className="p-0 flex-1 min-h-0">
            <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto custom-scrollbar p-3">
              <div className="space-y-3">
                {messages.map((msg) => {
                  const isUser = msg.sender === "user"
                  const isStreamingThis = isProcessing && msg.id === lastMessage.id && !isUser
                  if (isStreamingThis && !msg.text) return null // the status bubble below stands in

                  return (
                    <div key={msg.id} className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                      <Avatar className="w-7 h-7 shrink-0">
                        <AvatarFallback
                          className={
                            isUser
                              ? "bg-red-600 text-white text-[10px]"
                              : isDark
                                ? "bg-[#1e293b] text-red-400 text-[10px]"
                                : "bg-red-50 text-red-600 border border-red-200 text-[10px]"
                          }
                        >
                          {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                        </AvatarFallback>
                      </Avatar>

                      <div
                        className={`max-w-[85%] min-w-0 rounded-xl px-3 py-2 text-xs leading-relaxed ${
                          isUser
                            ? "bg-red-600 text-white rounded-tr-none shadow-sm"
                            : isDark
                              ? "bg-[#162032] text-gray-200 border border-[#1e293b] rounded-tl-none shadow-sm"
                              : "bg-slate-100 text-slate-800 border border-slate-200 rounded-tl-none shadow-sm"
                        }`}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                        ) : (
                          <MarkdownMessage text={msg.text} />
                        )}

                        <div className="flex items-center justify-between gap-2 mt-1">
                          {!isUser && !isStreamingThis && msg.id !== "welcome" ? (
                            <div className="flex items-center gap-0.5 -ml-1">
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
                              {msg.id === lastMessage.id && (
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
                                  className={`ml-1 flex items-center gap-1 text-[9px] ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
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
                            className={`text-[9px] shrink-0 ${
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

                {/* Status while thinking / reading the database */}
                {isProcessing && statusText && (
                  <div className="flex items-start gap-2.5">
                    <Avatar className="w-7 h-7 shrink-0">
                      <AvatarFallback
                        className={
                          isDark
                            ? "bg-[#1e293b] text-red-400 text-[10px]"
                            : "bg-red-50 text-red-600 border border-red-200 text-[10px]"
                        }
                      >
                        <Bot className="w-3.5 h-3.5" />
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={`rounded-xl px-3 py-2 text-xs flex items-center gap-2 italic ${
                        isDark ? "bg-[#162032] text-red-400 border border-[#1e293b]" : "bg-red-50 text-red-600 border border-red-200"
                      }`}
                    >
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{statusText}</span>
                    </div>
                  </div>
                )}

                {/* Suggestions for an empty conversation */}
                {!hasConversation && (
                  <div className="pt-1">
                    <p className="text-[10px] font-bold text-red-600 dark:text-red-400 flex items-center gap-1 mb-1.5">
                      <Sparkles className="w-3 h-3" /> Coba tanyakan:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {SUGGESTIONS.map((suggestion) => (
                        <button
                          key={suggestion.label}
                          type="button"
                          onClick={() => sendMessage(suggestion.prompt)}
                          disabled={isProcessing}
                          title={suggestion.prompt}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer border ${
                            isDark
                              ? "bg-[#131d30] border-[#1e293b] text-gray-300 hover:border-red-500 hover:text-white hover:bg-red-950/40"
                              : "bg-white border-slate-300 text-slate-700 hover:border-red-500 hover:text-red-600 hover:bg-red-50"
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
          </CardContent>

          {/* Input */}
          <CardFooter
            className={`p-3 border-t shrink-0 flex-col items-stretch gap-1 ${
              isDark ? "border-[#1e293b] bg-[#0c1220]" : "border-slate-200 bg-white"
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
                placeholder="Tanyakan apa saja…"
                aria-label="Pesan untuk KIRANA"
                className={`flex-1 resize-none rounded-md border px-3 py-2 text-xs outline-none focus:border-red-500 ${
                  isDark
                    ? "bg-[#131b2e] border-[#1e293b] text-gray-100 placeholder:text-gray-500"
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
                  className="shrink-0 bg-slate-700 hover:bg-slate-800 text-white cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!inputMessage.trim()}
                  title="Kirim"
                  aria-label="Kirim"
                  className="shrink-0 bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </Button>
              )}
            </form>
            <p className={`text-[9px] text-center ${isDark ? "text-gray-500" : "text-slate-400"}`}>
              Enter untuk kirim, Shift+Enter baris baru. Jawaban AI bisa keliru; periksa kembali data penting.
            </p>
          </CardFooter>
        </Card>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="relative group p-4 rounded-2xl btn-kpu-red text-white hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center cursor-pointer"
          title="Buka KIRANA"
        >
          <MessageSquare className="w-6 h-6" />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-black text-white dark:bg-white dark:text-black rounded-full text-[9px] font-black flex items-center justify-center border border-white/20 shadow-xs">
            AI
          </span>
        </button>
      )}
    </div>
  )
}
