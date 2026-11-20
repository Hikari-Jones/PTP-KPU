import React, { useEffect, useMemo, useState } from "react"
import {
  FileText,
  Briefcase,
  Database,
  Plus,
  CheckCircle2,
  Search,
  RefreshCw,
  Send,
  X,
  Clock,
  Download,
  AlertCircle,
  MapPin,
} from "lucide-react"
import type { SuratKeluar, KodeKlasifikasiArsip, JenisSurat } from "../../../types"
import { request, download, message } from "../../../services/operations"
import { createKlasifikasi } from "../../../services/api"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Badge } from "../ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { useAuth } from "../../context/AuthContext"
import { showToast as notify } from "../../../services/activity"
import { ReadOnlyBanner } from "../ui/read-only"

export interface SuratViewProps {
  theme?: "light" | "dark"
  subTab?: string
  onNavigate?: (tab: string) => void
}

type Tab = "overview" | "surat-keluar" | "surat-tugas" | "klasifikasi"

interface SuratTugas {
  id_surat_tugas: number
  id_surat_keluar: number | null
  nomor_tugas: string | null
  maksud_tugas: string
  tempat_tugas: string | null
  tanggal_mulai: string
  tanggal_selesai: string
  beban_anggaran: string | null
}

interface Department {
  id_bagian: number
  nama_bagian: string
}

/** The list endpoint returns at most this many rows per request. */
const PAGE_LIMIT = 100

const STATUS_LABEL: Record<string, { label: string; variant: "draft" | "success" | "terkirim" | "secondary" }> = {
  draft: { label: "Draft", variant: "draft" },
  disetujui: { label: "Disetujui", variant: "terkirim" },
  terbit: { label: "Terbit", variant: "success" },
  diarsipkan: { label: "Diarsipkan", variant: "secondary" },
}

/** Form options for the "sifat surat" field (letter urgency class). */
const SIFAT_SURAT = ["Biasa", "Penting", "Segera", "Rahasia"]

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-"

const getInitialTab = (tab: string): Tab => {
  if (tab === "keluar" || tab === "surat-keluar") return "surat-keluar"
  if (tab === "surat-tugas" || tab === "masuk") return "surat-tugas"
  if (tab === "klasifikasi" || tab === "surat-klasifikasi") return "klasifikasi"
  return "overview"
}

