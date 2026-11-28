import { useState, type FormEvent } from "react"
import { Award, CheckCircle2, AlertCircle, IdCard, Loader2, LockKeyhole, Save, Shield, User } from "lucide-react"
import { useAuth } from "../../context/AuthContext"
import { CharLimit } from "../ui/CharLimit"

export function ProfilView({ theme }: { theme: "light" | "dark" }) {
  const { currentUser, userRole, updateProfile } = useAuth()
  const isDark = theme === "dark"

  const unitKerja = currentUser?.subbagian || "-"

  const [nama, setNama] = useState(currentUser?.name || "")
  const [nip, setNip] = useState(currentUser?.nip || "")
  const [password, setPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (nip.trim().length !== 18) {
      setError("NIP harus terdiri dari tepat 18 digit angka.")
      return
    }
    if (password && password.length < 8) {
      setError("Kata sandi baru minimal 8 karakter.")
      return
    }

    setSaving(true)
    try {
      await updateProfile({
        nama: nama.trim(),
        nip: nip.trim(),
        ...(password.trim() ? { password: password.trim() } : {}),
      })
      setPassword("")
      setSuccess("Profil berhasil diperbarui.")
    } catch (err: any) {
      setError(err?.message || "Gagal memperbarui profil.")
    } finally {
      setSaving(false)
    }
  }

  const inputClass = `w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold outline-none transition-colors ${
    isDark
      ? "bg-[#111827] border-white/10 text-white focus:border-red-500"
      : "bg-slate-50 border-slate-300 text-slate-900 focus:border-red-500"
  }`

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header Halaman (di luar card) */}
      <div className="px-1">
        <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
          Profil Pengguna
        </h1>
        <p className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          Informasi identitas kedinasan, unit wewenang, dan pengaturan akun pribadi di lingkungan KPU Provinsi Sulawesi Utara.
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
        {/* Card Dalam 1: Banner Identitas Utama */}
        <div
          className={`p-5 sm:p-6 rounded-xl border transition-all ${
            isDark
              ? "bg-[#111827]/70 border-white/10 shadow-xs"
              : "bg-slate-50 border-slate-200 shadow-2xs"
          }`}
        >
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-5 sm:gap-6">
            <div className="shrink-0 flex items-center justify-center">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-lg border border-red-500/30">
                <User className="w-10 h-10 sm:w-12 sm:h-12" />
              </div>
            </div>

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

              <p className="text-sm font-semibold text-red-600 dark:text-red-400 tracking-normal">
                NIP {currentUser?.nip || "-"}
              </p>
            </div>
          </div>
        </div>

        {/* Card Dalam 2: Informasi Atribut Kedinasan */}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2 px-1">
            Atribut Penugasan Resmi
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
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

        {/* Card Dalam 3: Ubah Nama, NIP, dan Kata Sandi */}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2 px-1">
            Pengaturan Akun (Ubah Nama, NIP &amp; Kata Sandi)
          </span>
          <form
            onSubmit={handleSave}
            className={`p-5 rounded-xl border space-y-4 ${
              isDark ? "bg-[#111827]/70 border-white/10" : "bg-slate-50 border-slate-200"
            }`}
          >
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Nama Lengkap
                  </label>
                  <CharLimit value={nama} max={150} />
                </div>
                <input
                  type="text"
                  required
                  maxLength={150}
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  className={inputClass}
                  placeholder="Nama lengkap"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    NIP (18 Digit)
                  </label>
                  <CharLimit value={nip} max={18} exact />
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  maxLength={18}
                  value={nip}
                  onChange={(e) => setNip(e.target.value.replace(/\D/g, "").slice(0, 18))}
                  className={inputClass}
                  placeholder="18 digit NIP"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Kata Sandi Baru (Opsional)
                  </label>
                  <CharLimit value={password} max={128} />
                </div>
                <div className="relative">
                  <LockKeyhole className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pl-9`}
                    placeholder="Kosongkan jika tidak diubah"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="btn-kpu-red px-4 py-2 text-xs font-bold text-white rounded-xl inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>{saving ? "Menyimpan..." : "Simpan Perubahan"}</span>
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}
