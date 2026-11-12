import { useState, type FormEvent, type ChangeEvent } from "react"
import {
  ArrowRight, AlertCircle, Archive, ChevronDown, Eye, EyeOff, FileText,
  IdCard, LoaderCircle, LockKeyhole, MapPin, Moon, ShieldCheck, Sun, Wallet,
} from "lucide-react"
import { useAuth } from "../../context/AuthContext"
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

export function LoginForm({ theme = "light", onToggleTheme }: LoginFormProps) {
  const { login } = useAuth()
  const [nip, setNip] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isLoading) return
    setErrorMessage(null)
    setIsLoading(true)
    window.setTimeout(() => {
      const result = login(nip, password)
      setIsLoading(false)
      if (!result.success) {
        setErrorMessage(result.error || "NIP atau kata sandi tidak sesuai. Silakan coba kembali.")
      }
    }, 400)
  }

  const handleNipChange = (event: ChangeEvent<HTMLInputElement>) => {
    setNip(event.target.value.replace(/\D/g, "").slice(0, 18))
    setErrorMessage(null)
  }

  const handleSelectDemo = (demoNip: string, demoPassword: string) => {
    setNip(demoNip)
    setPassword(demoPassword)
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
            <div className="login-card-eyebrow"><span className="login-access-icon"><LockKeyhole size={17} aria-hidden="true" /></span>Akses pegawai</div>
            <h2 id="login-form-title">Selamat datang</h2>
            <p>Silakan masuk ke akun PTP-KPU Anda.</p>
          </div>
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
            <span className="login-sr-only" role="status">{isLoading ? "Sedang memverifikasi akun. Mohon tunggu." : ""}</span>
          </form>
          <div className="login-access-note">
            <ShieldCheck size={19} strokeWidth={1.7} aria-hidden="true" />
            <p>Akses khusus pegawai terdaftar.<br /><span>Jaga kerahasiaan akun dan kata sandi Anda.</span></p>
          </div>
          <details className="login-demo">
            <summary>Akun uji coba <ChevronDown size={15} aria-hidden="true" /></summary>
            <div className="login-demo-options">
              <button type="button" disabled={isLoading} onClick={() => handleSelectDemo("198507182020031001", "admin123")}>Isi akun Admin</button>
              <button type="button" disabled={isLoading} onClick={() => handleSelectDemo("199208052021011002", "123456")}>Isi akun Pegawai Teknis</button>
              <button type="button" disabled={isLoading} onClick={() => handleSelectDemo("199003122019032001", "123456")}>Isi akun Pegawai Keuangan</button>
              <button type="button" disabled={isLoading} onClick={() => handleSelectDemo("198811232015031003", "123456")}>Isi akun Pegawai UMLOG</button>
            </div>
          </details>
        </section>
      </main>
      <footer className="login-footer">
        <p>&copy; {new Date().getFullYear()} KPU Provinsi Sulawesi Utara.</p>
        <p>Platform Terpadu Penunjang KPU<span aria-hidden="true"> / </span><span>Sekretariat KPU Sulut</span></p>
      </footer>
    </div>
  )
}
