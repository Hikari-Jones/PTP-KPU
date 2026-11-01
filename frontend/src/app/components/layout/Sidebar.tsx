import { useState, useEffect } from "react"
import {
  LayoutDashboard,
  FileCheck,
  Mail,
  Settings,
  HelpCircle,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Shield,
  Users,
  Bug,
  Database,
  LayoutGrid,
  Archive
} from "lucide-react"
import { useAuth } from "../../context/AuthContext"
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar"

export interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  activeMenu: string
  onSelectMenu: (id: string) => void
  theme?: "light" | "dark"
}

export function Sidebar({ collapsed, onToggleCollapse, activeMenu, onSelectMenu, theme = "light" }: SidebarProps) {
  const { currentUser, userRole, logout } = useAuth()

  // Realisasi Anggaran submenus state
  const isRealisasiActive =
    activeMenu === "realisasi_anggaran" ||
    activeMenu.startsWith("realization-")

  const [realisasiExpanded, setRealisasiExpanded] = useState(isRealisasiActive)

  // Surat submenus state
  const isSuratActive =
    activeMenu === "surat" ||
    activeMenu.startsWith("surat-")

  const [suratExpanded, setSuratExpanded] = useState(isSuratActive)

  // Keep expanded state if navigating into active sections
  useEffect(() => {
    if (isRealisasiActive) {
      setRealisasiExpanded(true)
    }
  }, [isRealisasiActive])

  useEffect(() => {
    if (isSuratActive) {
      setSuratExpanded(true)
    }
  }, [isSuratActive])

  const realisasiSubmenus = [
    { id: "realization-summary", label: "Overview" },
    { id: "realization-ta", label: "Tahun Anggaran" },
    { id: "realization-satker", label: "Satker" },
    { id: "realization-akun", label: "Akun Anggaran" },
    { id: "realization-pagu", label: "Pagu Anggaran" },
    { id: "realization-input", label: "Input Realisasi" },
    { id: "realization-reports", label: "Laporan Bulanan" },
  ]

  const suratSubmenus = [
    { id: "surat-summary", label: "Overview" },
    { id: "surat-keluar", label: "Surat Keluar" },
    { id: "surat-tugas", label: "Surat Tugas" },
    { id: "surat-klasifikasi", label: "Kode Klasifikasi" },
    { id: "surat-alur", label: "Alur Disposisi & TTE" },
  ]

  const adminMenu = [
    { id: "admin_dashboard", label: "Dashboard Admin", icon: LayoutGrid },
    { id: "kelola_user", label: "Kelola User", icon: Users },
    { id: "bug_report", label: "Bug Report", icon: Bug },
    { id: "arsip_admin", label: "Arsip Admin", icon: Database },
  ]

  const isDark = theme === "dark"
  const initials = currentUser?.name
    ? currentUser.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
    : "KP"

  const handleRealisasiParentClick = () => {
    if (collapsed) {
      onToggleCollapse()
      setRealisasiExpanded(true)
    } else {
      setRealisasiExpanded((prev) => !prev)
    }
  }

  const handleSuratParentClick = () => {
    if (collapsed) {
      onToggleCollapse()
      setSuratExpanded(true)
    } else {
      setSuratExpanded((prev) => !prev)
    }
  }

  return (
    <aside
      className={`relative flex flex-col justify-between h-screen transition-all duration-300 z-20 shrink-0 ${collapsed ? "w-20" : "w-64"
        } ${isDark
          ? "bg-[#0f172a]/95 border-r border-white/10 text-gray-200 backdrop-blur-md"
          : "bg-white border-r border-slate-200 text-slate-700 shadow-sm"
        }`}
    >
      {/* Header / Logo */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div
          className={`flex items-center h-16 ${collapsed ? "justify-center p-4" : "justify-between p-4"
            } ${isDark ? "border-b-2 border-red-600/25" : "border-b-2 border-red-600/15"}`}
        >
          {!collapsed && (
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 rounded-md bg-red-700 flex items-center justify-center font-black text-white text-sm shrink-0 border border-red-500/40 tracking-wide">
                KPU
              </div>
              <div className="flex flex-col truncate">
                <span className={`font-bold text-sm leading-tight truncate tracking-tight ${isDark ? "text-gray-100" : "text-slate-900"}`}>
                  KPU Sulut
                </span>
                <span className={`text-[10px] font-semibold uppercase tracking-wider truncate ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                  Sistem Informasi PTP
                </span>
              </div>
            </div>
          )}

          <button
            onClick={onToggleCollapse}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isDark
                ? "hover:bg-[#1e293b] text-red-400/70 hover:text-red-400"
                : "hover:bg-slate-100 text-red-600/60 hover:text-red-600"
              }`}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Section */}
        <div className="p-3 space-y-6">
          {/* Menu Utama */}
          <div>
            {!collapsed && (
              <div className={`px-3 mb-2 text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-gray-500" : "text-slate-400"
                }`}>
                Menu Utama
              </div>
            )}
            <nav className="space-y-1">
              {/* Dashboard */}
              <button
                onClick={() => onSelectMenu("dashboard")}
                title={collapsed ? "Dashboard" : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${activeMenu === "dashboard"
                    ? "bg-red-600 text-white"
                    : isDark
                      ? "text-gray-400 hover:text-gray-100 hover:bg-[#131b2e]"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  } ${collapsed ? "justify-center px-0" : ""}`}
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">Dashboard</span>}
              </button>

              {/* Realisasi Anggaran Parent Menu (Expandable) */}
              <div>
                <button
                  onClick={handleRealisasiParentClick}
                  title={collapsed ? "Realisasi Anggaran" : undefined}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${isRealisasiActive
                      ? isDark
                        ? "bg-[#162035] text-red-400 font-semibold border border-red-500/20"
                        : "bg-red-50 text-red-700 font-semibold border border-red-200"
                      : isDark
                        ? "text-gray-400 hover:text-gray-100 hover:bg-[#131b2e]"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    } ${collapsed ? "justify-center px-0" : ""}`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <FileCheck className="w-4 h-4 shrink-0" />
                    {!collapsed && <span className="truncate">Realisasi Anggaran</span>}
                  </div>
                  {!collapsed && (
                    <ChevronDown
                      className={`w-4 h-4 shrink-0 transition-transform duration-200 ${realisasiExpanded ? "rotate-180 text-red-500" : "opacity-60"
                        }`}
                    />
                  )}
                </button>

                {/* Submenus */}
                {!collapsed && realisasiExpanded && (
                  <div className={`mt-1 ml-4 pl-3 space-y-1 border-l-2 ${isDark ? "border-red-500/15" : "border-red-100"}`}>
                    {realisasiSubmenus.map((sub) => {
                      const isSubActive =
                        activeMenu === sub.id ||
                        (activeMenu === "realisasi_anggaran" && sub.id === "realization-summary")
                      return (
                        <button
                          key={sub.id}
                          onClick={() => onSelectMenu(sub.id)}
                          className={`w-full flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${isSubActive
                              ? "bg-red-600 text-white font-bold"
                              : isDark
                                ? "text-gray-400 hover:text-gray-100 hover:bg-[#131b2e]"
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                            }`}
                        >
                          <span>{sub.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Surat Parent Menu (Expandable) */}
              <div>
                <button
                  onClick={handleSuratParentClick}
                  title={collapsed ? "Surat" : undefined}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${isSuratActive
                      ? isDark
                        ? "bg-[#162035] text-red-400 font-semibold border border-red-500/20"
                        : "bg-red-50 text-red-700 font-semibold border border-red-200"
                      : isDark
                        ? "text-gray-400 hover:text-gray-100 hover:bg-[#131b2e]"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    } ${collapsed ? "justify-center px-0" : ""}`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <Mail className="w-4 h-4 shrink-0" />
                    {!collapsed && <span className="truncate">Surat</span>}
                  </div>
                  {!collapsed && (
                    <ChevronDown
                      className={`w-4 h-4 shrink-0 transition-transform duration-200 ${suratExpanded ? "rotate-180 text-red-500" : "opacity-60"
                        }`}
                    />
                  )}
                </button>

                {/* Surat Submenus */}
                {!collapsed && suratExpanded && (
                  <div className={`mt-1 ml-4 pl-3 space-y-1 border-l-2 ${isDark ? "border-red-500/15" : "border-red-100"}`}>
                    {suratSubmenus.map((sub) => {
                      const isSubActive =
                        activeMenu === sub.id ||
                        (activeMenu === "surat" && sub.id === "surat-summary")
                      return (
                        <button
                          key={sub.id}
                          onClick={() => onSelectMenu(sub.id)}
                          className={`w-full flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${isSubActive
                              ? "bg-red-600 text-white font-bold"
                              : isDark
                                ? "text-gray-400 hover:text-gray-100 hover:bg-[#131b2e]"
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                            }`}
                        >
                          <span>{sub.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Arsip Data */}
              <button
                onClick={() => onSelectMenu("arsip")}
                title={collapsed ? "Arsip Data" : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  activeMenu === "arsip"
                    ? "bg-red-600 text-white"
                    : isDark
                    ? "text-gray-400 hover:text-gray-100 hover:bg-[#131b2e]"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                } ${collapsed ? "justify-center px-0" : ""}`}
              >
                <Archive className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">Arsip Data</span>}
              </button>

              {/* Pengaturan */}
              <button
                onClick={() => onSelectMenu("pengaturan")}
                title={collapsed ? "Pengaturan" : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${activeMenu === "pengaturan"
                    ? "bg-red-600 text-white"
                    : isDark
                      ? "text-gray-400 hover:text-gray-100 hover:bg-[#131b2e]"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  } ${collapsed ? "justify-center px-0" : ""}`}
              >
                <Settings className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">Pengaturan</span>}
              </button>

              {/* FAQ */}
              <button
                onClick={() => onSelectMenu("faq")}
                title={collapsed ? "FAQ" : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${activeMenu === "faq"
                    ? "bg-red-600 text-white"
                    : isDark
                      ? "text-gray-400 hover:text-gray-100 hover:bg-[#131b2e]"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  } ${collapsed ? "justify-center px-0" : ""}`}
              >
                <HelpCircle className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">FAQ</span>}
              </button>

              {/* Laporkan Bug (Pegawai) — Admin mengakses lewat Menu Admin */}
              {userRole !== "Admin" && (
                <button
                  onClick={() => onSelectMenu("bug_report")}
                  title={collapsed ? "Laporkan Bug" : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${activeMenu === "bug_report"
                      ? "bg-red-600 text-white"
                      : isDark
                        ? "text-gray-400 hover:text-gray-100 hover:bg-[#131b2e]"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    } ${collapsed ? "justify-center px-0" : ""}`}
                >
                  <Bug className="w-4 h-4 shrink-0" />
                  {!collapsed && <span className="truncate">Laporkan Bug</span>}
                </button>
              )}

              {/* Profil */}
              <button
                onClick={() => onSelectMenu("profil")}
                title={collapsed ? "Profil" : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${activeMenu === "profil"
                    ? "bg-red-600 text-white"
                    : isDark
                      ? "text-gray-400 hover:text-gray-100 hover:bg-[#131b2e]"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  } ${collapsed ? "justify-center px-0" : ""}`}
              >
                <User className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">Profil</span>}
              </button>
            </nav>
          </div>

          {/* Admin Menu (Dynamic Routing for Role 'Admin') */}
          {userRole === "Admin" && (
            <div className="pt-2 border-t border-red-500/20">
              {!collapsed && (
                <div className="px-3 mb-2 text-[10px] font-extrabold uppercase tracking-wider text-red-500 flex items-center gap-1.5">
                  <Shield className="w-3 h-3" />
                  <span>Menu Admin</span>
                </div>
              )}
              <nav className="space-y-1">
                {adminMenu.map((item) => {
                  const Icon = item.icon
                  const isActive = activeMenu === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectMenu(item.id)}
                      title={collapsed ? item.label : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${isActive
                          ? "bg-red-700 text-white"
                          : isDark
                            ? "text-red-400/80 hover:text-red-300 hover:bg-red-950/30 border border-red-900/20"
                            : "text-red-700 hover:text-red-900 hover:bg-red-50 border border-red-200"
                        } ${collapsed ? "justify-center px-0" : ""}`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span className="truncate font-semibold">{item.label}</span>}
                    </button>
                  )
                })}
              </nav>
            </div>
          )}
        </div>
      </div>

      {/* Profile & Logout Footer */}
      <div className={`p-3 border-t-2 shrink-0 ${isDark ? "border-red-600/25" : "border-red-600/15"}`}>
        <button
          onClick={() => onSelectMenu("profil")}
          title={collapsed ? "Profil Saya" : undefined}
          className={`w-full flex items-center gap-3 p-2 rounded-xl border transition-all cursor-pointer ${collapsed ? "justify-center" : ""
            } ${isDark
              ? "bg-[#0d1424] border-[#1e293b]/60 hover:border-red-500/40 hover:bg-[#131b2e]"
              : "bg-slate-50 border-slate-200 hover:border-red-300 hover:bg-red-50/50"
            }`}
        >
          <Avatar className="w-8 h-8 shrink-0 border border-red-500/40">
            <AvatarImage src="" alt={currentUser?.name || "User"} />
            <AvatarFallback className="bg-red-600 text-white font-bold text-xs">{initials}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 overflow-hidden text-left">
              <p className={`text-xs font-semibold truncate ${isDark ? "text-gray-100" : "text-slate-800"}`}>
                {currentUser?.name || "Pengguna"}
              </p>
              <p className={`text-[10px] truncate ${isDark ? "text-gray-400" : "text-slate-500"}`}>
                {currentUser?.role === "Admin" ? "Administrator" : currentUser?.subbagian || "Staf Instansi"}
              </p>
            </div>
          )}
        </button>

        <button
          onClick={logout}
          className={`w-full mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${isDark
              ? "text-red-400 hover:text-red-300 hover:bg-red-950/30 font-semibold"
              : "text-red-600/70 hover:text-red-600 hover:bg-red-50"
            } ${collapsed ? "justify-center px-0" : ""}`}
          title="Keluar"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Keluar</span>}
        </button>
      </div>
    </aside>
  )
}

