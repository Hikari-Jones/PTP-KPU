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
  // 1. BAG-01: SDM dan Partisipasi Masyarakat
  {
    name: "Drs. Jerry Mandey, M.Si",
    nip: "197801152003121001",
    email: "jerry.mandey@kpu.go.id",
    role: "Admin",
    jabatan: "Kepala Bagian SDM dan Partisipasi Masyarakat",
    subbagian: "Subbagian SDM dan Partisipasi Masyarakat",
  },
  {
    name: "Meyke Tumengkol, S.Sos",
    nip: "198203102008011002",
    email: "meyke.tumengkol@kpu.go.id",
    role: "Operator",
    jabatan: "Kasubbag SDM dan Partisipasi Masyarakat",
    subbagian: "Subbagian SDM dan Partisipasi Masyarakat",
  },
  {
    name: "Farly Pontoh, S.Kom",
    nip: "199106142015031004",
    email: "farly.pontoh@kpu.go.id",
    role: "Operator",
    jabatan: "Staf Pengelola Kepegawaian",
    subbagian: "Subbagian SDM dan Partisipasi Masyarakat",
  },
  {
    name: "Priscilia Rompas, S.Pd",
    nip: "199508192020122005",
    email: "priscilia.rompas@kpu.go.id",
    role: "Operator",
    jabatan: "Staf Sosialisasi Pendidikan Pemilih",
    subbagian: "Subbagian SDM dan Partisipasi Masyarakat",
  },

  // 2. BAG-02: RENDATIN
  {
    name: "Ir. Ronny Lumempow, MT",
    nip: "197604122002121001",
    email: "ronny.lumempow@kpu.go.id",
    role: "Admin",
    jabatan: "Kepala Bagian Perencanaan, Data dan Informasi",
    subbagian: "RENDATIN (Perencanaan, Data dan Informasi)",
  },
  {
    name: "Christian Runtu, ST",
    nip: "198307192009021002",
    email: "christian.runtu@kpu.go.id",
    role: "Operator",
    jabatan: "Kasubbag Perencanaan, Data dan Informasi",
    subbagian: "RENDATIN (Perencanaan, Data dan Informasi)",
  },
  {
    name: "Michael Poluan, S.Kom",
    nip: "199302172017011004",
    email: "michael.poluan@kpu.go.id",
    role: "Operator",
    jabatan: "Pranata Komputer / Analis Data",
    subbagian: "RENDATIN (Perencanaan, Data dan Informasi)",
  },
  {
    name: "Natasya Pangemanan, S.Stat",
    nip: "199609252022032005",
    email: "natasya.pangemanan@kpu.go.id",
    role: "Operator",
    jabatan: "Pengolah Data SIDALIH",
    subbagian: "RENDATIN (Perencanaan, Data dan Informasi)",
  },

  // 3. BAG-03: Teknis Penyelenggaraan Pemilu
  {
    name: "Drs. Franky Mokodompit, M.Si",
    nip: "197709282005011001",
    email: "franky.mokodompit@kpu.go.id",
    role: "Admin",
    jabatan: "Kepala Bagian Teknis Penyelenggaraan",
    subbagian: "Teknis Penyelenggaraan Pemilu",
  },
  {
    name: "Hendrik Sumendap, SH",
    nip: "198112042006041002",
    email: "hendrik.sumendap@kpu.go.id",
    role: "Operator",
    jabatan: "Kasubbag Teknis Penyelenggaraan Pemilu",
    subbagian: "Teknis Penyelenggaraan Pemilu",
  },
  {
    name: "Ahmad Kurniawan",
    nip: "199208052021011002",
    email: "ahmad.kurniawan@kpu.go.id",
    role: "Operator",
    jabatan: "Staf Teknis Penyelenggaraan",
    subbagian: "Teknis Penyelenggaraan Pemilu",
  },
  {
    name: "Ingrid Sondakh, S.Sos",
    nip: "199410112019022004",
    email: "ingrid.sondakh@kpu.go.id",
    role: "Operator",
    jabatan: "Staf Pengelola Sistem SILOG",
    subbagian: "Teknis Penyelenggaraan Pemilu",
  },

  // 4. BAG-04: Hukum dan Pengawasan
  {
    name: "Donald Kalalo, SH, MH",
    nip: "197903212006041001",
    email: "donald.kalalo@kpu.go.id",
    role: "Admin",
    jabatan: "Kepala Bagian Hukum dan Pengawasan",
    subbagian: "Hukum dan Pengawasan",
  },
  {
    name: "Richard Senduk, SH",
    nip: "198309142009121002",
    email: "richard.senduk@kpu.go.id",
    role: "Operator",
    jabatan: "Kasubbag Hukum dan Pengawasan",
    subbagian: "Hukum dan Pengawasan",
  },
  {
    name: "Siti Rahmawati",
    nip: "199403152021022003",
    email: "siti.rahma@kpu.go.id",
    role: "Operator",
    jabatan: "Staf Subbagian Hukum",
    subbagian: "Hukum dan Pengawasan",
  },
  {
    name: "Aldo Maramis, SH",
    nip: "199512302020121005",
    email: "aldo.maramis@kpu.go.id",
    role: "Operator",
    jabatan: "Staf Dokumentasi JDIH KPU",
    subbagian: "Hukum dan Pengawasan",
  },

  // 5. BAG-05: Umum dan Logistik (UMLOG)
  {
    name: "Dra. Jenny Walangitan, MM",
    nip: "197508052001121001",
    email: "jenny.walangitan@kpu.go.id",
    role: "Admin",
    jabatan: "Kepala Bagian Umum dan Logistik",
    subbagian: "UMLOG (Umum dan Logistik)",
  },
  {
    name: "Nova Lasut, SE",
    nip: "198404182009022003",
    email: "nova.lasut@kpu.go.id",
    role: "Operator",
    jabatan: "Kasubbag Umum dan Logistik",
    subbagian: "UMLOG (Umum dan Logistik)",
  },
  {
    name: "Budi Santoso",
    nip: "198811202019031004",
    email: "budi.santoso@kpu.go.id",
    role: "Operator",
    jabatan: "Staf Pengelola UMLOG",
    subbagian: "UMLOG (Umum dan Logistik)",
  },
  {
    name: "Rizky Rumagit, S.Kom",
    nip: "199211152018021006",
    email: "rizky.rumagit@kpu.go.id",
    role: "Operator",
    jabatan: "Staf Pengadaan Logistik",
    subbagian: "UMLOG (Umum dan Logistik)",
  },

  // 6. BAG-06: Keuangan
  {
    name: "Drs. Maxie Rondonuwu, M.Si, Ak",
    nip: "197406182000031001",
    email: "maxie.rondonuwu@kpu.go.id",
    role: "Admin",
    jabatan: "Kepala Bagian Keuangan",
    subbagian: "Keuangan",
  },
  {
    name: "Albert Wenas, SE, Ak",
    nip: "198010202007011002",
    email: "albert.wenas@kpu.go.id",
    role: "Operator",
    jabatan: "Kasubbag Pengelolaan Keuangan dan DIPA",
    subbagian: "Keuangan",
  },
  {
    name: "Jessica Pandeirot, SE",
    nip: "199305142018012005",
    email: "jessica.pandeirot@kpu.go.id",
    role: "Operator",
    jabatan: "Bendahara Pengeluaran Pembantu",
    subbagian: "Keuangan",
  },
  {
    name: "Stevani Waworuntu, SE",
    nip: "199507202020122007",
    email: "stevani.waworuntu@kpu.go.id",
    role: "Operator",
    jabatan: "Staf Verifikasi dan Akuntansi",
    subbagian: "Keuangan",
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
      if ((matchedUser.role === "Admin" && (pass === "admin123" || pass === "123456" || pass === "••••••••")) ||
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
