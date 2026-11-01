import { useState, useEffect } from "react"
import { Menu } from "lucide-react"
import { AuthProvider, useAuth } from "./app/context/AuthContext"
import { LoginForm } from "./app/components/auth/LoginForm"
import { Sidebar } from "./app/components/layout/Sidebar"
import { KiranaChatbot } from "./app/components/chatbot/KiranaChatbot"

// Views
import { DashboardView } from "./app/components/views/DashboardView"
import { RealisasiAnggaranView } from "./app/components/RealisasiAnggaran/RealisasiAnggaranView"
import { TahunAnggaranView } from "./app/components/RealisasiAnggaran/TahunAnggaranView"
import { SatkerView } from "./app/components/RealisasiAnggaran/SatkerView"
import { AkunAnggaranView } from "./app/components/RealisasiAnggaran/AkunAnggaranView"
import { PaguAnggaranView } from "./app/components/RealisasiAnggaran/PaguAnggaranView"
import { InputRealisasiView } from "./app/components/RealisasiAnggaran/InputRealisasiView"
import { LaporanBulananView } from "./app/components/RealisasiAnggaran/LaporanBulananView"
import { SuratView } from "./app/components/views/SuratView"
import { SuratMenyuratModule } from "./app/components/SuratMenyurat/SuratMenyuratModule"
import { ArsipView } from "./app/components/views/ArsipView"
import { PengaturanView } from "./app/components/views/PengaturanView"
import { FAQView } from "./app/components/views/FAQView"
import { ProfilView } from "./app/components/views/ProfilView"
import { AdminDashboardView } from "./app/components/views/AdminDashboardView"
import { KelolaUserView } from "./app/components/views/KelolaUserView"
import { BugReportView } from "./app/components/views/BugReportView"
import { ArsipAdminView } from "./app/components/views/ArsipAdminView"
import { ReadOnlyBanner } from "./app/components/ui/read-only"

function MainLayout() {
  const { isAuthenticated, canEdit } = useAuth()

  // Theme state: default is "light"
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("ptp_kpu_theme") as "light" | "dark") || "light"
  })

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeMenu, setActiveMenu] = useState("dashboard")

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
        return <RealisasiAnggaranView theme={theme} subTab="ringkasan" onNavigate={(tab) => setActiveMenu(tab)} />
      case "realization-ta":
        return <TahunAnggaranView theme={theme} onNavigate={(tab) => setActiveMenu(tab)} />
      case "realization-satker":
        return <SatkerView theme={theme} onNavigate={(tab) => setActiveMenu(tab)} />
      case "realization-akun":
        return <AkunAnggaranView theme={theme} onNavigate={(tab) => setActiveMenu(tab)} />
      case "realization-pagu":
        return <PaguAnggaranView theme={theme} onNavigate={(tab) => setActiveMenu(tab)} />
      case "realization-input":
        return <InputRealisasiView theme={theme} />
      case "realization-reports":
        return <LaporanBulananView theme={theme} />
      case "surat":
      case "surat-summary":
        return <SuratView key="surat-overview" theme={theme} subTab="overview" />
      case "surat-keluar":
        return <SuratView key="surat-keluar" theme={theme} subTab="surat-keluar" />
      case "surat-tugas":
      case "surat-masuk":
        return <SuratView key="surat-tugas" theme={theme} subTab="surat-tugas" />
      case "surat-klasifikasi":
        return <SuratView key="surat-klasifikasi" theme={theme} subTab="klasifikasi" />
      case "surat-alur":
        return <SuratMenyuratModule theme={theme} subTab="ringkasan" />
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
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Dynamic Content Area */}
        <main id="main-content" className="app-content flex-1 overflow-y-auto px-4 pt-8 pb-6 sm:px-6 sm:pt-10 xl:px-8 xl:pt-12">
          <div className="max-w-[1440px] mx-auto min-w-0">
            <button
              type="button"
              onClick={() => { setSidebarCollapsed(false); setMobileMenuOpen(!mobileMenuOpen) }}
              aria-label="Buka navigasi"
              className="lg:hidden mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <Menu className="size-5" />
            </button>
            {(activeMenu === "realisasi_anggaran" || activeMenu.startsWith("realization-")) && !canEdit("anggaran") && (
              <div className="mb-5">
                <ReadOnlyBanner theme={theme} modul="realisasi anggaran" pengelola="Sub Bagian Keuangan dan Sub Bagian Perencanaan, Data dan Informasi (RENDATIN)" />
              </div>
            )}
            {renderContent()}
          </div>
        </main>
      </div>

      {/* Chatbot KIRANA Agent (Floating Widget) */}
      <KiranaChatbot theme={theme} />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  )
}
