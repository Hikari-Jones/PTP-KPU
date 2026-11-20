import { Loader2 } from "lucide-react"
import kpuLogo from "../../../assets/branding/kpu-sulut-logo.jpg"
import kpuOffice from "../../../assets/branding/kpu-sulut-office.png"
import "../../../styles/login.css"

export function LoadingScreen({
  theme = "light",
  message = "Memuat Sistem Informasi PTP-KPU...",
  subMessage = "Menyiapkan portal layanan kedinasan KPU Provinsi Sulawesi Utara",
  useLoginBackdrop = false,
}: {
  theme?: "light" | "dark"
  message?: string
  subMessage?: string
  useLoginBackdrop?: boolean
}) {
  const isDark = theme === "dark"

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-4 transition-colors duration-300 ${
        useLoginBackdrop
          ? "bg-[#3f0a0a] text-white"
          : isDark
          ? "bg-[#0b1329] text-white"
          : "bg-slate-50 text-slate-900"
      }`}
    >
      {/* Background Login Page (Presisi identik 1:1 dengan .login-backdrop di login.css) */}
      {useLoginBackdrop ? (
        <div className="login-backdrop" aria-hidden="true">
          <img src={kpuOffice} alt="" fetchPriority="high" />
        </div>
      ) : (
        /* Radial Glow untuk Mode Dashboard */
        <div
          className={`absolute inset-0 pointer-events-none opacity-40 blur-3xl ${
            isDark
              ? "bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.25)_0%,transparent_70%)]"
              : "bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.15)_0%,transparent_70%)]"
          }`}
        />
      )}

      {/* Konten Loading Card */}
      <div
        className={`relative z-10 flex flex-col items-center max-w-sm text-center space-y-6 p-7 sm:p-8 rounded-3xl border transition-all ${
          useLoginBackdrop
            ? "bg-[#1f0507]/80 border-white/15 backdrop-blur-md shadow-2xl text-white shadow-black/60"
            : isDark
            ? "bg-[#111827]/85 border-white/10 backdrop-blur-md shadow-2xl text-white"
            : "bg-white/90 border-slate-200 backdrop-blur-md shadow-xl text-slate-900"
        }`}
      >
        {/* Seal Logo with pulsing border */}
        <div className="relative">
          <div className="absolute -inset-2 rounded-full bg-red-600/30 blur-md animate-pulse" />
          <div className="relative w-24 h-24 rounded-full overflow-hidden shadow-2xl border-2 border-red-600/50 bg-white">
            <img
              src={kpuLogo}
              alt="Logo KPU Sulawesi Utara"
              className="absolute w-[122%] h-auto max-w-none left-[-11%] top-[-9.5%]"
            />
          </div>
        </div>

        {/* Branding & Status text */}
        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-red-500 dark:text-red-400 block">
            PTP-KPU SULAWESI UTARA
          </span>
          <h2 className="text-lg font-bold tracking-tight">
            {message}
          </h2>
          <p
            className={`text-xs ${
              useLoginBackdrop ? "text-slate-300" : isDark ? "text-slate-400" : "text-slate-500"
            }`}
          >
            {subMessage}
          </p>
        </div>

        {/* Loading Spinner & Progress bar */}
        <div className="flex flex-col items-center gap-3 pt-2 w-48">
          <div className="w-full h-1.5 rounded-full overflow-hidden bg-white/20 dark:bg-white/10">
            <div className="h-full bg-red-600 rounded-full animate-[progress_1.4s_ease-in-out_infinite]" />
          </div>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-300 dark:text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" />
            <span>Mohon tunggu sejenak</span>
          </div>
        </div>
      </div>
    </div>
  )
}
