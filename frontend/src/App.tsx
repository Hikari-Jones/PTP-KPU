import { useState, useEffect, lazy, Suspense } from "react"
import { Menu, Sun, Moon, CheckCircle2, X } from "lucide-react"
import { AuthProvider, useAuth } from "./app/context/AuthContext"
import { LoginForm } from "./app/components/auth/LoginForm"
import { Sidebar } from "./app/components/layout/Sidebar"
import { KiranaChatbot } from "./app/components/chatbot/KiranaChatbot"

// Views are loaded lazily (see below)
import { ReadOnlyBanner } from "./app/components/ui/read-only"
import { LoadingScreen } from "./app/components/ui/LoadingScreen"
import { GlobalActivity } from "./app/components/ui/GlobalActivity"
import { showToast } from "./services/activity"

// Each screen is downloaded the first time it is opened, keeping the first page load small.
const DashboardView = lazy(() => import("./app/components/views/DashboardView").then((m) => ({ default: m.DashboardView })))
const RealisasiAnggaranView = lazy(() => import("./app/components/RealisasiAnggaran/RealisasiAnggaranView").then((m) => ({ default: m.RealisasiAnggaranView })))
const TahunAnggaranView = lazy(() => import("./app/components/RealisasiAnggaran/TahunAnggaranView").then((m) => ({ default: m.TahunAnggaranView })))
import { SATKER_MENU_ENABLED } from "./config/features"
const SatkerView = lazy(() => import("./app/components/RealisasiAnggaran/SatkerView").then((m) => ({ default: m.SatkerView })))
const AkunAnggaranView = lazy(() => import("./app/components/RealisasiAnggaran/AkunAnggaranView").then((m) => ({ default: m.AkunAnggaranView })))
const PaguAnggaranView = lazy(() => import("./app/components/RealisasiAnggaran/PaguAnggaranView").then((m) => ({ default: m.PaguAnggaranView })))
const InputRealisasiView = lazy(() => import("./app/components/RealisasiAnggaran/InputRealisasiView").then((m) => ({ default: m.InputRealisasiView })))
const LaporanBulananView = lazy(() => import("./app/components/RealisasiAnggaran/LaporanBulananView").then((m) => ({ default: m.LaporanBulananView })))
const SuratView = lazy(() => import("./app/components/views/SuratView").then((m) => ({ default: m.SuratView })))
const SuratMenyuratModule = lazy(() => import("./app/components/SuratMenyurat/SuratMenyuratModule").then((m) => ({ default: m.SuratMenyuratModule })))
const ArsipView = lazy(() => import("./app/components/views/ArsipView").then((m) => ({ default: m.ArsipView })))
const PengaturanView = lazy(() => import("./app/components/views/PengaturanView").then((m) => ({ default: m.PengaturanView })))
const FAQView = lazy(() => import("./app/components/views/FAQView").then((m) => ({ default: m.FAQView })))
const ProfilView = lazy(() => import("./app/components/views/ProfilView").then((m) => ({ default: m.ProfilView })))
const AdminDashboardView = lazy(() => import("./app/components/views/AdminDashboardView").then((m) => ({ default: m.AdminDashboardView })))
const KelolaUserView = lazy(() => import("./app/components/views/KelolaUserView").then((m) => ({ default: m.KelolaUserView })))
const BugReportView = lazy(() => import("./app/components/views/BugReportView").then((m) => ({ default: m.BugReportView })))
const ArsipAdminView = lazy(() => import("./app/components/views/ArsipAdminView").then((m) => ({ default: m.ArsipAdminView })))

