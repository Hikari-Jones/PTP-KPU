import { sendChatMessage } from '../../../services/api'
import { useState, useRef, useEffect } from "react"
import { MessageSquare, Send, Bot, User, Minimize2, Download, FileText, Loader2, Sparkles } from "lucide-react"
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

export function KiranaChatbot({ theme = "light" }: { theme?: "light" | "dark" }) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputMessage, setInputMessage] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  // Dispatch custom event so other components (e.g., Toast notification) can adjust their position
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("kirana-chatbot-toggle", { detail: { isOpen } }))
  }, [isOpen])

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      sender: "bot",
      text: "Halo! Saya KIRANA Agent, Asisten AI Sistem Informasi KPU Sulut. Saya membantu menyusun saran dan draf untuk ditinjau manusia. Saya tidak memiliki akses ke saldo anggaran atau kewenangan penerbitan surat.",
      timestamp: new Date().toLocaleTimeString("id-ID"),
    },
  ])

  const scrollRef = useRef<HTMLDivElement>(null)
  const isDark = theme === "dark"

  const quickChips = [
    "Surat Dinas",
    "Nota Dinas",
    "Lap. Anggaran",
    "Rekap Surat",
    "Jadwal"
  ]

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isOpen, isProcessing])

  const handleSendMessageText = async (userText: string) => {
    if (!userText.trim() || isProcessing) return

    const now = new Date()
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now
      .getMinutes()
      .toString()
      .padStart(2, "0")}`

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: userText,
      timestamp: timeStr,
    }

    setMessages((prev) => [...prev, userMsg])
    setInputMessage("")
    setIsProcessing(true)

    try {
      const result = await sendChatMessage(userText)
      setMessages(prev => [...prev, { id: crypto.randomUUID(), sender: 'bot', text: result.reply,
        timestamp: new Date().toLocaleTimeString('id-ID'), fileAttachment: result.fileAttachment }])
    } catch (error) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), sender: 'bot',
        text: error instanceof Error ? error.message : 'Asisten tidak tersedia. Coba lagi nanti.',
        timestamp: new Date().toLocaleTimeString('id-ID') }])
    } finally { setIsProcessing(false) }
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

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen ? (
        <Card
          className={`w-80 md:w-96 h-[520px] shadow-2xl flex flex-col backdrop-blur-md transition-all duration-200 animate-in fade-in slide-in-from-bottom-5 ${isDark
              ? "border-[#1e293b] bg-[#0c1220]/95 text-gray-100"
              : "border-slate-200 bg-white/95 text-slate-800 shadow-slate-300/60"
            }`}
        >
          {/* Header */}
          <CardHeader
            className={`p-3.5 border-b flex flex-row items-center justify-between shrink-0 ${isDark ? "border-[#1e293b] bg-[#11192b]" : "border-slate-200 bg-slate-50"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-600 font-bold">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <CardTitle
                  className={`text-sm font-bold flex items-center gap-1.5 ${isDark ? "text-gray-100" : "text-slate-900"
                    }`}
                >
                  KIRANA Agent
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                </CardTitle>
                <p className={`text-[10px] ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                  Asisten draf · Memerlukan layanan AI lokal
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsOpen(false)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isDark
                    ? "text-gray-400 hover:text-white hover:bg-[#1e293b]"
                    : "text-slate-400 hover:text-slate-800 hover:bg-slate-200"
                  }`}
                title="Perkecil Widget"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </CardHeader>

          {/* Quick Suggestions Chips Section */}
          <div
            className={`px-3 py-2 border-b flex items-center gap-1.5 overflow-x-auto custom-scrollbar shrink-0 ${isDark ? "bg-[#090e1a] border-[#1e293b]" : "bg-slate-100/70 border-slate-200"
              }`}
          >
            <span className="text-[10px] font-bold text-red-600 dark:text-red-400 shrink-0 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Chip Cepat:
            </span>
            {quickChips.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessageText(chip)}
                disabled={isProcessing}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-all cursor-pointer border shrink-0 ${isDark
                    ? "bg-[#131d30] border-[#1e293b] text-gray-300 hover:border-red-500 hover:text-white hover:bg-red-950/40"
                    : "bg-white border-slate-300 text-slate-700 hover:border-red-500 hover:text-red-600 hover:bg-red-50"
                  }`}
              >
                [{chip}]
              </button>
            ))}
          </div>

          {/* Messages Area */}
          <CardContent className="p-3 flex-1 overflow-hidden">
            <ScrollArea className="h-full pr-2" ref={scrollRef}>
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2.5 ${msg.sender === "user" ? "flex-row-reverse" : "flex-row"
                      }`}
                  >
                    <Avatar className="w-7 h-7 shrink-0">
                      <AvatarFallback
                        className={
                          msg.sender === "user"
                            ? "bg-red-600 text-white text-[10px]"
                            : isDark
                              ? "bg-[#1e293b] text-red-400 text-[10px]"
                              : "bg-red-50 text-red-600 border border-red-200 text-[10px]"
                        }
                      >
                        {msg.sender === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                      </AvatarFallback>
                    </Avatar>

                    <div
                      className={`max-w-[82%] rounded-xl px-3 py-2 text-xs leading-relaxed ${msg.sender === "user"
                          ? "bg-red-600 text-white rounded-tr-none shadow-sm"
                          : isDark
                            ? "bg-[#162032] text-gray-200 border border-[#1e293b] rounded-tl-none shadow-sm"
                            : "bg-slate-100 text-slate-800 border border-slate-200 rounded-tl-none shadow-sm"
                        }`}
                    >
                      <p>{msg.text}</p>

                      {/* File Attachment Box & Download Button */}
                      {msg.fileAttachment && (
                        <div
                          className={`mt-2.5 p-2.5 rounded-lg border flex items-center justify-between gap-2 ${isDark
                              ? "bg-[#0b101c] border-red-500/30 text-gray-200"
                              : "bg-white border-red-200 text-slate-800 shadow-xs"
                            }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-4 h-4 text-red-500 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-semibold text-[11px] truncate">{msg.fileAttachment.name}</p>
                              <span className="text-[9px] text-gray-400 block">{msg.fileAttachment.sizeStr}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDownloadFile(msg.fileAttachment!)}
                            className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-[10px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer shadow-xs transition-all"
                            title="Unduh file hasil generate"
                          >
                            <Download className="w-3 h-3" />
                            <span>Unduh</span>
                          </button>
                        </div>
                      )}

                      <span
                        className={`text-[9px] block mt-1 text-right ${msg.sender === "user" ? "text-red-100" : isDark ? "text-gray-400" : "text-slate-400"
                          }`}
                      >
                        {msg.timestamp}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Processing Indicator */}
                {isProcessing && (
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
                      className={`rounded-xl px-3 py-2 text-xs flex items-center gap-2 italic ${isDark ? "bg-[#162032] text-red-400 border border-[#1e293b]" : "bg-red-50 text-red-600 border border-red-200"
                        }`}
                    >
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>KIRANA sedang memproses...</span>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>

          {/* Input Area */}
          <CardFooter
            className={`p-3 border-t shrink-0 ${isDark ? "border-[#1e293b] bg-[#0c1220]" : "border-slate-200 bg-white"
              }`}
          >
            <form onSubmit={handleSubmit} className="flex items-center gap-2 w-full">
              <Input
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Tulis pesan atau pilih chip..."
                disabled={isProcessing}
                className={`text-xs focus:border-red-500 ${isDark
                    ? "bg-[#131b2e] border-[#1e293b] text-gray-100 placeholder:text-gray-500"
                    : "bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:bg-white"
                  }`}
              />
              <Button
                type="submit"
                size="icon"
                disabled={isProcessing || !inputMessage.trim()}
                className="shrink-0 bg-red-600 hover:bg-red-700 text-white cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </CardFooter>
        </Card>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="relative group p-4 rounded-2xl btn-kpu-red text-white hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center cursor-pointer"
          title="Buka KIRANA Agent"
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
