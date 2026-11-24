import { useEffect, useState, type FormEvent, type ChangeEvent } from "react"
import {
  ArrowRight, AlertCircle, Archive, Briefcase, Building2, ChevronDown, Clock, Eye, EyeOff, FileText,
  IdCard, Layers, LoaderCircle, LockKeyhole, LogIn, MapPin, Moon, ShieldCheck, Sun, User, UserPlus, Wallet,
} from "lucide-react"
import { useAuth } from "../../context/AuthContext"
import { authApi, type RegisterResponse, type UnitBagianOption } from "../../../services/api"
import kpuLogo from "../../../assets/branding/kpu-sulut-logo.jpg"
import kpuOffice from "../../../assets/branding/kpu-sulut-office.png"
import "../../../styles/login.css"

interface LoginFormProps {
  theme?: "light" | "dark"
  onToggleTheme?: () => void
}

const services = [
  { icon: FileText, title: "Persuratan", description: "Kelola surat kedinasan" },
  { icon: Wallet, title: "Realisasi anggaran", description: "Pantau penggunaan anggaran" },
  { icon: Archive, title: "Arsip digital", description: "Dokumen dalam satu tempat" },
]

const JABATAN_OPTIONS = [
  "Staf",
  "Kepala Subbagian",
  "Kepala Bagian",
] as const

const PENDING_REQ_KEY = "ptp_pending_request"
const LOGIN_MODE_KEY = "ptp_login_mode"

function loadSavedPendingRequest(): RegisterResponse | null {
  try {
    const raw = localStorage.getItem(PENDING_REQ_KEY)
    return raw ? (JSON.parse(raw) as RegisterResponse) : null
  } catch {
    return null
  }
}