export function SuratView({ theme = "dark", subTab = "overview", onNavigate }: SuratViewProps) {
  const isDark = theme === "dark"
  const { canEdit, currentUser } = useAuth()
  const isAdmin = currentUser?.role === "Admin"
  const readOnly = !canEdit("surat")
  const [activeTab, setActiveTab] = useState<Tab>(() => getInitialTab(subTab))

  // Data from the backend
  const [suratList, setSuratList] = useState<SuratKeluar[]>([])
  const [klasifikasiList, setKlasifikasiList] = useState<KodeKlasifikasiArsip[]>([])
  const [jenisList, setJenisList] = useState<JenisSurat[]>([])
  const [suratTugas, setSuratTugas] = useState<SuratTugas[] | null>(null)
  const [suratTugasError, setSuratTugasError] = useState<string | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [searchQuery, setSearchQuery] = useState("")
  const [showDraftModal, setShowDraftModal] = useState(false)
  const [showKlasifikasiModal, setShowKlasifikasiModal] = useState(false)
  const [isSubmittingKlasifikasi, setIsSubmittingKlasifikasi] = useState(false)
  const [klasifikasiForm, setKlasifikasiForm] = useState({
    kode_klasifikasi: "",
    nama_klasifikasi: "",
    kategori_utama: "Penyelenggaraan Pemilu",
    deskripsi: "",
    retensi_aktif_tahun: 2,
    retensi_inaktif_tahun: 5,
    hak_akses: "Terbatas",
  })
  const blankForm = {
    id_klasifikasi: "",
    id_jenis_surat: "",
    id_bagian: "",
    sifat_surat: SIFAT_SURAT[0],
    perihal: "",
    tujuan_surat: "",
    isi_surat: "",
    lampiran: "",
    tanggal_surat: new Date().toLocaleDateString("en-CA"),
  }
  const [form, setForm] = useState(blankForm)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [letters, klasifikasi, jenis] = await Promise.all([
        request<SuratKeluar[]>(`/surat-keluar?limit=${PAGE_LIMIT}`),
        request<KodeKlasifikasiArsip[]>("/klasifikasi"),
        request<JenisSurat[]>("/jenis-surat"),
      ])
      setSuratList(letters)
      setKlasifikasiList(klasifikasi)
      setJenisList(jenis)
    } catch (e) {
      setError(message(e))
    } finally {
      setLoading(false)
    }
    // Assignment letters are visible to administrators only (enforced by the backend).
    if (isAdmin) {
      try {
        setSuratTugas(await request<SuratTugas[]>(`/surat-tugas?limit=${PAGE_LIMIT}`))
        setSuratTugasError(null)
      } catch (e) {
        setSuratTugasError(message(e))
      }
      request<Department[]>("/bagian/?limit=1000").then(setDepartments).catch(() => setDepartments([]))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const klasifikasiById = useMemo(
    () => new Map(klasifikasiList.map((k) => [k.id_klasifikasi, k])),
    [klasifikasiList]
  )
  const jenisById = useMemo(() => new Map(jenisList.map((j) => [j.id_jenis_surat, j])), [jenisList])

  const countLabel = (n: number) => (suratList.length >= PAGE_LIMIT ? `${n}+` : String(n))
  const draftCount = suratList.filter((s) => s.status === "draft").length
  const terbitCount = suratList.filter((s) => s.status === "terbit").length

  // Distribution of the user's letters per classification category (real data).
  const categoryDistribution = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of suratList) {
      const name = klasifikasiById.get(s.id_klasifikasi)?.kategori_utama ?? "Tanpa klasifikasi"
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    const total = suratList.length || 1
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count)
  }, [suratList, klasifikasiById])

  const filteredSurat = suratList.filter((s) => {
    const q = searchQuery.toLowerCase()
    return (
      s.perihal.toLowerCase().includes(q) ||
      (s.nomor_surat ?? "").toLowerCase().includes(q) ||
      s.tujuan_surat.toLowerCase().includes(q)
    )
  })

  const openDraftModal = () => {
    setForm({
      ...blankForm,
      id_klasifikasi: klasifikasiList[0] ? String(klasifikasiList[0].id_klasifikasi) : "",
      id_jenis_surat: jenisList[0] ? String(jenisList[0].id_jenis_surat) : "",
      id_bagian: currentUser?.id_bagian ? String(currentUser.id_bagian) : "",
    })
    setShowDraftModal(true)
  }

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.perihal.trim() || !form.tujuan_surat.trim()) {
      notify("error", "Mohon isi perihal dan tujuan surat.")
      return
    }
    if (!form.id_klasifikasi || !form.id_jenis_surat || !form.id_bagian) {
      notify("error", "Pilih klasifikasi, jenis surat, dan bagian pengirim.")
      return
    }
    setBusy(true)
    try {
      const created = await request<SuratKeluar>("/surat-keluar/draft", "POST", {
        id_klasifikasi: Number(form.id_klasifikasi),
        id_jenis_surat: Number(form.id_jenis_surat),
        id_bagian: Number(form.id_bagian),
        sifat_surat: form.sifat_surat,
        perihal: form.perihal.trim(),
        tujuan_surat: form.tujuan_surat.trim(),
        isi_surat: form.isi_surat.trim() || null,
        lampiran: form.lampiran.trim() || null,
        tanggal_surat: form.tanggal_surat,
      })
      setSuratList((list) => [created, ...list])
      setShowDraftModal(false)
    } catch {
      // The global notification already shows the server's message.
    } finally {
      setBusy(false)
    }
  }

  const handleFinalize = async (id: number) => {
    setBusy(true)
    try {
      const updated = await request<Partial<SuratKeluar>>(`/surat-keluar/${id}/finalisasi`, "POST", {})
      setSuratList((list) => list.map((s) => (s.id_surat_keluar === id ? { ...s, ...updated } : s)))
    } catch {
      // Server explains why (e.g. official issuance not enabled).
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async (s: SuratKeluar) => {
    setBusy(true)
    try {
      await download(`/surat-keluar/${s.id_surat_keluar}/export?format=pdf`, `surat-${s.id_surat_keluar}.pdf`)
    } catch (e) {
      notify("error", message(e))
    } finally {
      setBusy(false)
    }
  }

  const pageTitle = {
    overview: "Dashboard Persuratan",
    "surat-keluar": "Surat Keluar",
    "surat-tugas": "Surat Tugas",
    klasifikasi: "Kode Klasifikasi",
  }[activeTab]

  const cardClass = `${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} backdrop-blur-md shadow-lg rounded-2xl`
  const headCell = `text-[11px] font-extrabold uppercase tracking-wider ${isDark ? "text-white" : "text-black"}`
  const field = `w-full rounded-xl border px-3 py-2 text-sm outline-none ${isDark ? "bg-[#0f172a] border-white/10 text-white" : "bg-white border-slate-300 text-slate-900"}`
  const emptyRow = (cols: number, text: string) => (
    <TableRow>
      <TableCell colSpan={cols} className="py-8 text-center text-xs text-slate-500">
        {loading ? "Memuat data dari server…" : text}
      </TableCell>
    </TableRow>
  )

  const metric = (label: string, value: string, sub: string, Icon: typeof FileText) => (
    <Card className={`relative overflow-hidden ${cardClass}`}>
      <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600" />
      <CardContent className={`m-3 ml-4 p-4 rounded-xl border flex items-center justify-between min-h-[110px] ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
        <div className="min-w-0">
          <p className={`text-[11px] font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>{label}</p>
          <h2 className={`text-2xl font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>{loading ? "…" : value}</h2>
          <p className={`text-[10px] font-bold mt-1 ${isDark ? "text-gray-400" : "text-slate-600"}`}>{sub}</p>
        </div>
        <div className="w-14 h-14 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0">
          <Icon className="w-6 h-6" />
        </div>
      </CardContent>
    </Card>
  )

  const suratRow = (s: SuratKeluar, withActions: boolean) => {
    const status = STATUS_LABEL[s.status] ?? { label: s.status, variant: "secondary" as const }
    const klas = klasifikasiById.get(s.id_klasifikasi)
    return (
      <TableRow key={s.id_surat_keluar} className={isDark ? "border-b border-white/20" : "border-b border-slate-100"}>
        <TableCell className="font-mono text-xs font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
          {s.nomor_surat || "(belum bernomor)"}
        </TableCell>
        <TableCell className={`text-xs font-semibold ${isDark ? "text-white" : "text-black"}`}>
          {s.perihal}
          <span className="block text-[10px] font-medium text-slate-500">
            {klas ? `${klas.kode_klasifikasi} · ` : ""}{jenisById.get(s.id_jenis_surat)?.nama_jenis ?? ""}
          </span>
        </TableCell>
        <TableCell className={`text-xs ${isDark ? "text-gray-200" : "text-slate-800"}`}>{s.tujuan_surat}</TableCell>
        <TableCell className={`text-xs whitespace-nowrap ${isDark ? "text-gray-300" : "text-slate-800"}`}>{formatDate(s.tanggal_surat)}</TableCell>
        <TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell>
        {withActions && (
          <TableCell className="whitespace-nowrap">
            {s.status === "draft" && isAdmin && !readOnly && (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleFinalize(s.id_surat_keluar)}
                className="btn-kpu-red px-3 py-1.5 text-white text-[11px] font-bold rounded-lg inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" /> Terbitkan Nomor
              </button>
            )}
            {s.status === "terbit" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleExport(s)}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer ${isDark ? "border-white/10 text-white" : "border-slate-300 text-slate-800"}`}
              >
                <Download className="w-3.5 h-3.5" /> PDF
              </button>
            )}
          </TableCell>
        )}
      </TableRow>
    )
  }

  const suratHead = (withActions: boolean) => (
    <TableHeader>
      <TableRow className={isDark ? "border-b border-white/30 bg-[#0a0e1a]" : "border-b border-slate-200 bg-slate-100"}>
        <TableHead className={headCell}>No. Surat</TableHead>
        <TableHead className={headCell}>Perihal</TableHead>
        <TableHead className={headCell}>Tujuan</TableHead>
        <TableHead className={headCell}>Tanggal</TableHead>
        <TableHead className={headCell}>Status</TableHead>
        {withActions && <TableHead className={headCell}>Aksi</TableHead>}
      </TableRow>
    </TableHeader>
  )

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">Surat</p>
          <h1 className={`text-xl font-bold tracking-tight my-0 ${isDark ? "text-white" : "text-black"}`}>{pageTitle}</h1>
          <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
            Penomoran surat keluar, penugasan pegawai, dan klasifikasi arsip
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className={`px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50 ${isDark ? "border-slate-700 bg-[#0f172a] text-white" : "border-slate-300 bg-white text-black"}`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Muat Ulang
          </button>
          {activeTab === "surat-keluar" && !readOnly && (
            <button
              type="button"
              onClick={openDraftModal}
              disabled={loading || klasifikasiList.length === 0 || jenisList.length === 0}
              title={klasifikasiList.length === 0 || jenisList.length === 0 ? "Data master klasifikasi/jenis surat belum tersedia" : undefined}
              className="btn-kpu-red px-4 py-2 text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer disabled:opacity-40"
            >
              <Plus className="w-4 h-4" /> Buat Draft Surat
            </button>
          )}
        </div>
      </div>

      {readOnly && (
        <ReadOnlyBanner theme={theme} modul="persuratan" pengelola="Sub Bagian Umum dan Logistik" />
      )}

      {error && (
        <div role="alert" className="flex items-center gap-2 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* 1. OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4">
            {metric("Total Surat Keluar", countLabel(suratList.length), "Yang dapat Anda akses", FileText)}
            {metric("Draft Dalam Proses", countLabel(draftCount), "Belum bernomor resmi", Clock)}
            {metric("Surat Terbit", countLabel(terbitCount), "Bernomor resmi", CheckCircle2)}
            {metric("Kode Klasifikasi", String(klasifikasiList.length), "Data master arsip", Database)}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <Card className={`min-w-0 xl:col-span-2 ${cardClass}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <CardTitle className={`text-sm font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>Surat Keluar Terbaru</CardTitle>
                <button
                  type="button"
                  onClick={() => { setActiveTab("surat-keluar"); onNavigate?.("surat-keluar") }}
                  className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                >
                  Lihat semua
                </button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  {suratHead(false)}
                  <TableBody>
                    {suratList.length === 0 ? emptyRow(5, "Belum ada surat keluar.") : suratList.slice(0, 5).map((s) => suratRow(s, false))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className={`min-w-0 ${cardClass}`}>
              <CardHeader className="pb-3 border-b border-slate-200 dark:border-slate-800">
                <CardTitle className={`text-sm font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>Distribusi per Kategori Klasifikasi</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {categoryDistribution.length === 0 && (
                  <p className="py-6 text-center text-xs text-slate-500">{loading ? "Memuat…" : "Belum ada data."}</p>
                )}
                {categoryDistribution.map((c) => (
                  <div key={c.name}>
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className={isDark ? "text-gray-200" : "text-slate-800"}>{c.name}</span>
                      <span className="text-slate-500">{c.count} ({c.pct}%)</span>
                    </div>
                    <div className={`h-2 rounded-full ${isDark ? "bg-slate-800" : "bg-slate-200"}`}>
                      <div className="h-2 rounded-full bg-red-600" style={{ width: `${c.pct}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {isAdmin && (
            <Card className={cardClass}>
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <CardTitle className={`text-sm font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>Surat Tugas Terbaru</CardTitle>
                <button
                  type="button"
                  onClick={() => { setActiveTab("surat-tugas"); onNavigate?.("surat-tugas") }}
                  className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                >
                  Lihat semua
                </button>
              </CardHeader>
              <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                {suratTugasError && <p className="text-xs text-red-500 md:col-span-3">{suratTugasError}</p>}
                {suratTugas && suratTugas.length === 0 && <p className="text-xs text-slate-500 md:col-span-3">Belum ada surat tugas.</p>}
                {(suratTugas ?? []).slice(0, 3).map((st) => (
                  <div key={st.id_surat_tugas} className={`rounded-xl border p-3 text-xs ${isDark ? "border-white/10 bg-[#111827]/60" : "border-slate-200 bg-slate-50"}`}>
                    <p className={`font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{st.maksud_tugas}</p>
                    <p className="mt-1 text-slate-500">{formatDate(st.tanggal_mulai)} – {formatDate(st.tanggal_selesai)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 2. SURAT KELUAR */}
      {activeTab === "surat-keluar" && (
        <Card className={cardClass}>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="relative w-full sm:max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                aria-label="Cari surat keluar"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari perihal, nomor, atau tujuan…"
                className={`${field} pl-9`}
              />
            </div>
            <span className="text-xs font-semibold text-slate-500">
              {filteredSurat.length} dari {countLabel(suratList.length)} surat
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              {suratHead(true)}
              <TableBody>
                {filteredSurat.length === 0
                  ? emptyRow(6, searchQuery ? "Tidak ada surat yang cocok." : "Belum ada surat keluar.")
                  : filteredSurat.map((s) => suratRow(s, true))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 3. SURAT TUGAS */}
      {activeTab === "surat-tugas" && (
        <Card className={cardClass}>
          <CardContent className="p-0">
            {!isAdmin ? (
              <p className="p-8 text-center text-xs text-slate-500">Daftar surat tugas hanya dapat dilihat oleh administrator.</p>
            ) : suratTugasError ? (
              <p className="p-8 text-center text-xs text-red-500">{suratTugasError}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className={isDark ? "border-b border-white/30 bg-[#0a0e1a]" : "border-b border-slate-200 bg-slate-100"}>
                    <TableHead className={headCell}>No. Tugas</TableHead>
                    <TableHead className={headCell}>Maksud Tugas</TableHead>
                    <TableHead className={headCell}>Tempat</TableHead>
                    <TableHead className={headCell}>Periode</TableHead>
                    <TableHead className={headCell}>Beban Anggaran</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suratTugas === null || suratTugas.length === 0
                    ? emptyRow(5, "Belum ada surat tugas.")
                    : suratTugas.map((st) => (
                        <TableRow key={st.id_surat_tugas} className={isDark ? "border-b border-white/20" : "border-b border-slate-100"}>
                          <TableCell className="font-mono text-xs font-bold text-red-600 dark:text-red-400">{st.nomor_tugas || "-"}</TableCell>
                          <TableCell className={`text-xs font-semibold ${isDark ? "text-white" : "text-black"}`}>
                            <Briefcase className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />{st.maksud_tugas}
                          </TableCell>
                          <TableCell className="text-xs">
                            {st.tempat_tugas ? <><MapPin className="w-3.5 h-3.5 inline mr-1 text-slate-400" />{st.tempat_tugas}</> : "-"}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{formatDate(st.tanggal_mulai)} – {formatDate(st.tanggal_selesai)}</TableCell>
                          <TableCell className="text-xs">{st.beban_anggaran || "-"}</TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* 4. KODE KLASIFIKASI */}
      {activeTab === "klasifikasi" && (
        <Card className={cardClass}>
          {isAdmin && (
            <div className={`p-4 border-b flex items-center justify-between ${isDark ? "border-white/10" : "border-slate-200"}`}>
              <span className={`text-xs font-semibold ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                Daftar Kode Klasifikasi Resmi KPU
              </span>
              <button
                type="button"
                onClick={() => setShowKlasifikasiModal(true)}
                className="btn-kpu-red px-3.5 py-1.5 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Kode Klasifikasi</span>
              </button>
            </div>
          )}
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className={isDark ? "border-b border-white/30 bg-[#0a0e1a]" : "border-b border-slate-200 bg-slate-100"}>
                  <TableHead className={headCell}>Kode</TableHead>
                  <TableHead className={headCell}>Nama Klasifikasi</TableHead>
                  <TableHead className={headCell}>Kategori</TableHead>
                  <TableHead className={headCell}>Retensi Aktif / Inaktif</TableHead>
                  <TableHead className={headCell}>Hak Akses</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {klasifikasiList.length === 0
                  ? emptyRow(5, "Data master klasifikasi belum tersedia di server.")
                  : klasifikasiList.map((k) => (
                      <TableRow key={k.id_klasifikasi} className={isDark ? "border-b border-white/20" : "border-b border-slate-100"}>
                        <TableCell className="font-mono text-xs font-bold text-red-600 dark:text-red-400">{k.kode_klasifikasi}</TableCell>
                        <TableCell className={`text-xs font-semibold ${isDark ? "text-white" : "text-black"}`}>{k.nama_klasifikasi}</TableCell>
                        <TableCell className="text-xs">{k.kategori_utama}</TableCell>
                        <TableCell className="text-xs">{k.retensi_aktif_tahun} th / {k.retensi_inaktif_tahun} th</TableCell>
                        <TableCell><Badge variant="outline">{k.hak_akses}</Badge></TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* DRAFT MODAL */}
      {showDraftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Buat draft surat keluar">
          <form
            onSubmit={handleCreateDraft}
            className={`w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl border p-6 space-y-4 shadow-2xl ${isDark ? "bg-[#1e293b] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"}`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Buat Draft Surat Keluar</h2>
              <button type="button" aria-label="Tutup" onClick={() => setShowDraftModal(false)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold">
              <label className="space-y-1.5">
                <span>Kode Klasifikasi *</span>
                <select required className={field} value={form.id_klasifikasi} onChange={(e) => setForm({ ...form, id_klasifikasi: e.target.value })}>
                  {klasifikasiList.map((k) => (
                    <option key={k.id_klasifikasi} value={k.id_klasifikasi}>{k.kode_klasifikasi} — {k.nama_klasifikasi}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span>Jenis Surat *</span>
                <select required className={field} value={form.id_jenis_surat} onChange={(e) => setForm({ ...form, id_jenis_surat: e.target.value })}>
                  {jenisList.map((j) => (
                    <option key={j.id_jenis_surat} value={j.id_jenis_surat}>{j.nama_jenis} ({j.kode_jenis})</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span>Bagian Pengirim *</span>
                {isAdmin ? (
                  <select required className={field} value={form.id_bagian} onChange={(e) => setForm({ ...form, id_bagian: e.target.value })}>
                    <option value="">Pilih bagian…</option>
                    {departments.map((d) => (
                      <option key={d.id_bagian} value={d.id_bagian}>{d.nama_bagian}</option>
                    ))}
                  </select>
                ) : (
                  <input readOnly className={field} value={currentUser?.subbagian || "Akun belum memiliki bagian"} />
                )}
              </label>
              <label className="space-y-1.5">
                <span>Sifat Surat</span>
                <select className={field} value={form.sifat_surat} onChange={(e) => setForm({ ...form, sifat_surat: e.target.value })}>
                  {SIFAT_SURAT.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="space-y-1.5">
                <span>Tanggal Surat *</span>
                <input type="date" required className={field} value={form.tanggal_surat} onChange={(e) => setForm({ ...form, tanggal_surat: e.target.value })} />
              </label>
              <label className="space-y-1.5">
                <span>Lampiran</span>
                <input className={field} value={form.lampiran} placeholder="Contoh: 1 berkas" onChange={(e) => setForm({ ...form, lampiran: e.target.value })} />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span>Perihal *</span>
                <input required className={field} value={form.perihal} onChange={(e) => setForm({ ...form, perihal: e.target.value })} />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span>Tujuan Surat *</span>
                <input required className={field} value={form.tujuan_surat} onChange={(e) => setForm({ ...form, tujuan_surat: e.target.value })} />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span>Isi Surat</span>
                <textarea rows={5} className={field} value={form.isi_surat} onChange={(e) => setForm({ ...form, isi_surat: e.target.value })} />
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowDraftModal(false)} className={`px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer ${isDark ? "border-white/10" : "border-slate-300"}`}>
                Batal
              </button>
              <button type="submit" disabled={busy} className="btn-kpu-red px-4 py-2 text-white text-xs font-bold rounded-xl disabled:opacity-40 cursor-pointer">
                {busy ? "Menyimpan…" : "Simpan Draft"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL TAMBAH KODE KLASIFIKASI (ADMIN ONLY) */}
      {showKlasifikasiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200" role="dialog" aria-modal="true">
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (!klasifikasiForm.kode_klasifikasi || !klasifikasiForm.nama_klasifikasi) {
                notify("error", "Harap lengkapi kode dan nama klasifikasi!")
                return
              }
              try {
                setIsSubmittingKlasifikasi(true)
                await createKlasifikasi(klasifikasiForm)
                notify("success", `Kode klasifikasi ${klasifikasiForm.kode_klasifikasi} berhasil didaftarkan`)
                setShowKlasifikasiModal(false)
                setKlasifikasiForm({
                  kode_klasifikasi: "",
                  nama_klasifikasi: "",
                  kategori_utama: "Penyelenggaraan Pemilu",
                  deskripsi: "",
                  retensi_aktif_tahun: 2,
                  retensi_inaktif_tahun: 5,
                  hak_akses: "Terbatas",
                })
                await load()
              } catch (err: any) {
                notify("error", err.message || "Gagal menambahkan kode klasifikasi")
              } finally {
                setIsSubmittingKlasifikasi(false)
              }
            }}
            className={`w-full max-w-lg rounded-2xl border p-6 space-y-4 shadow-2xl backdrop-blur-md ${
              isDark ? "bg-[#1e293b] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Database className="w-5 h-5 text-red-600" />
                Tambah Kode Klasifikasi Arsip
              </h2>
              <button
                type="button"
                onClick={() => setShowKlasifikasiModal(false)}
                className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs font-semibold">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-500 dark:text-slate-400">
                    Kode Klasifikasi *
                  </label>
                  <input
                    required
                    placeholder="Contoh: PL.01"
                    value={klasifikasiForm.kode_klasifikasi}
                    onChange={(e) => setKlasifikasiForm({ ...klasifikasiForm, kode_klasifikasi: e.target.value })}
                    className={field}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-500 dark:text-slate-400">
                    Kategori Utama *
                  </label>
                  <select
                    value={klasifikasiForm.kategori_utama}
                    onChange={(e) => setKlasifikasiForm({ ...klasifikasiForm, kategori_utama: e.target.value })}
                    className={field}
                  >
                    <option value="Penyelenggaraan Pemilu">Penyelenggaraan Pemilu</option>
                    <option value="Fasilitasi & Dukungan Teknis">Fasilitasi & Dukungan Teknis</option>
                    <option value="Pengawasan & Hukum">Pengawasan & Hukum</option>
                    <option value="Sosialisasi & Partisipasi">Sosialisasi & Partisipasi</option>
                    <option value="Keuangan & Logistik">Keuangan & Logistik</option>
                    <option value="Umum & Kepegawaian">Umum & Kepegawaian</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-500 dark:text-slate-400">
                  Nama Klasifikasi *
                </label>
                <input
                  required
                  placeholder="Contoh: Pencalonan Peserta Pemilu dan Pemilihan"
                  value={klasifikasiForm.nama_klasifikasi}
                  onChange={(e) => setKlasifikasiForm({ ...klasifikasiForm, nama_klasifikasi: e.target.value })}
                  className={field}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-500 dark:text-slate-400">
                  Deskripsi / Keterangan
                </label>
                <input
                  placeholder="Keterangan dokumen yang dicakup..."
                  value={klasifikasiForm.deskripsi}
                  onChange={(e) => setKlasifikasiForm({ ...klasifikasiForm, deskripsi: e.target.value })}
                  className={field}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-500 dark:text-slate-400">
                    Retensi Aktif (th)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={klasifikasiForm.retensi_aktif_tahun}
                    onChange={(e) => setKlasifikasiForm({ ...klasifikasiForm, retensi_aktif_tahun: Number(e.target.value) || 0 })}
                    className={field}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-500 dark:text-slate-400">
                    Retensi Inaktif (th)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={klasifikasiForm.retensi_inaktif_tahun}
                    onChange={(e) => setKlasifikasiForm({ ...klasifikasiForm, retensi_inaktif_tahun: Number(e.target.value) || 0 })}
                    className={field}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-500 dark:text-slate-400">
                    Hak Akses
                  </label>
                  <select
                    value={klasifikasiForm.hak_akses}
                    onChange={(e) => setKlasifikasiForm({ ...klasifikasiForm, hak_akses: e.target.value })}
                    className={field}
                  >
                    <option value="Terbuka">Terbuka</option>
                    <option value="Terbatas">Terbatas</option>
                    <option value="Rahasia">Rahasia</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setShowKlasifikasiModal(false)}
                className={`px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer ${
                  isDark ? "border-white/10 hover:bg-slate-800 text-gray-300" : "border-slate-300 hover:bg-slate-100 text-slate-700"
                }`}
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmittingKlasifikasi}
                className="btn-kpu-red px-5 py-2 text-white text-xs font-bold rounded-xl disabled:opacity-40 cursor-pointer shadow-md"
              >
                {isSubmittingKlasifikasi ? "Menyimpan…" : "Simpan Klasifikasi"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