function MainLayout() {
  const { isAuthenticated, isLoadingAuth, isLoggingIn, canEdit, currentUser, isRendatinOrKeuangan, canViewBudget } = useAuth()

  // Theme state: default is "light"
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("ptp_kpu_theme") as "light" | "dark") || "light"
  })

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeMenu, setActiveMenu] = useState("dashboard")

  // Tampilkan notifikasi saat berhasil masuk (login)
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      const isJustLoggedIn = sessionStorage.getItem("ptp_just_logged_in")
      if (isJustLoggedIn) {
        sessionStorage.removeItem("ptp_just_logged_in")
        showToast("success", `Berhasil masuk ke sistem sebagai ${currentUser.name || "Pengguna"}`)
      }
    }
  }, [isAuthenticated, currentUser])

  useEffect(() => {
    if (!mobileMenuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [mobileMenuOpen])

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    if (theme === "dark") {
      document.documentElement.classList.add("dark")
      document.documentElement.classList.remove("light")
    } else {
      document.documentElement.classList.add("light")
      document.documentElement.classList.remove("dark")
    }
  }, [theme])

  const toggleTheme = (newTheme?: "light" | "dark") => {
    const next = newTheme || (theme === "light" ? "dark" : "light")
    setTheme(next)
    localStorage.setItem("ptp_kpu_theme", next)
  }

  if (isLoadingAuth) {
    // Jika user sudah memiliki sesi/token tersimpan saat refresh di dalam web, gunakan Loading Screen Tahap Dua (Dashboard)
    const hasExistingSession = Boolean(localStorage.getItem("ptp_kpu_token"))

    return (
      <LoadingScreen
        theme={theme}
        useLoginBackdrop={!hasExistingSession}
        message={hasExistingSession ? "Memuat Dashboard PTP-KPU..." : "Memuat Sistem Informasi PTP-KPU..."}
        subMessage={
          hasExistingSession
            ? "Menyiapkan data kedinasan dan sesi pengguna KPU Sulawesi Utara"
            : "Menyiapkan portal layanan kedinasan KPU Provinsi Sulawesi Utara"
        }
      />
    )
  }

  if (isLoggingIn) {
    return (
      <LoadingScreen
        theme={theme}
        message="Memverifikasi & Menyiapkan Akun..."
        subMessage="Mengalihkan ke Dashboard Utama PTP-KPU Sulawesi Utara"
      />
    )
  }

  if (!isAuthenticated) {
    return <LoginForm theme={theme} onToggleTheme={() => toggleTheme()} />
  }

  const isDark = theme === "dark"
  const renderContent = () => {
    switch (activeMenu) {
      case "dashboard":
        return <DashboardView theme={theme} />
      case "realisasi_anggaran":
      case "realization-summary":
        if (!canViewBudget) return <DashboardView theme={theme} />
        return <RealisasiAnggaranView theme={theme} subTab="ringkasan" onNavigate={(tab) => setActiveMenu(tab)} />
      case "realization-ta":
        if (!canViewBudget) return <DashboardView theme={theme} />
        if (!isRendatinOrKeuangan) {
          return <RealisasiAnggaranView theme={theme} subTab="ringkasan" onNavigate={(tab) => setActiveMenu(tab)} />
        }
        return <TahunAnggaranView theme={theme} onNavigate={(tab) => setActiveMenu(tab)} />
      case "realization-satker":
        if (!canViewBudget) return <DashboardView theme={theme} />
        if (!SATKER_MENU_ENABLED || !isRendatinOrKeuangan) return <RealisasiAnggaranView theme={theme} subTab="ringkasan" onNavigate={(tab) => setActiveMenu(tab)} />
        return <SatkerView theme={theme} onNavigate={(tab) => setActiveMenu(tab)} />
      case "realization-akun":
        if (!canViewBudget) return <DashboardView theme={theme} />
        if (!isRendatinOrKeuangan) {
          return <RealisasiAnggaranView theme={theme} subTab="ringkasan" onNavigate={(tab) => setActiveMenu(tab)} />
        }
        return <AkunAnggaranView theme={theme} onNavigate={(tab) => setActiveMenu(tab)} />
      case "realization-pagu":
        if (!canViewBudget) return <DashboardView theme={theme} />
        return <PaguAnggaranView theme={theme} onNavigate={(tab) => setActiveMenu(tab)} />
      case "realization-input":
        if (!canViewBudget) return <DashboardView theme={theme} />
        if (!isRendatinOrKeuangan) {
          return <RealisasiAnggaranView theme={theme} subTab="ringkasan" onNavigate={(tab) => setActiveMenu(tab)} />
        }
        return <InputRealisasiView theme={theme} />
      case "realization-reports":
        if (!canViewBudget) return <DashboardView theme={theme} />
        return <LaporanBulananView theme={theme} />
      case "surat":
      case "surat-summary":
        return <SuratView key="surat-overview" theme={theme} subTab="overview" onNavigate={(tab) => setActiveMenu(tab)} />
      case "surat-keluar":
        return <SuratView key="surat-keluar" theme={theme} subTab="surat-keluar" onNavigate={(tab) => setActiveMenu(tab)} />
      case "surat-masuk":
      case "surat-alur":
        return <SuratMenyuratModule key="surat-masuk" theme={theme} subTab="masuk" onNavigate={(tab) => setActiveMenu(tab)} />
      case "surat-tugas":
        return <SuratView key="surat-tugas" theme={theme} subTab="surat-tugas" onNavigate={(tab) => setActiveMenu(tab)} />
      case "surat-klasifikasi":
        return <SuratView key="surat-klasifikasi" theme={theme} subTab="klasifikasi" onNavigate={(tab) => setActiveMenu(tab)} />
      case "arsip":
        return <ArsipView theme={theme} />
      case "pengaturan":
        return <PengaturanView theme={theme} onToggleTheme={() => toggleTheme()} />
      case "faq":
        return <FAQView theme={theme} />
      case "profil":
        return <ProfilView theme={theme} />

      // Admin views
      case "admin_dashboard":
        return <AdminDashboardView theme={theme} />
      case "kelola_user":
        return <KelolaUserView theme={theme} />
      case "bug_report":
        return <BugReportView theme={theme} />
      case "arsip_admin":
        return <ArsipAdminView theme={theme} />

      default:
        return <DashboardView theme={theme} />
    }
  }

  return (
    <div
      className={`app-shell flex h-dvh font-sans overflow-hidden transition-colors duration-300 ${isDark ? "bg-transparent text-slate-100" : "bg-slate-100 text-slate-900"
        }`}
    >
      {/* Sidebar Navigation */}
      {mobileMenuOpen && <button className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" aria-label="Tutup navigasi" onClick={() => setMobileMenuOpen(false)} />}
      <div className={`app-navigation ${mobileMenuOpen ? "is-open" : ""}`}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        activeMenu={activeMenu}
        onSelectMenu={(id: string) => { setActiveMenu(id); setMobileMenuOpen(false) }}
        theme={theme}
      />
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Tombol Menu Navigasi Mobile di Pojok Kiri Atas (Tetap Mengambang/Floating Saat Scroll) */}
        <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-20 lg:hidden">
          <button
            type="button"
            onClick={() => { setSidebarCollapsed(false); setMobileMenuOpen(!mobileMenuOpen) }}
            aria-label="Buka navigasi"
            title="Buka Menu Navigasi"
            className={`p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer shadow-xs active:scale-95 backdrop-blur-md ${
              isDark
                ? "bg-[#1e293b]/80 border-white/10 text-slate-200 hover:bg-[#1e293b] hover:text-white shadow-black/30"
                : "bg-white/80 border-slate-200 text-slate-700 hover:bg-white hover:text-slate-900 shadow-slate-200/50"
            }`}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* Tombol Switch Mode Gelap / Terang di Pojok Kanan Atas */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
          <button
            type="button"
            onClick={() => toggleTheme()}
            aria-label={isDark ? "Beralih ke mode terang" : "Beralih ke mode gelap"}
            title={isDark ? "Beralih ke mode terang" : "Beralih ke mode gelap"}
            className={`p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer shadow-xs active:scale-95 backdrop-blur-md ${
              isDark
                ? "bg-[#1e293b]/80 border-white/10 text-amber-400 hover:bg-[#1e293b] hover:text-amber-300 shadow-black/30"
                : "bg-white/80 border-slate-200 text-slate-700 hover:bg-white hover:text-slate-900 shadow-slate-200/50"
            }`}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        {/* Dynamic Content Area */}
        <main id="main-content" className="app-content flex-1 overflow-y-auto px-4 pt-16 pb-6 sm:px-6 sm:pt-16 lg:pt-8 xl:px-8 xl:pt-10">
          <div className="max-w-[1440px] mx-auto min-w-0">
            {(activeMenu === "realisasi_anggaran" || activeMenu.startsWith("realization-")) && !canEdit("anggaran") && (
              <div className="mb-5">
                <ReadOnlyBanner theme={theme} modul="realisasi anggaran" pengelola="Sub Bagian Keuangan dan Sub Bagian Perencanaan, Data dan Informasi (RENDATIN)" />
              </div>
            )}
            <Suspense
              fallback={
                <div role="status" className="flex items-center justify-center gap-2 py-24 text-xs font-semibold text-slate-500">
                  <span className="h-4 w-4 rounded-full border-2 border-red-600 border-t-transparent animate-spin" />
                  Memuat halaman…
                </div>
              }
            >
              {renderContent()}
            </Suspense>
          </div>
        </main>
      </div>

      {/* Chatbot KIRANA Agent (Floating Widget) */}
      <KiranaChatbot key={currentUser?.nip} userKey={currentUser?.nip || "anonymous"} theme={theme} />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <MainLayout />
      <GlobalActivity />
    </AuthProvider>
  )
}
