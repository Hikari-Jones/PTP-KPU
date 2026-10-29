import { Building, Award, IdCard, Mail, Shield, CheckCircle2, Phone, MapPin } from "lucide-react"
import { useAuth } from "../../context/AuthContext"
import { Card, CardContent } from "../ui/card"
import { Avatar, AvatarFallback } from "../ui/avatar"

export function ProfilView({ theme }: { theme: "light" | "dark" }) {
  const { currentUser, userRole } = useAuth()
  const isDark = theme === "dark"

  const initials = currentUser?.name
    ? currentUser.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
    : "AK"

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="pb-2 border-b-2 border-red-600/30">
        <h1 className={`text-2xl font-bold tracking-tight my-0 ${isDark ? "text-white" : "text-black"}`}>
          Profil Pengguna
        </h1>
        <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
          Informasi identitas, wewenang, dan penugasan operator di lingkungan KPU Provinsi Sulawesi Utara
        </p>
      </div>

      {/* Main Identity Card */}
      <Card className={`overflow-hidden border-l-4 border-l-red-600 ${isDark ? "bg-[#0d1322] border-y-[#1e293b] border-r-[#1e293b]" : "bg-white border-y-slate-200 border-r-slate-200 shadow-sm"}`}>
        <CardContent className="p-6 flex items-center min-h-[150px]">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-6 w-full">
            <div className="shrink-0 flex items-center justify-center">
              <Avatar className="w-24 h-24 border-3 border-red-600 shadow-lg ring-4 ring-red-600/10">
                <AvatarFallback className="bg-red-600 text-white font-black text-3xl flex items-center justify-center">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </div>

            <div className="flex-1 flex flex-col justify-center space-y-2 text-center sm:text-left min-w-0">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                <h2 className={`text-xl font-extrabold truncate ${isDark ? "text-white" : "text-black"}`}>
                  {currentUser?.name || "Ahmad Kurniawan"}
                </h2>
                <span className="px-2.5 py-0.5 rounded-md text-xs font-black uppercase tracking-wider bg-red-600 text-white shadow-xs flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  {userRole}
                </span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 ${isDark ? "bg-slate-800 text-white border border-slate-700" : "bg-slate-100 text-black border border-slate-300"}`}>
                  <CheckCircle2 className="w-3 h-3 text-red-600" />
                  Aktif
                </span>
              </div>

              <p className={`text-xs font-mono font-bold tracking-wide ${isDark ? "text-red-400" : "text-red-600"}`}>
                NIP. {currentUser?.nip || "199208052021011002"}
              </p>

              <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-x-6 gap-y-2 text-xs">
                <div className={`flex items-center gap-2 font-semibold ${isDark ? "text-gray-200" : "text-slate-800"}`}>
                  <div className="w-6 h-6 rounded-md bg-red-600/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                    <IdCard className="w-3.5 h-3.5" />
                  </div>
                  <span>{currentUser?.jabatan || "Staf Bidang Teknis Penyelenggaraan"}</span>
                </div>
                <div className={`flex items-center gap-2 font-semibold ${isDark ? "text-gray-200" : "text-slate-800"}`}>
                  <div className="w-6 h-6 rounded-md bg-red-600/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                    <Building className="w-3.5 h-3.5" />
                  </div>
                  <span>KPU Provinsi Sulawesi Utara</span>
                </div>
                <div className={`flex items-center gap-2 font-semibold ${isDark ? "text-gray-200" : "text-slate-800"}`}>
                  <div className="w-6 h-6 rounded-md bg-red-600/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                    <Award className="w-3.5 h-3.5" />
                  </div>
                  <span>{currentUser?.subbagian || "Teknis Penyelenggaraan Pemilu"}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={`transition-all ${isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}`}>
          <CardContent className="p-5 flex items-center gap-4 min-h-[96px]">
            <div className="w-12 h-12 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Mail className="w-5 h-5" />
            </div>
            <div className="flex-1 flex flex-col justify-center min-w-0">
              <p className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? "text-gray-400" : "text-slate-600"}`}>Email Resmi</p>
              <p className={`text-xs font-bold truncate mt-0.5 ${isDark ? "text-white" : "text-black"}`}>
                {currentUser?.email || "ahmad.kurniawan@kpu.go.id"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className={`transition-all ${isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}`}>
          <CardContent className="p-5 flex items-center gap-4 min-h-[96px]">
            <div className="w-12 h-12 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Phone className="w-5 h-5" />
            </div>
            <div className="flex-1 flex flex-col justify-center min-w-0">
              <p className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? "text-gray-400" : "text-slate-600"}`}>Kontak Dinas</p>
              <p className={`text-xs font-bold truncate mt-0.5 ${isDark ? "text-white" : "text-black"}`}>
                +62 811-432-8890
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className={`transition-all ${isDark ? "bg-[#0d1322] border-[#1e293b]" : "bg-white border-slate-200 shadow-sm"}`}>
          <CardContent className="p-5 flex items-center gap-4 min-h-[96px]">
            <div className="w-12 h-12 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="flex-1 flex flex-col justify-center min-w-0">
              <p className={`text-[10px] uppercase font-bold tracking-wider ${isDark ? "text-gray-400" : "text-slate-600"}`}>Wilayah Tugas</p>
              <p className={`text-xs font-bold truncate mt-0.5 ${isDark ? "text-white" : "text-black"}`}>
                Kota Manado, Prov. Sulawesi Utara
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
