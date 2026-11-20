import { useEffect, useState } from "react"
import { Building, Award, IdCard, Mail, Shield, Calendar, User } from "lucide-react"
import { tahunAnggaranApi } from "../../../services/api"
import { useAuth } from "../../context/AuthContext"

export function ProfilView({ theme }: { theme: "light" | "dark" }) {
  const { currentUser, userRole } = useAuth()
  const isDark = theme === "dark"

  // Unit kerja is the department stored for this employee (bagian).
  const unitKerja = currentUser?.subbagian || "-"

  // Active budget year, from the backend
  const [activeYear, setActiveYear] = useState<string>("…")
  useEffect(() => {
    let alive = true
    tahunAnggaranApi.getAll({ limit: 100 })
      .then((res) => {
        const active = res.items.find((item) => item.status === "active")
        if (alive) setActiveYear(active ? `TA ${active.tahun}` : "Belum ada TA aktif")
      })
      .catch(() => { if (alive) setActiveYear("Tidak dapat dimuat") })
    return () => { alive = false }
  }, [])

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header Halaman (di luar card) */}
      <div className="px-1">
        <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
          Profil Pengguna
        </h1>
        <p className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          Informasi identitas kedinasan, unit wewenang, dan penugasan resmi pegawai di lingkungan KPU Provinsi Sulawesi Utara.
        </p>
      </div>

      {/* Card Utama Pembungkus Seluruh Profil */}
      <section
        className={`p-6 sm:p-7 rounded-2xl border transition-all backdrop-blur-md shadow-lg space-y-6 ${
          isDark
            ? "bg-[#1e293b]/90 border-white/10 text-gray-100 shadow-black/40"
            : "bg-white/85 border-slate-200 text-slate-900 shadow-slate-200/50"
        }`}
      >
        {/* Card Dalam 1: Banner Identitas Utama & Avatar Icon Orang (Simetris & Rapi) */}
        <div
          className={`p-5 sm:p-6 rounded-xl border transition-all ${
            isDark
              ? "bg-[#111827]/70 border-white/10 shadow-xs"
              : "bg-slate-50 border-slate-200 shadow-2xs"
          }`}
        >
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-5 sm:gap-6">
            {/* Logo Icon Orang (Profil Picture) */}
            <div className="shrink-0 flex items-center justify-center">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-lg border border-red-500/30">
                <User className="w-10 h-10 sm:w-12 sm:h-12" />
              </div>
            </div>

            {/* Nama & NIP (Font Bersih & Size Lebih Proporsional) */}
            <div className="flex-1 text-center sm:text-left space-y-2 min-w-0">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight truncate">
                  {currentUser?.name || "-"}
                </h2>
                <span className="btn-kpu-red px-3 py-1 text-white font-bold text-xs rounded-xl inline-flex items-center gap-1.5 shadow-2xs">
                  <Shield className="w-3.5 h-3.5" />
                  <span>{userRole || "Pegawai"}</span>
                </span>
              </div>

              {/* Teks NIP: Font Sans Standar (bukan mono), Ukuran Diperbesar, Elegan & Jelas */}
              <p className="text-sm font-semibold text-red-600 dark:text-red-400 tracking-normal">
                NIP {currentUser?.nip || "-"}
              </p>
            </div>
          </div>
        </div>

        {/* Card Dalam 2: Informasi Atribut Kedinasan (2 Kolom Simetris) */}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2 px-1">
            Atribut Penugasan Resmi
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Box Jabatan */}
            <div
              className={`p-4 rounded-xl border flex items-center gap-3.5 transition-all ${
                isDark
                  ? "bg-[#111827]/70 border-white/10 shadow-xs"
                  : "bg-slate-50 border-slate-200 shadow-2xs"
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <IdCard className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">
                  Jabatan
                </span>
                <span className="text-xs font-bold truncate block text-slate-900 dark:text-white">
                  {currentUser?.jabatan || "-"}
                </span>
              </div>
            </div>

            {/* Box Unit Kerja */}
            <div
              className={`p-4 rounded-xl border flex items-center gap-3.5 transition-all ${
                isDark
                  ? "bg-[#111827]/70 border-white/10 shadow-xs"
                  : "bg-slate-50 border-slate-200 shadow-2xs"
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">
                  Unit Kerja
                </span>
                <span className="text-xs font-bold truncate block text-slate-900 dark:text-white" title={unitKerja}>
                  {unitKerja}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card Dalam 3: Informasi Sistem Kedinasan (2 Kolom Simetris) */}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2 px-1">
            Informasi Sistem Kedinasan
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Box Email Kedinasan */}
            <div
              className={`p-4 rounded-xl border flex items-center gap-3.5 transition-all ${
                isDark
                  ? "bg-[#111827]/70 border-white/10 shadow-xs"
                  : "bg-slate-50 border-slate-200 shadow-2xs"
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">
                  Email Kedinasan
                </span>
                <span className="text-xs font-bold truncate block text-slate-900 dark:text-white">
                  {currentUser?.email || "Belum tercatat"}
                </span>
              </div>
            </div>

            {/* Box Tahun Anggaran */}
            <div
              className={`p-4 rounded-xl border flex items-center gap-3.5 transition-all ${
                isDark
                  ? "bg-[#111827]/70 border-white/10 shadow-xs"
                  : "bg-slate-50 border-slate-200 shadow-2xs"
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">
                  Tahun Anggaran
                </span>
                <span className="text-xs font-bold truncate block text-slate-900 dark:text-white">
                  {activeYear}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
