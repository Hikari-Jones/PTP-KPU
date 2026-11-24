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

/**
 * Sub bagian yang berwenang mengelola (menambah/mengubah/menghapus) data tiap modul.
 * Sub bagian lain tetap dapat membuka modul tersebut dalam mode baca saja.
 */
const MODULE_EDITORS: Record<ModuleKey, string[]> = {
  anggaran: ["Keuangan", "RENDATIN"],
  surat: ["UMLOG", "Umum"],
}

export function canEditModule(user: UserProfile | null, module: ModuleKey): boolean {
  if (!user) return false
  const roleLower = (user.role || "").toLowerCase()
  const sub = (user.subbagian || "").toLowerCase()
  const isAdminSystem = (roleLower === "admin" || roleLower === "administrator") && (!user.subbagian || sub.includes("admin"))
  if (isAdminSystem) return true
  if (module === "anggaran") {
    // Only System Admin, RENDATIN, or Keuangan may edit financial data.
    // Kabag of other subsections (SDM, Teknis, Hukum, UMLOG) who have role "admin" are strictly READ-ONLY.
    return ["keuangan", "rendatin", "perencanaan"].some((key) => sub.includes(key))
  }
  return MODULE_EDITORS[module].some((key) => sub.includes(key.toLowerCase()))
}

export function isRendatinOrKeuanganUser(user: UserProfile | null): boolean {
  if (!user) return false
  const roleLower = (user.role || "").toLowerCase()
  const sub = (user.subbagian || "").toLowerCase()
  const isAdminSystem = (roleLower === "admin" || roleLower === "administrator") && (!user.subbagian || sub.includes("admin"))
  if (isAdminSystem) return true
  return ["keuangan", "rendatin", "perencanaan"].some((k) => sub.includes(k))
}

interface AuthContextType {
  isAuthenticated: boolean
  isLoadingAuth: boolean
  isLoggingIn: boolean
  userRole: string
  currentUser: UserProfile | null
  canEdit: (module: ModuleKey) => boolean
  isRendatinOrKeuangan: boolean
  login: (nip: string, pass: string) => Promise<{ success: boolean; error?: string }>
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

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoadingAuth, isLoggingIn, userRole, currentUser, canEdit, isRendatinOrKeuangan, login, logout }}>
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