export function LoginForm({ theme = "light", onToggleTheme }: LoginFormProps) {
  const { login } = useAuth()
  const [submittedRequest, setSubmittedRequest] = useState<RegisterResponse | null>(() => loadSavedPendingRequest())
  const [mode, setMode] = useState<"login" | "signup" | "pending">(() => {
    const savedReq = loadSavedPendingRequest()
    const savedMode = localStorage.getItem(LOGIN_MODE_KEY)
    return savedMode === "pending" && savedReq ? "pending" : "login"
  })
  const [nip, setNip] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // State pendaftaran akun baru (Sign Up)
  const [unitOptions, setUnitOptions] = useState<UnitBagianOption[]>([])
  const [signupNama, setSignupNama] = useState("")
  const [signupNip, setSignupNip] = useState("")
  const [signupPassword, setSignupPassword] = useState("")
  const [showSignupPassword, setShowSignupPassword] = useState(false)
  const [signupJabatan, setSignupJabatan] = useState("")
  const [signupUnitBagian, setSignupUnitBagian] = useState("")
  const [signupIdBagian, setSignupIdBagian] = useState("")

  const isKepalaBagian = signupJabatan === "Kepala Bagian"
  const isKepalaSubbagian = signupJabatan === "Kepala Subbagian"
  const selectedUnit = unitOptions.find((u) => u.nama === signupUnitBagian)
  const allSubbagianChoices = unitOptions.flatMap((u) =>
    u.subbagian.map((s) => ({ ...s, parentUnit: u.nama }))
  )
  const subbagianChoices = isKepalaSubbagian
    ? allSubbagianChoices
    : selectedUnit?.subbagian || []

  useEffect(() => {
    if (mode === "signup" && unitOptions.length === 0) {
      authApi.getUnitOptions()
        .then(setUnitOptions)
        .catch(() => {
          // Abaikan jika gagal memuat sementara; user akan melihat opsi kosong dan bisa mencoba lagi
        })
    }
  }, [mode, unitOptions.length])

  // Sinkronkan mode & pengajuan ke localStorage agar bertahan saat browser di-refresh
  useEffect(() => {
    localStorage.setItem(LOGIN_MODE_KEY, mode === "pending" ? "pending" : "login")
  }, [mode])

  useEffect(() => {
    if (submittedRequest) {
      localStorage.setItem(PENDING_REQ_KEY, JSON.stringify(submittedRequest))
    } else {
      localStorage.removeItem(PENDING_REQ_KEY)
    }
  }, [submittedRequest])

  // Cek status terbaru dari backend saat halaman dimuat/di-refresh jika ada pengajuan tersimpan
  useEffect(() => {
    if (!submittedRequest?.nip) return
    let active = true
    authApi.getRegisterStatus(submittedRequest.nip)
      .then((fresh) => {
        if (active) setSubmittedRequest(fresh)
      })
      .catch(() => {
        // Pertahankan data tersimpan jika server sementara tidak terjangkau
      })
    return () => { active = false }
  }, [submittedRequest?.nip, mode])

  const switchMode = (next: "login" | "signup" | "pending") => {
    setMode(next)
    setErrorMessage(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isLoading) return
    setErrorMessage(null)
    setIsLoading(true)
    try {
      const result = await login(nip, password)
      if (!result.success) {
        setErrorMessage(result.error || "NIP atau kata sandi tidak sesuai. Silakan coba kembali.")
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal melakukan proses masuk ke sistem.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignUpSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isLoading) return
    setErrorMessage(null)

    if (signupNip.length !== 18) {
      setErrorMessage("NIP harus terdiri dari tepat 18 digit angka.")
      return
    }
    if (!signupJabatan) {
      setErrorMessage("Pilih jabatan Anda terlebih dahulu.")
      return
    }
    if (!isKepalaSubbagian && !signupUnitBagian) {
      setErrorMessage("Pilih unit bagian Anda terlebih dahulu.")
      return
    }
    if (!isKepalaBagian && !signupIdBagian) {
      setErrorMessage(
        isKepalaSubbagian
          ? "Pilih subbagian Anda terlebih dahulu."
          : "Pilih subbagian sesuai unit bagian Anda."
      )
      return
    }

    const resolvedUnitBagian = isKepalaSubbagian
      ? allSubbagianChoices.find((s) => String(s.id_bagian) === signupIdBagian)?.parentUnit || signupUnitBagian
      : signupUnitBagian

    setIsLoading(true)
    try {
      const res = await authApi.register({
        nama: signupNama.trim(),
        nip: signupNip.trim(),
        password: signupPassword,
        jabatan: signupJabatan,
        unit_bagian: resolvedUnitBagian,
        id_bagian: isKepalaBagian ? null : Number(signupIdBagian),
      })
      setSubmittedRequest(res)
      setMode("pending")
      setSignupNama("")
      setSignupNip("")
      setSignupPassword("")
      setSignupJabatan("")
      setSignupUnitBagian("")
      setSignupIdBagian("")
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal mengajukan pendaftaran akun.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleNipChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNip(event.target.value.replace(/\D/g, "").slice(0, 18))
    setErrorMessage(null)
  }

  const handleSignupNipChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSignupNip(event.target.value.replace(/\D/g, "").slice(0, 18))
    setErrorMessage(null)
  }

  return (
    <div className={`login-page ${theme === "dark" ? "login-page--dark" : ""}`}>
      <div className="login-backdrop" aria-hidden="true">
        <img src={kpuOffice} alt="" fetchPriority="high" />
      </div>
      <a className="login-skip-link" href="#login-nip">Langsung ke formulir masuk</a>
      <header className="login-header">
        <div className="login-brand">
          <div className="login-logo">
            <img src={kpuLogo} alt="Logo KPU Provinsi Sulawesi Utara" width={1080} height={1080} />
          </div>
          <div className="login-brand-copy">
            <span>Komisi Pemilihan Umum</span>
            <strong>Provinsi Sulawesi Utara</strong>
          </div>
        </div>
        <div className="login-header-actions">
          <span className="login-internal-label"><span />Portal internal</span>
          {onToggleTheme && (
            <button type="button" className="login-theme-toggle" onClick={onToggleTheme}
              aria-label={theme === "dark" ? "Gunakan tema terang" : "Gunakan tema gelap"}
              title={theme === "dark" ? "Gunakan tema terang" : "Gunakan tema gelap"}>
              {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            </button>
          )}
        </div>
      </header>
      <main className="login-main" id="main-content">
        <section className="login-intro" aria-labelledby="login-title">
          <div className="login-eyebrow"><span />PTP-KPU</div>
          <h1 id="login-title">Platform Terpadu<br /><span>Penunjang KPU.</span></h1>
          <p className="login-intro-description">
            Satu akses untuk administrasi yang lebih terintegrasi.
            Mendukung kerja dan pelayanan Sekretariat KPU Provinsi Sulawesi Utara.
          </p>
          <div className="login-services" aria-label="Layanan portal">
            {services.map(({ icon: Icon, title, description }) => (
              <div className="login-service" key={title}>
                <Icon size={21} strokeWidth={1.5} aria-hidden="true" />
                <h2>{title}</h2>
                <p>{description}</p>
              </div>
            ))}
          </div>
          <p className="login-location"><MapPin size={15} aria-hidden="true" />Kantor KPU Provinsi Sulawesi Utara</p>
        </section>
        <section className="login-card" aria-labelledby="login-form-title">
          <div className="login-card-heading">
            <div className="login-card-eyebrow">
              <span className="login-access-icon">
                {mode === "signup" ? <UserPlus size={17} aria-hidden="true" /> : mode === "pending" ? <Clock size={17} aria-hidden="true" /> : <LockKeyhole size={17} aria-hidden="true" />}
              </span>
              {mode === "signup" ? "Pendaftaran pegawai" : mode === "pending" ? "Status verifikasi" : "Akses pegawai"}
            </div>
            <h2 id="login-form-title">
              {mode === "signup" ? "Daftar akun" : mode === "pending" ? "Menunggu verifikasi" : "Selamat datang"}
            </h2>
            <p>
              {mode === "signup"
                ? "Lengkapi data diri Anda untuk mengajukan verifikasi akun."
                : mode === "pending"
                ? "Pengajuan akun baru Anda telah dikirim ke Administrator."
                : "Silakan masuk ke akun PTP-KPU Anda."}
            </p>
          </div>

          {mode !== "pending" && (
            <div className="login-mode-tabs" role="tablist" aria-label="Pilih mode akses">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                className={`login-mode-tab ${mode === "login" ? "is-active" : ""}`}
                onClick={() => switchMode("login")}
              >
                <LogIn size={15} aria-hidden="true" />
                <span>Masuk</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signup"}
                className={`login-mode-tab ${mode === "signup" ? "is-active" : ""}`}
                onClick={() => switchMode("signup")}
              >
                <UserPlus size={15} aria-hidden="true" />
                <span>Sign Up</span>
              </button>
            </div>
          )}

          {mode === "login" && (
            <form className="login-form" onSubmit={handleSubmit} aria-busy={isLoading}>
              {errorMessage && (
                <div className="login-error" id="login-error" role="alert">
                  <AlertCircle size={18} aria-hidden="true" /><span>{errorMessage}</span>
                </div>
              )}
              <div className="login-field">
                <label htmlFor="login-nip">Nomor Induk Pegawai <span>(NIP)</span></label>
                <div className="login-input-wrap">
                  <IdCard className="login-input-icon" size={19} aria-hidden="true" />
                  <input id="login-nip" name="username" type="text" inputMode="numeric" autoComplete="username"
                    required pattern="[0-9]{18}" title="Masukkan NIP yang terdiri dari 18 digit angka"
                    value={nip} onChange={handleNipChange} placeholder="Masukkan 18 digit NIP" maxLength={18}
                    readOnly={isLoading} aria-invalid={!!errorMessage}
                    aria-describedby={errorMessage ? "login-nip-hint login-error" : "login-nip-hint"} />
                </div>
                <p className="login-field-hint" id="login-nip-hint">Gunakan NIP sesuai identitas kepegawaian Anda.</p>
              </div>
              <div className="login-field">
                <div className="login-label-row">
                  <label htmlFor="login-password">Kata sandi</label>
                  <button type="button" className="login-help-toggle" onClick={() => setShowHelp(!showHelp)}
                    aria-expanded={showHelp} aria-controls="login-help">Lupa kata sandi?</button>
                </div>
                <div className="login-input-wrap">
                  <LockKeyhole className="login-input-icon" size={18} aria-hidden="true" />
                  <input id="login-password" name="password" type={showPassword ? "text" : "password"}
                    autoComplete="current-password" required value={password}
                    onChange={(event) => { setPassword(event.target.value); setErrorMessage(null) }}
                    placeholder="Masukkan kata sandi" readOnly={isLoading} aria-invalid={!!errorMessage}
                    aria-describedby={errorMessage ? "login-error" : undefined} />
                  <button type="button" className="login-password-toggle" onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                    aria-pressed={showPassword} aria-controls="login-password">
                    {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <div className="login-help" id="login-help" hidden={!showHelp}>
                Hubungi administrator PTP-KPU di Sekretariat KPU Provinsi Sulawesi Utara untuk bantuan pengaturan ulang kata sandi.
              </div>
              <button className="login-submit" type="submit" disabled={isLoading}>
                {isLoading ? (
                  <><LoaderCircle className="login-spinner" size={19} aria-hidden="true" /><span>Memverifikasi akun...</span></>
                ) : (
                  <><span>Masuk ke portal</span><ArrowRight size={19} aria-hidden="true" /></>
                )}
              </button>
              {submittedRequest && (
                <button
                  type="button"
                  className="login-secondary-btn"
                  onClick={() => switchMode("pending")}
                >
                  <Clock size={16} aria-hidden="true" />
                  <span>Kembali ke Status Verifikasi</span>
                </button>
              )}
              <span className="login-sr-only" role="status">{isLoading ? "Sedang memverifikasi akun. Mohon tunggu." : ""}</span>
            </form>
          )}

          {mode === "signup" && (
            <form className="login-form" onSubmit={handleSignUpSubmit} aria-busy={isLoading}>
              {errorMessage && (
                <div className="login-error" id="signup-error" role="alert">
                  <AlertCircle size={18} aria-hidden="true" /><span>{errorMessage}</span>
                </div>
              )}

              <div className="login-field">
                <label htmlFor="signup-nama">Nama Lengkap</label>
                <div className="login-input-wrap">
                  <User className="login-input-icon" size={18} aria-hidden="true" />
                  <input
                    id="signup-nama"
                    type="text"
                    required
                    value={signupNama}
                    onChange={(e) => { setSignupNama(e.target.value); setErrorMessage(null) }}
                    placeholder="Masukkan nama lengkap beserta gelar"
                    readOnly={isLoading}
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="signup-nip">Nomor Induk Pegawai <span>(NIP)</span></label>
                <div className="login-input-wrap">
                  <IdCard className="login-input-icon" size={19} aria-hidden="true" />
                  <input
                    id="signup-nip"
                    type="text"
                    inputMode="numeric"
                    required
                    pattern="[0-9]{18}"
                    title="Masukkan NIP yang terdiri dari 18 digit angka"
                    value={signupNip}
                    onChange={handleSignupNipChange}
                    placeholder="Masukkan 18 digit NIP"
                    maxLength={18}
                    readOnly={isLoading}
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="signup-password">Kata sandi <span>(minimal 8 karakter)</span></label>
                <div className="login-input-wrap">
                  <LockKeyhole className="login-input-icon" size={18} aria-hidden="true" />
                  <input
                    id="signup-password"
                    type={showSignupPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={signupPassword}
                    onChange={(e) => { setSignupPassword(e.target.value); setErrorMessage(null) }}
                    placeholder="Minimal 8 karakter"
                    readOnly={isLoading}
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowSignupPassword(!showSignupPassword)}
                    aria-label={showSignupPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                    aria-pressed={showSignupPassword}
                  >
                    {showSignupPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="signup-jabatan">Jabatan</label>
                <div className="login-input-wrap">
                  <Briefcase className="login-input-icon" size={18} aria-hidden="true" />
                  <select
                    id="signup-jabatan"
                    required
                    value={signupJabatan}
                    onChange={(e) => {
                      const nextJabatan = e.target.value
                      setSignupJabatan(nextJabatan)
                      setSignupUnitBagian("")
                      setSignupIdBagian("")
                      setErrorMessage(null)
                    }}
                    disabled={isLoading}
                  >
                    <option value="">Pilih jabatan</option>
                    {JABATAN_OPTIONS.map((jab) => (
                      <option key={jab} value={jab}>{jab}</option>
                    ))}
                  </select>
                  <ChevronDown className="login-select-chevron" size={17} aria-hidden="true" />
                </div>
              </div>

              {!isKepalaSubbagian && (
                <div className="login-field">
                  <label htmlFor="signup-unit-bagian">Unit Bagian</label>
                  <div className="login-input-wrap">
                    <Building2 className="login-input-icon" size={18} aria-hidden="true" />
                    <select
                      id="signup-unit-bagian"
                      required
                      value={signupUnitBagian}
                      onChange={(e) => {
                        setSignupUnitBagian(e.target.value)
                        setSignupIdBagian("")
                        setErrorMessage(null)
                      }}
                      disabled={isLoading}
                    >
                      <option value="">Pilih unit bagian</option>
                      {unitOptions.map((u) => (
                        <option key={u.kode} value={u.nama}>{u.nama}</option>
                      ))}
                    </select>
                    <ChevronDown className="login-select-chevron" size={17} aria-hidden="true" />
                  </div>
                </div>
              )}

              {(isKepalaSubbagian || (signupUnitBagian && !isKepalaBagian)) && (
                <div className="login-field">
                  <label htmlFor="signup-subbagian">Subbagian</label>
                  <div className="login-input-wrap">
                    <Layers className="login-input-icon" size={18} aria-hidden="true" />
                    <select
                      id="signup-subbagian"
                      required
                      value={signupIdBagian}
                      onChange={(e) => {
                        const nextId = e.target.value
                        setSignupIdBagian(nextId)
                        if (isKepalaSubbagian) {
                          const found = allSubbagianChoices.find((s) => String(s.id_bagian) === nextId)
                          setSignupUnitBagian(found?.parentUnit || "")
                        }
                        setErrorMessage(null)
                      }}
                      disabled={isLoading}
                    >
                      <option value="">Pilih subbagian</option>
                      {subbagianChoices.map((sub) => (
                        <option key={sub.id_bagian} value={sub.id_bagian}>
                          {sub.nama_bagian}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="login-select-chevron" size={17} aria-hidden="true" />
                  </div>
                </div>
              )}

              <button className="login-submit" type="submit" disabled={isLoading}>
                {isLoading ? (
                  <><LoaderCircle className="login-spinner" size={19} aria-hidden="true" /><span>Mengirim pengajuan...</span></>
                ) : (
                  <><span>Daftar &amp; Ajukan Verifikasi</span><ArrowRight size={19} aria-hidden="true" /></>
                )}
              </button>
            </form>
          )}

          {mode === "pending" && (
            <div className="login-pending-box">
              <div
                className={`login-pending-banner ${
                  submittedRequest?.status === "approved"
                    ? "is-approved"
                    : submittedRequest?.status === "rejected"
                    ? "is-rejected"
                    : ""
                }`}
              >
                <Clock size={20} aria-hidden="true" />
                <div>
                  <strong>
                    {submittedRequest?.status === "approved"
                      ? "Akun Telah Disetujui Administrator."
                      : submittedRequest?.status === "rejected"
                      ? "Pengajuan Akun Ditolak Administrator."
                      : "Menunggu Verifikasi Administrator."}
                  </strong>
                  <p>
                    {submittedRequest?.status === "approved"
                      ? "Akun Anda sudah aktif. Silakan kembali ke halaman masuk untuk login menggunakan NIP dan kata sandi Anda."
                      : submittedRequest?.status === "rejected"
                      ? "Silakan hubungi Administrator atau lakukan pendaftaran ulang dengan data yang sesuai."
                      : "Akun Anda belum dapat digunakan untuk masuk sebelum disetujui oleh Admin melalui menu Kelola Pengguna."}
                  </p>
                </div>
              </div>

              {submittedRequest && (
                <div className="login-pending-detail">
                  <div className="login-pending-row">
                    <span>Nama Lengkap</span>
                    <strong>{submittedRequest.nama}</strong>
                  </div>
                  <div className="login-pending-row">
                    <span>NIP</span>
                    <strong>{submittedRequest.nip}</strong>
                  </div>
                  <div className="login-pending-row">
                    <span>Jabatan</span>
                    <strong>{submittedRequest.jabatan}</strong>
                  </div>
                  <div className="login-pending-row">
                    <span>Unit Bagian</span>
                    <strong>{submittedRequest.unit_bagian}</strong>
                  </div>
                  {submittedRequest.nama_subbagian && (
                    <div className="login-pending-row">
                      <span>Subbagian</span>
                      <strong>{submittedRequest.nama_subbagian}</strong>
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                className="login-submit"
                onClick={() => {
                  if (submittedRequest?.status === "approved") {
                    setNip(submittedRequest.nip)
                    setSubmittedRequest(null)
                  }
                  switchMode("login")
                }}
              >
                <span>Kembali ke Halaman Masuk</span>
                <ArrowRight size={19} aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="login-access-note">
            <ShieldCheck size={19} strokeWidth={1.7} aria-hidden="true" />
            <p>Akses khusus pegawai terdaftar.<br /><span>Jaga kerahasiaan akun dan kata sandi Anda.</span></p>
          </div>
        </section>
      </main>
      <footer className="login-footer">
        <p>&copy; {new Date().getFullYear()} KPU Provinsi Sulawesi Utara.</p>
        <p>Platform Terpadu Penunjang KPU<span aria-hidden="true"> / </span><span>Sekretariat KPU Sulut</span></p>
      </footer>
    </div>
  )
}
