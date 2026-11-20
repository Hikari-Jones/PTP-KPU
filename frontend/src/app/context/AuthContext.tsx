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
  if (user.role === "Admin") return true
  const sub = user.subbagian.toLowerCase()
  return MODULE_EDITORS[module].some((key) => sub.includes(key.toLowerCase()))
}

interface AuthContextType {
  isAuthenticated: boolean
  userRole: string
  currentUser: UserProfile | null
  canEdit: (module: ModuleKey) => boolean
  login: (nip: string, pass: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem("ptp_kpu_user")
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (localStorage.getItem("ptp_kpu_token")) {
      authApi.getMe().then(user => {
        const profile = user as UserProfile
        setCurrentUser(profile)
        try {
          localStorage.setItem("ptp_kpu_user", JSON.stringify(profile))
        } catch {
          // quota
        }
      }).catch(() => {
        localStorage.removeItem("ptp_kpu_token")
        localStorage.removeItem("ptp_kpu_user")
        setCurrentUser(null)
      })
    } else {
      localStorage.removeItem("ptp_kpu_user")
      setCurrentUser(null)
    }
  }, [])

  const isAuthenticated = !!currentUser
  const userRole = currentUser?.role || ""
  const canEdit = (module: ModuleKey) => canEditModule(currentUser, module)

  const login = async (nip: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await authApi.login({ nip: nip.trim(), password: pass })
      localStorage.setItem("ptp_kpu_token", result.access_token)
      const userProfile = result.user as UserProfile
      localStorage.setItem("ptp_kpu_user", JSON.stringify(userProfile))
      setCurrentUser(userProfile)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Login gagal" }
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

  return (
    <AuthContext.Provider value={{ isAuthenticated, userRole, currentUser, canEdit, login, logout }}>
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
