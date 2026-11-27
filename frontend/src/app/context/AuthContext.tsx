import React, { createContext, useContext, useState, useEffect } from "react"
import { request } from "../../services/operations"
import { authApi } from "../../services/api"

export interface UserProfile {
  id_pegawai?: number
  name: string
  nip: string
  /** Not stored for employees yet; null when unknown (never invented). */
  email?: string | null
  role: "Admin" | "Pegawai" | "Operator"
  jabatan: string
  subbagian: string
  id_bagian?: number | null
}

export type ModuleKey = "anggaran" | "surat"

export function isFullBudgetUser(user: UserProfile | null): boolean {
  if (!user) return false
  const roleLower = (user.role || "").trim().toLowerCase()
  const sub = (user.subbagian || "").trim().toLowerCase()
  const isAdminSystem =
    (roleLower === "admin" || roleLower === "administrator") &&
    (!sub || sub.includes("admin"))
  if (isAdminSystem) return true

  // Matches backend app/core/auth.py is_rendatin_or_keuangan:
  // Subbagian RENDATIN (BAG-02) & Subbagian Keuangan (BAG-06), excluding non-finance UMLOG.
  if (sub.includes("bag-02") || sub.includes("bag-06")) return true
  if (sub.includes("rendatin") || sub.includes("perencanaan")) return true
  if (sub.includes("keuangan") && !sub.includes("umlog") && !sub.includes("umum dan logistik")) return true
  return false
}

export function canViewBudgetFeature(user: UserProfile | null): boolean {
  return !!user
}

export function canEditModule(user: UserProfile | null, module: ModuleKey): boolean {
  if (!user) return false
  if (module === "surat") {
    // Surat menyurat terbuka untuk semua pegawai (read & write)
    return true
  }
  if (module === "anggaran") {
    return isFullBudgetUser(user)
  }
  return false
}

export function isRendatinOrKeuanganUser(user: UserProfile | null): boolean {
  return isFullBudgetUser(user)
}

interface AuthContextType {
  isAuthenticated: boolean
  isLoadingAuth: boolean
  isLoggingIn: boolean
  userRole: string
  currentUser: UserProfile | null
  canEdit: (module: ModuleKey) => boolean
  isRendatinOrKeuangan: boolean
  canViewBudget: boolean
  login: (nip: string, pass: string) => Promise<{ success: boolean; error?: string }>
  updateProfile: (payload: { nama: string; nip: string; password?: string }) => Promise<UserProfile>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true)
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem("ptp_kpu_user")
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    const initAuth = async () => {
      // Tampilkan loading screen awal minimal 900ms agar user mendapat feedback transisi yang elegan
      const minDelay = new Promise(resolve => setTimeout(resolve, 900))

      if (localStorage.getItem("ptp_kpu_token")) {
        try {
          const user = await authApi.getMe()
          const profile = user as UserProfile
          setCurrentUser(profile)
          localStorage.setItem("ptp_kpu_user", JSON.stringify(profile))
        } catch {
          localStorage.removeItem("ptp_kpu_token")
          localStorage.removeItem("ptp_kpu_user")
          setCurrentUser(null)
        }
      } else {
        localStorage.removeItem("ptp_kpu_user")
        setCurrentUser(null)
      }

      await minDelay
      setIsLoadingAuth(false)
    }

    void initAuth()
  }, [])

  const isAuthenticated = !!currentUser
  const userRole = currentUser?.role || ""
  const canEdit = (module: ModuleKey) => canEditModule(currentUser, module)

  const login = async (nip: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoggingIn(true)
    try {
      const result = await authApi.login({ nip: nip.trim(), password: pass })
      localStorage.setItem("ptp_kpu_token", result.access_token)
      const userProfile = result.user as UserProfile
      localStorage.setItem("ptp_kpu_user", JSON.stringify(userProfile))
      localStorage.removeItem("ptp_pending_request")
      localStorage.removeItem("ptp_login_mode")
      // Tandai flag bahwa user baru saja berhasil login untuk menampilkan notifikasi login
      sessionStorage.setItem("ptp_just_logged_in", "true")
      // Delay sejenak (800ms) untuk loading screen masuk dashboard
      await new Promise(resolve => setTimeout(resolve, 800))
      setCurrentUser(userProfile)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Login gagal" }
    } finally {
      setIsLoggingIn(false)
    }
  }

  const updateProfile = async (payload: { nama: string; nip: string; password?: string }): Promise<UserProfile> => {
    const updated = await authApi.updateMe(payload)
    const profile = updated as UserProfile
    setCurrentUser(profile)
    localStorage.setItem("ptp_kpu_user", JSON.stringify(profile))
    return profile
  }

  const logout = () => {
    void request('/auth/logout', 'POST').then(() => {
      setCurrentUser(null)
      localStorage.removeItem("ptp_kpu_user")
      localStorage.removeItem("ptp_kpu_token")
    }).catch(() => {
      setCurrentUser(null)
      localStorage.removeItem("ptp_kpu_user")
      localStorage.removeItem("ptp_kpu_token")
    })
  }

  const isRendatinOrKeuangan = isRendatinOrKeuanganUser(currentUser)
  const canViewBudget = canViewBudgetFeature(currentUser)

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoadingAuth, isLoggingIn, userRole, currentUser, canEdit, isRendatinOrKeuangan, canViewBudget, login, updateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
