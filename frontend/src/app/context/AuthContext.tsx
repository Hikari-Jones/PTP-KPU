import React, { createContext, useContext, useState, useEffect } from "react"

export interface UserProfile {
  name: string
  nip: string
  email: string
  role: "Admin" | "Operator" | "User"
  jabatan: string
  subbagian: string
}

interface AuthContextType {
  isAuthenticated: boolean
  userRole: string
  currentUser: UserProfile | null
  login: (nip: string, pass: string) => { success: boolean; error?: string }
  logout: () => void
}

const DEFAULT_USERS: UserProfile[] = [
  {
    name: "Admin KPU Sulut",
    nip: "198507182020031001",
    email: "admin@kpu.go.id",
    role: "Admin",
    jabatan: "Administrator Sistem",
    subbagian: "RENDATIN (Perencanaan, Data dan Informasi)",
  },
  {
    name: "Ahmad Kurniawan",
    nip: "199208052021011002",
    email: "ahmad.kurniawan@kpu.go.id",
    role: "Operator",
    jabatan: "Staf Bidang Teknis Penyelenggaraan",
    subbagian: "Teknis Penyelenggaraan Pemilu",
  },
]

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem("ptp_kpu_user")
    if (!saved) return null
    const profile = JSON.parse(saved) as UserProfile
    return profile.subbagian?.startsWith("PERDATIN")
      ? { ...profile, subbagian: profile.subbagian.replace("PERDATIN", "RENDATIN") }
      : profile
  })

  const isAuthenticated = !!currentUser
  const userRole = currentUser?.role || ""

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("ptp_kpu_user", JSON.stringify(currentUser))
    } else {
      localStorage.removeItem("ptp_kpu_user")
    }
  }, [currentUser])

  const login = (nip: string, pass: string) => {
    const trimmedNip = nip.trim()
    
    // Check known demo users first
    const matchedUser = DEFAULT_USERS.find((u) => u.nip === trimmedNip)
    
    if (matchedUser) {
      // Validate password for known users
      if ((matchedUser.role === "Admin" && pass === "admin123") ||
          (matchedUser.role === "Operator" && (pass === "123456" || pass === "••••••••" || pass.length >= 4))) {
        setCurrentUser(matchedUser)
        return { success: true }
      } else {
        return { success: false, error: "NIP/Kata Sandi Tidak Valid" }
      }
    }

    // Generic fallback for numeric NIP values
    if (/^\d{6,}$/.test(trimmedNip) && pass.length >= 6) {
      const newUser: UserProfile = {
        name: trimmedNip.slice(-4).padStart(8, "KPU"),
        nip: trimmedNip,
        email: `${trimmedNip}@kpu.go.id`,
        role: "Operator",
        jabatan: "Staf Penyelenggara KPU",
        subbagian: "Sekretariat KPU Sulut",
      }
      setCurrentUser(newUser)
      return { success: true }
    }

    return { success: false, error: "NIP/Kata Sandi Tidak Valid" }
  }

  const logout = () => {
    setCurrentUser(null)
    localStorage.removeItem("ptp_kpu_user")
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, userRole, currentUser, login, logout }}>
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
