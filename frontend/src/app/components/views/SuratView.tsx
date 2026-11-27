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
  Lock,
  Inbox,
  Users,
  Pencil,
  Trash2,
  Archive,
  RotateCcw,
  Upload,
  ShieldCheck,
} from "lucide-react"
import type { SuratKeluar, KodeKlasifikasiArsip, JenisSurat } from "../../../types"
import { request, download, message } from "../../../services/operations"
import { createKlasifikasi, filesApi } from "../../../services/api"
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
  dasar_tugas?: string | null
  tempat_tugas: string | null
  tanggal_mulai: string
  tanggal_selesai: string
  beban_anggaran: string | null
  id_pagu?: number | null
  laporan_file_id?: number | null
  status_surat?: string | null
  pelaksana?: { id_pegawai: number; nama: string | null; peran_tugas: string }[]
}

interface RiwayatSuratItem {
  id_riwayat: number
  id_pegawai: number
  nama_pegawai: string
  status_lama: string | null
  status_baru: string
  catatan: string | null
  waktu: string | null
}

interface KonflikTugasItem {
  id_pegawai: number
  nama_pegawai: string
  id_surat_tugas: number
  nomor_tugas: string
  maksud_tugas: string
  tempat_tugas: string
  tanggal_mulai: string
  tanggal_selesai: string
}

interface PegawaiOption {
  id_pegawai: number
  nama: string
  is_active?: boolean
}

interface PenerbitanStatus {
  official_issuance_enabled: boolean
  has_numbering_authority: boolean
  has_signing_authority?: boolean
  is_letter_manager?: boolean
}

const BEBAN_ANGGARAN = ["DIPA KPU Provinsi Sulawesi Utara", "Non-DIPA"]

const TABS: { id: Tab | "surat-masuk"; label: string }[] = [
  { id: "overview", label: "Dashboard" },
  { id: "surat-masuk", label: "Surat Masuk & Disposisi" },
  { id: "surat-keluar", label: "Surat Keluar" },
  { id: "surat-tugas", label: "Surat Tugas" },
  { id: "klasifikasi", label: "Kode Klasifikasi" },
]

/** Menu ids used by App.tsx for each tab. */
const TAB_ROUTE: Record<Tab | "surat-masuk", string> = {
  overview: "surat-summary",
  "surat-masuk": "surat-masuk",
  "surat-keluar": "surat-keluar",
  "surat-tugas": "surat-tugas",
  klasifikasi: "surat-klasifikasi",
}

interface Department {
  id_bagian: number
  nama_bagian: string
}

/** The list endpoint returns at most this many rows per request. */
const PAGE_LIMIT = 100

const STATUS_LABEL: Record<string, { label: string; variant: "draft" | "success" | "terkirim" | "secondary" | "info" | "warning" }> = {
  draft: { label: "Draft", variant: "draft" },
  diajukan: { label: "Diajukan", variant: "info" },
  revisi: { label: "Perlu Revisi", variant: "warning" },
  disetujui: { label: "Disetujui", variant: "terkirim" },
  terbit: { label: "Terbit", variant: "success" },
  diarsipkan: { label: "Diarsipkan", variant: "secondary" },
}

const PERAN_TUGAS_OPTIONS = ["Ketua Tim", "Wakil Ketua", "Sekretaris Tim", "Anggota", "Pelaksana", "Pendamping"]

/** Form options for the "sifat surat" field (letter urgency class). */
const SIFAT_SURAT = ["Biasa", "Penting", "Segera", "Rahasia"]

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-"

const getInitialTab = (tab: string): Tab => {
  if (tab === "keluar" || tab === "surat-keluar") return "surat-keluar"
  if (tab === "surat-tugas") return "surat-tugas"
  if (tab === "klasifikasi" || tab === "surat-klasifikasi") return "klasifikasi"
  return "overview"
}

export function SuratView({ theme = "dark", subTab = "overview", onNavigate }: SuratViewProps) {
  const isDark = theme === "dark"
  const { canEdit, currentUser } = useAuth()
  const isAdmin = currentUser?.role === "Admin"
  const readOnly = !canEdit("surat")
  const [activeTab, setActiveTab] = useState<Tab>(() => getInitialTab(subTab))
  // Keep the local tab in step when the sidebar/router changes subTab.
  useEffect(() => {
    setActiveTab(getInitialTab(subTab))
  }, [subTab])

  const goToTab = (tab: Tab | "surat-masuk") => {
    if (tab !== "surat-masuk") setActiveTab(tab)
    onNavigate?.(TAB_ROUTE[tab])
  }

  // Data from the backend
  const [suratList, setSuratList] = useState<SuratKeluar[]>([])
  const [klasifikasiList, setKlasifikasiList] = useState<KodeKlasifikasiArsip[]>([])
  const [jenisList, setJenisList] = useState<JenisSurat[]>([])
  const [suratTugas, setSuratTugas] = useState<SuratTugas[] | null>(null)
  const [suratTugasError, setSuratTugasError] = useState<string | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [pegawaiList, setPegawaiList] = useState<PegawaiOption[]>([])
  const [penerbitan, setPenerbitan] = useState<PenerbitanStatus | null>(null)
  const [statusFilter, setStatusFilter] = useState("")
  const [tahunFilter, setTahunFilter] = useState("")
  const [kategoriFilter, setKategoriFilter] = useState("")
  const [showTugasModal, setShowTugasModal] = useState(false)
  const blankTugas = {
    maksud_tugas: "",
    dasar_tugas: "",
    tempat_tugas: "",
    tanggal_mulai: new Date().toLocaleDateString("en-CA"),
    tanggal_selesai: new Date().toLocaleDateString("en-CA"),
    beban_anggaran: BEBAN_ANGGARAN[0],
    id_klasifikasi: "",
    id_bagian: "",
    pelaksana: [] as number[],
  }
  const [tugasForm, setTugasForm] = useState(blankTugas)
  const [pelaksanaRoles, setPelaksanaRoles] = useState<Record<number, string>>({})
  const [tugasKonflik, setTugasKonflik] = useState<KonflikTugasItem[]>([])
  const [pelaksanaSearch, setPelaksanaSearch] = useState("")
  // Document detail views (open to every account; read-only accounts get no edit actions)
  const [detailSurat, setDetailSurat] = useState<SuratKeluar | null>(null)
  const [detailRiwayat, setDetailRiwayat] = useState<RiwayatSuratItem[]>([])
  const [reviewNote, setReviewNote] = useState("")
  const [detailTugas, setDetailTugas] = useState<SuratTugas | null>(null)
  const [laporanFile, setLaporanFile] = useState<File | null>(null)
  // Surat Tugas filters
  const [tugasSearch, setTugasSearch] = useState("")
  const [tugasBeban, setTugasBeban] = useState("")
  const [tugasTahun, setTugasTahun] = useState("")
  // Kode Klasifikasi filters
  const [klasSearch, setKlasSearch] = useState("")
  const [klasKategori, setKlasKategori] = useState("")
  const [klasAkses, setKlasAkses] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [searchQuery, setSearchQuery] = useState("")
  const [showDraftModal, setShowDraftModal] = useState(false)
  const [editingSuratId, setEditingSuratId] = useState<number | null>(null)
  const [showKlasifikasiModal, setShowKlasifikasiModal] = useState(false)
  const [editingKlasifikasiId, setEditingKlasifikasiId] = useState<number | null>(null)
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
    tembusan: "",
    atas_nama: "",
    penandatangan_jabatan: "",
    penandatangan_nama: "",
    tanggal_surat: new Date().toLocaleDateString("en-CA"),
  }
  const [form, setForm] = useState(blankForm)

  // Lists are fetched 100 at a time; "Muat 100 berikutnya" appends older records.
  const [hasMoreSurat, setHasMoreSurat] = useState(false)
  const [hasMoreTugas, setHasMoreTugas] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const loadMoreSurat = async () => {
    setLoadingMore(true)
    try {
      const batch = await request<SuratKeluar[]>(`/surat-keluar?limit=${PAGE_LIMIT}&skip=${suratList.length}`)
      setSuratList((list) => {
        const seen = new Set(list.map((s) => s.id_surat_keluar))
        return [...list, ...batch.filter((s) => !seen.has(s.id_surat_keluar))]
      })
      setHasMoreSurat(batch.length === PAGE_LIMIT)
      notify("info", batch.length ? `${batch.length} surat keluar lama dimuat` : "Semua surat keluar sudah dimuat")
    } catch (e) {
      notify("error", message(e))
    } finally {
      setLoadingMore(false)
    }
  }

  const loadMoreTugas = async () => {
    setLoadingMore(true)
    try {
      const current = suratTugas ?? []
      const batch = await request<SuratTugas[]>(`/surat-tugas?limit=${PAGE_LIMIT}&skip=${current.length}`)
      setSuratTugas((list) => {
        const existing = list ?? []
        const seen = new Set(existing.map((t) => t.id_surat_tugas))
        return [...existing, ...batch.filter((t) => !seen.has(t.id_surat_tugas))]
      })
      setHasMoreTugas(batch.length === PAGE_LIMIT)
      notify("info", batch.length ? `${batch.length} surat tugas lama dimuat` : "Semua surat tugas sudah dimuat")
    } catch (e) {
      notify("error", message(e))
    } finally {
      setLoadingMore(false)
    }
  }

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
      setHasMoreSurat(letters.length === PAGE_LIMIT)
      setKlasifikasiList(klasifikasi)
      setJenisList(jenis)
    } catch (e) {
      setError(message(e))
    } finally {
      setLoading(false)
    }
    // Managers see every assignment; other staff see the ones they take part in (backend-enforced).
    try {
      const tugas = await request<SuratTugas[]>(`/surat-tugas?limit=${PAGE_LIMIT}`)
      setSuratTugas(tugas)
      setHasMoreTugas(tugas.length === PAGE_LIMIT)
      setSuratTugasError(null)
    } catch (e) {
      setSuratTugasError(message(e))
    }
    request<Department[]>("/bagian/?limit=1000").then(setDepartments).catch(() => setDepartments([]))
    request<PenerbitanStatus>("/surat-keluar/penerbitan-status").then(setPenerbitan).catch(() => setPenerbitan(null))
    if (!readOnly) {
      request<PegawaiOption[]>("/pegawai/?limit=1000").then(setPegawaiList).catch(() => setPegawaiList([]))
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

  const countLabel = (n: number) => (hasMoreSurat ? `${n}+` : String(n))
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

  const tahunOptions = useMemo(
    () => [...new Set(suratList.map((s) => s.tahun).filter(Boolean))].sort((a, b) => b - a),
    [suratList]
  )
  const kategoriOptions = useMemo(
    () => [...new Set(klasifikasiList.map((k) => k.kategori_utama))].sort(),
    [klasifikasiList]
  )
  const filtersActive = Boolean(searchQuery || statusFilter || tahunFilter || kategoriFilter)

  const filteredSurat = suratList.filter((s) => {
    const q = searchQuery.toLowerCase()
    const matchesText =
      s.perihal.toLowerCase().includes(q) ||
      (s.nomor_surat ?? "").toLowerCase().includes(q) ||
      s.tujuan_surat.toLowerCase().includes(q)
    return (
      matchesText &&
      (!statusFilter || s.status === statusFilter) &&
      (!tahunFilter || String(s.tahun) === tahunFilter) &&
      (!kategoriFilter || klasifikasiById.get(s.id_klasifikasi)?.kategori_utama === kategoriFilter)
    )
  })

  const tugasList = suratTugas ?? []
  const tugasTahunOptions = [...new Set(tugasList.map((t) => t.tanggal_mulai.slice(0, 4)))].sort().reverse()
  const tugasBebanOptions = [...new Set(tugasList.map((t) => t.beban_anggaran).filter((b): b is string => Boolean(b)))].sort()
  const tugasFiltersActive = Boolean(tugasSearch || tugasBeban || tugasTahun)
  const filteredTugas = tugasList.filter((t) => {
    const q = tugasSearch.toLowerCase()
    const text = [t.nomor_tugas, t.maksud_tugas, t.tempat_tugas, ...(t.pelaksana ?? []).map((p) => p.nama)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
    return (
      (!q || text.includes(q)) &&
      (!tugasBeban || t.beban_anggaran === tugasBeban) &&
      (!tugasTahun || t.tanggal_mulai.startsWith(tugasTahun))
    )
  })

  const klasAksesOptions = [...new Set(klasifikasiList.map((k) => k.hak_akses))].sort()
  const klasFiltersActive = Boolean(klasSearch || klasKategori || klasAkses)
  const filteredKlasifikasi = klasifikasiList.filter((k) => {
    const q = klasSearch.toLowerCase()
    return (
      (!q || `${k.kode_klasifikasi} ${k.nama_klasifikasi} ${k.deskripsi ?? ""}`.toLowerCase().includes(q)) &&
      (!klasKategori || k.kategori_utama === klasKategori) &&
      (!klasAkses || k.hak_akses === klasAkses)
    )
  })

  const openSuratDetail = (s: SuratKeluar) => {
    setDetailSurat(s)
    setReviewNote("")
    setDetailRiwayat([])
    request<RiwayatSuratItem[]>(`/surat-keluar/${s.id_surat_keluar}/riwayat`)
      .then(setDetailRiwayat)
      .catch(() => setDetailRiwayat([]))
  }
  const openTugasDetail = (t: SuratTugas) => {
    setDetailTugas(t)
    setLaporanFile(null)
  }

  // Live schedule conflict check whenever pelaksana or dates change in Surat Tugas modal
  useEffect(() => {
    if (!showTugasModal || tugasForm.pelaksana.length === 0 || !tugasForm.tanggal_mulai || !tugasForm.tanggal_selesai || tugasForm.tanggal_selesai < tugasForm.tanggal_mulai) {
      setTugasKonflik([])
      return
    }
    const qs = new URLSearchParams({
      pelaksana: tugasForm.pelaksana.join(","),
      tanggal_mulai: tugasForm.tanggal_mulai,
      tanggal_selesai: tugasForm.tanggal_selesai,
    })
    request<{ konflik: KonflikTugasItem[] }>(`/surat-tugas/cek-konflik?${qs}`)
      .then((res) => setTugasKonflik(res.konflik || []))
      .catch(() => setTugasKonflik([]))
  }, [showTugasModal, tugasForm.pelaksana, tugasForm.tanggal_mulai, tugasForm.tanggal_selesai])
  const rowKeys = (open: () => void) => ({
    role: "button" as const,
    tabIndex: 0,
    onClick: open,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        open()
      }
    },
  })

  // Issuing an official number needs the server flag and a deployment authority grant.
  const issuanceLocked = !penerbitan?.official_issuance_enabled || !penerbitan?.has_numbering_authority
  const issuanceLockReason = !penerbitan
    ? "Status penerbitan resmi belum dapat dimuat dari server."
    : !penerbitan.official_issuance_enabled
      ? "Penerbitan nomor resmi sedang terkunci (mode uji coba). Aktifkan OFFICIAL_ISSUANCE_ENABLED di server setelah format nomor dan kewenangan penandatangan divalidasi."
      : "Akun Anda belum memiliki penugasan penomoran resmi (AUTHORITY_GRANTS) yang berlaku."

  // Non-admins send from their own section; fall back to matching the profile's section name.
  const ownBagianId =
    currentUser?.id_bagian ??
    departments.find((d) => d.nama_bagian.toLowerCase() === (currentUser?.subbagian ?? "").toLowerCase())?.id_bagian ??
    null

  const canReviewSurat = Boolean(
    isAdmin || penerbitan?.is_letter_manager || penerbitan?.has_signing_authority || penerbitan?.has_numbering_authority
  )

  const openDraftModal = () => {
    setEditingSuratId(null)
    setForm({
      ...blankForm,
      id_klasifikasi: klasifikasiList[0] ? String(klasifikasiList[0].id_klasifikasi) : "",
      id_jenis_surat: jenisList[0] ? String(jenisList[0].id_jenis_surat) : "",
      id_bagian: ownBagianId ? String(ownBagianId) : "",
    })
    setShowDraftModal(true)
  }

  const openEditDraftModal = (s: SuratKeluar) => {
    setEditingSuratId(s.id_surat_keluar)
    setForm({
      id_klasifikasi: String(s.id_klasifikasi),
      id_jenis_surat: String(s.id_jenis_surat),
      id_bagian: String(s.id_bagian),
      sifat_surat: s.sifat_surat || SIFAT_SURAT[0],
      perihal: s.perihal,
      tujuan_surat: s.tujuan_surat,
      isi_surat: s.isi_surat || "",
      lampiran: s.lampiran || "",
      tembusan: s.tembusan || "",
      atas_nama: s.atas_nama || "",
      penandatangan_jabatan: s.penandatangan_jabatan || "",
      penandatangan_nama: s.penandatangan_nama || "",
      tanggal_surat: s.tanggal_surat,
    })
    setShowDraftModal(true)
  }

  const openTugasModal = () => {
    setTugasForm({
      ...blankTugas,
      id_klasifikasi: klasifikasiList[0] ? String(klasifikasiList[0].id_klasifikasi) : "",
    })
    setPelaksanaRoles({})
    setTugasKonflik([])
    setPelaksanaSearch("")
    setShowTugasModal(true)
  }

  const togglePelaksana = (id: number) =>
    setTugasForm((f) => ({
      ...f,
      pelaksana: f.pelaksana.includes(id) ? f.pelaksana.filter((x) => x !== id) : [...f.pelaksana, id],
    }))

  const handleCreateTugas = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tugasForm.maksud_tugas.trim() || !tugasForm.tempat_tugas.trim()) {
      notify("error", "Mohon isi maksud penugasan dan tempat tugas.")
      return
    }
    if (tugasForm.tanggal_selesai < tugasForm.tanggal_mulai) {
      notify("error", "Tanggal selesai tidak boleh sebelum tanggal mulai.")
      return
    }
    if (!tugasForm.id_klasifikasi) {
      notify("error", "Pilih kode klasifikasi surat tugas.")
      return
    }
    if (tugasForm.pelaksana.length === 0) {
      notify("error", "Pilih minimal satu pegawai pelaksana tugas.")
      return
    }
    setBusy(true)
    try {
      const created = await request<SuratTugas>("/surat-tugas", "POST", {
        maksud_tugas: tugasForm.maksud_tugas.trim(),
        dasar_tugas: tugasForm.dasar_tugas.trim() || null,
        tempat_tugas: tugasForm.tempat_tugas.trim(),
        tanggal_mulai: tugasForm.tanggal_mulai,
        tanggal_selesai: tugasForm.tanggal_selesai,
        beban_anggaran: tugasForm.beban_anggaran,
        id_klasifikasi: Number(tugasForm.id_klasifikasi),
        id_bagian: tugasForm.id_bagian ? Number(tugasForm.id_bagian) : null,
        pelaksana_detail: tugasForm.pelaksana.map((id) => ({
          id_pegawai: id,
          peran_tugas: pelaksanaRoles[id] || "Pelaksana",
        })),
      })
      setSuratTugas((list) => [created, ...(list ?? [])])
      setShowTugasModal(false)
      request<SuratKeluar[]>(`/surat-keluar?limit=${PAGE_LIMIT}`)
        .then((letters) => {
          setSuratList(letters)
          setHasMoreSurat(letters.length === PAGE_LIMIT)
        })
        .catch(() => {})
    } catch {
      // The global notification already shows the server's message.
    } finally {
      setBusy(false)
    }
  }

  const handleUploadLaporanTugas = async (tugas: SuratTugas) => {
    if (!laporanFile) return
    setBusy(true)
    try {
      await filesApi.uploadThen(laporanFile, "surat", async (uploaded) => {
        const updated = await request<SuratTugas>(`/surat-tugas/${tugas.id_surat_tugas}/laporan`, "PATCH", {
          file_id: uploaded.file_id,
        })
        setSuratTugas((list) => (list ?? []).map((t) => (t.id_surat_tugas === tugas.id_surat_tugas ? updated : t)))
        setDetailTugas(updated)
        setLaporanFile(null)
      })
    } catch {
      // Global toast shows server detail
    } finally {
      setBusy(false)
    }
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
      const payload = {
        id_klasifikasi: Number(form.id_klasifikasi),
        id_jenis_surat: Number(form.id_jenis_surat),
        id_bagian: Number(form.id_bagian),
        sifat_surat: form.sifat_surat,
        perihal: form.perihal.trim(),
        tujuan_surat: form.tujuan_surat.trim(),
        isi_surat: form.isi_surat.trim() || null,
        lampiran: form.lampiran.trim() || null,
        tembusan: form.tembusan.trim() || null,
        atas_nama: form.atas_nama.trim() || null,
        penandatangan_jabatan: form.penandatangan_jabatan.trim() || null,
        penandatangan_nama: form.penandatangan_nama.trim() || null,
        tanggal_surat: form.tanggal_surat,
      }
      if (editingSuratId !== null) {
        const updated = await request<SuratKeluar>(`/surat-keluar/${editingSuratId}`, "PUT", payload)
        setSuratList((list) => list.map((s) => (s.id_surat_keluar === editingSuratId ? updated : s)))
        if (detailSurat?.id_surat_keluar === editingSuratId) setDetailSurat(updated)
      } else {
        const created = await request<SuratKeluar>("/surat-keluar/draft", "POST", payload)
        setSuratList((list) => [created, ...list])
      }
      setShowDraftModal(false)
      setEditingSuratId(null)
    } catch {
      // The global notification already shows the server's message.
    } finally {
      setBusy(false)
    }
  }

  const handleLifecycleAction = async (
    id: number,
    action: "ajukan" | "revisi" | "setujui" | "finalisasi" | "arsipkan",
    catatan?: string
  ) => {
    setBusy(true)
    try {
      const updated = await request<Partial<SuratKeluar>>(
        `/surat-keluar/${id}/${action}`,
        "POST",
        catatan?.trim() ? { catatan: catatan.trim() } : {}
      )
      setSuratList((list) => list.map((s) => (s.id_surat_keluar === id ? { ...s, ...updated } : s)))
      if (detailSurat?.id_surat_keluar === id) {
        setDetailSurat((prev) => (prev ? { ...prev, ...updated } : prev))
        request<RiwayatSuratItem[]>(`/surat-keluar/${id}/riwayat`)
          .then(setDetailRiwayat)
          .catch(() => {})
      }
      setReviewNote("")
    } catch {
      // Server explains why
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteDraft = async (id: number) => {
    if (!window.confirm("Hapus draf surat keluar ini?")) return
    setBusy(true)
    try {
      await request(`/surat-keluar/${id}`, "DELETE")
      setSuratList((list) => list.filter((s) => s.id_surat_keluar !== id))
      if (detailSurat?.id_surat_keluar === id) setDetailSurat(null)
    } catch {
      // Global toast shows error
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async (s: SuratKeluar, fmt: "pdf" | "docx" = "pdf") => {
    setBusy(true)
    try {
      await download(`/surat-keluar/${s.id_surat_keluar}/export?format=${fmt}`, `surat-${s.id_surat_keluar}.${fmt}`)
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
      <TableRow
        key={s.id_surat_keluar}
        {...rowKeys(() => openSuratDetail(s))}
        title="Klik untuk melihat isi surat"
        className={`cursor-pointer transition-colors ${isDark ? "border-b border-white/20 hover:bg-white/5" : "border-b border-slate-100 hover:bg-red-50/60"}`}
      >
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
          <TableCell className="whitespace-nowrap" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-1.5">
              {(s.status === "draft" || s.status === "revisi") && !readOnly && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openEditDraftModal(s)}
                    title="Edit draf"
                    className={`p-1.5 rounded-lg border cursor-pointer disabled:opacity-40 ${isDark ? "border-white/10 text-gray-200 hover:bg-white/5" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleLifecycleAction(s.id_surat_keluar, "ajukan")}
                    className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-slate-800 text-white hover:bg-slate-900 inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                  >
                    <Send className="w-3 h-3" /> Ajukan
                  </button>
                </>
              )}
              {s.status === "diajukan" && canReviewSurat && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleLifecycleAction(s.id_surat_keluar, "setujui")}
                  className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                >
                  <CheckCircle2 className="w-3 h-3" /> Setujui
                </button>
              )}
              {(s.status === "draft" || s.status === "disetujui") && canReviewSurat && !readOnly && (
                <button
                  type="button"
                  disabled={busy || issuanceLocked}
                  title={issuanceLocked ? issuanceLockReason : "Terbitkan nomor surat resmi"}
                  onClick={() => void handleLifecycleAction(s.id_surat_keluar, "finalisasi")}
                  className="btn-kpu-red px-2.5 py-1.5 text-white text-[11px] font-bold rounded-lg inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {issuanceLocked ? <Lock className="w-3 h-3" /> : <Send className="w-3 h-3" />} Terbitkan
                </button>
              )}
              {(s.status === "terbit" || s.status === "diarsipkan") && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleExport(s, "pdf")}
                    className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer ${isDark ? "border-white/10 text-white" : "border-slate-300 text-slate-800"}`}
                  >
                    <Download className="w-3 h-3" /> PDF
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleExport(s, "docx")}
                    className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer ${isDark ? "border-white/10 text-white" : "border-slate-300 text-slate-800"}`}
                  >
                    <Download className="w-3 h-3" /> DOCX
                  </button>
                </>
              )}
            </div>
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
          {activeTab === "surat-tugas" && !readOnly && (
            <button
              type="button"
              onClick={openTugasModal}
              disabled={loading || klasifikasiList.length === 0}
              title={klasifikasiList.length === 0 ? "Data master klasifikasi belum tersedia" : undefined}
              className="btn-kpu-red px-4 py-2 text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer disabled:opacity-40"
            >
              <Plus className="w-4 h-4" /> Terbitkan Surat Tugas
            </button>
          )}
        </div>
      </div>

      <nav aria-label="Sub-menu persuratan" className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const active = t.id === activeTab
          return (
            <button
              key={t.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => goToTab(t.id)}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                active
                  ? "bg-red-600 border-red-600 text-white shadow-md"
                  : isDark
                    ? "border-white/10 bg-[#0f172a] text-gray-300 hover:border-red-500/50"
                    : "border-slate-300 bg-white text-slate-700 hover:border-red-400"
              }`}
            >
              {t.id === "surat-masuk" && <Inbox className="w-3.5 h-3.5" />}
              {t.label}
            </button>
          )
        })}
      </nav>

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
                  onClick={() => goToTab("surat-keluar")}
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

          <Card className={cardClass}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <CardTitle className={`text-sm font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>{readOnly ? "Surat Tugas Anda" : "Surat Tugas Terbaru"}</CardTitle>
              <button
                type="button"
                onClick={() => goToTab("surat-tugas")}
                className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer"
              >
                Lihat semua
              </button>
            </CardHeader>
            <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              {suratTugasError && <p className="text-xs text-red-500 md:col-span-3">{suratTugasError}</p>}
              {suratTugas && suratTugas.length === 0 && <p className="text-xs text-slate-500 md:col-span-3">Belum ada surat tugas.</p>}
              {(suratTugas ?? []).slice(0, 3).map((st) => (
                <div
                  key={st.id_surat_tugas}
                  {...rowKeys(() => openTugasDetail(st))}
                  title="Klik untuk melihat isi surat tugas"
                  className={`rounded-xl border p-3 text-xs cursor-pointer transition-colors ${isDark ? "border-white/10 bg-[#111827]/60 hover:border-red-500/40" : "border-slate-200 bg-slate-50 hover:border-red-400"}`}
                >
                  <p className={`font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{st.maksud_tugas}</p>
                  <p className="mt-1 text-slate-500">{formatDate(st.tanggal_mulai)} – {formatDate(st.tanggal_selesai)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 2. SURAT KELUAR */}
      {activeTab === "surat-keluar" && (
        <Card className={cardClass}>
          <CardHeader className="flex flex-col gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="relative w-full lg:max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  aria-label="Cari surat keluar"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari perihal, nomor, atau tujuan…"
                  className={`${field} pl-9`}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full lg:w-auto lg:flex-1">
                <select aria-label="Filter status" className={field} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">Semua Status</option>
                  {Object.entries(STATUS_LABEL).map(([value, { label }]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <select aria-label="Filter tahun" className={field} value={tahunFilter} onChange={(e) => setTahunFilter(e.target.value)}>
                  <option value="">Semua Tahun</option>
                  {tahunOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <select aria-label="Filter kategori klasifikasi" className={field} value={kategoriFilter} onChange={(e) => setKategoriFilter(e.target.value)}>
                  <option value="">Semua Kategori Klasifikasi</option>
                  {kategoriOptions.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>{filteredSurat.length} dari {countLabel(suratList.length)} surat</span>
              {filtersActive && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(""); setStatusFilter(""); setTahunFilter(""); setKategoriFilter("") }}
                  className="text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                >
                  Reset filter
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              {suratHead(true)}
              <TableBody>
                {filteredSurat.length === 0
                  ? emptyRow(6, filtersActive ? "Tidak ada surat yang cocok dengan filter." : "Belum ada surat keluar.")
                  : filteredSurat.map((s) => suratRow(s, true))}
              </TableBody>
            </Table>
          {hasMoreSurat && (
            <div className={`flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t text-xs ${isDark ? "border-white/10 text-gray-300" : "border-slate-200 text-slate-600"}`}>
              <span>{suratList.length} surat keluar terbaru dimuat. Pencarian dan filter berlaku untuk data yang sudah dimuat.</span>
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMoreSurat()}
                className={`px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer disabled:opacity-50 ${isDark ? "border-white/10 text-white" : "border-slate-300 text-slate-800"}`}
              >
                {loadingMore ? "Memuat…" : "Muat 100 berikutnya"}
              </button>
            </div>
          )}
          </CardContent>
        </Card>
      )}

      {/* 3. SURAT TUGAS */}
      {activeTab === "surat-tugas" && (
        <Card className={cardClass}>
          <CardContent className="p-0">
            {readOnly && (
              <p className={`px-4 py-3 border-b text-xs font-semibold ${isDark ? "border-white/10 text-gray-300" : "border-slate-200 text-slate-600"}`}>
                Menampilkan surat tugas yang menugaskan Anda (hanya baca).
              </p>
            )}
            <div className={`flex flex-col lg:flex-row lg:items-center gap-2 p-4 border-b ${isDark ? "border-white/10" : "border-slate-200"}`}>
              <div className="relative w-full lg:max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  aria-label="Cari surat tugas"
                  value={tugasSearch}
                  onChange={(e) => setTugasSearch(e.target.value)}
                  placeholder="Cari nomor, maksud, tempat, atau pelaksana…"
                  className={`${field} pl-9`}
                />
              </div>
              <select aria-label="Filter beban anggaran" className={`${field} lg:w-auto`} value={tugasBeban} onChange={(e) => setTugasBeban(e.target.value)}>
                <option value="">Semua Beban Anggaran</option>
                {tugasBebanOptions.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <select aria-label="Filter tahun penugasan" className={`${field} lg:w-auto`} value={tugasTahun} onChange={(e) => setTugasTahun(e.target.value)}>
                <option value="">Semua Tahun</option>
                {tugasTahunOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap lg:ml-auto">
                {filteredTugas.length} dari {tugasList.length} surat tugas
              </span>
              {tugasFiltersActive && (
                <button
                  type="button"
                  onClick={() => { setTugasSearch(""); setTugasBeban(""); setTugasTahun("") }}
                  className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer whitespace-nowrap"
                >
                  Reset filter
                </button>
              )}
            </div>
            {suratTugasError ? (
              <p className="p-8 text-center text-xs text-red-500">{suratTugasError}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className={isDark ? "border-b border-white/30 bg-[#0a0e1a]" : "border-b border-slate-200 bg-slate-100"}>
                    <TableHead className={headCell}>No. Tugas</TableHead>
                    <TableHead className={headCell}>Maksud Tugas</TableHead>
                    <TableHead className={headCell}>Tempat</TableHead>
                    <TableHead className={headCell}>Periode</TableHead>
                    <TableHead className={headCell}>Pelaksana</TableHead>
                    <TableHead className={headCell}>Beban Anggaran</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTugas.length === 0
                    ? emptyRow(
                        6,
                        tugasFiltersActive
                          ? "Tidak ada surat tugas yang cocok dengan filter."
                          : readOnly ? "Belum ada surat tugas yang menugaskan Anda." : "Belum ada surat tugas."
                      )
                    : filteredTugas.map((st) => (
                        <TableRow
                          key={st.id_surat_tugas}
                          {...rowKeys(() => openTugasDetail(st))}
                          title="Klik untuk melihat isi surat tugas"
                          className={`cursor-pointer transition-colors ${isDark ? "border-b border-white/20 hover:bg-white/5" : "border-b border-slate-100 hover:bg-red-50/60"}`}
                        >
                          <TableCell className="font-mono text-xs font-bold text-red-600 dark:text-red-400">{st.nomor_tugas || "-"}</TableCell>
                          <TableCell className={`text-xs font-semibold ${isDark ? "text-white" : "text-black"}`}>
                            <Briefcase className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />{st.maksud_tugas}
                          </TableCell>
                          <TableCell className="text-xs">
                            {st.tempat_tugas ? <><MapPin className="w-3.5 h-3.5 inline mr-1 text-slate-400" />{st.tempat_tugas}</> : "-"}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{formatDate(st.tanggal_mulai)} – {formatDate(st.tanggal_selesai)}</TableCell>
                          <TableCell className="text-xs">
                            {st.pelaksana && st.pelaksana.length > 0 ? (
                              <span className="inline-flex items-start gap-1">
                                <Users className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
                                {st.pelaksana.map((p) => p.nama ?? `#${p.id_pegawai}`).join(", ")}
                              </span>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="text-xs">{st.beban_anggaran || "-"}</TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            )}
          {hasMoreTugas && (
            <div className={`flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t text-xs ${isDark ? "border-white/10 text-gray-300" : "border-slate-200 text-slate-600"}`}>
              <span>{tugasList.length} surat tugas terbaru dimuat. Pencarian dan filter berlaku untuk data yang sudah dimuat.</span>
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMoreTugas()}
                className={`px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer disabled:opacity-50 ${isDark ? "border-white/10 text-white" : "border-slate-300 text-slate-800"}`}
              >
                {loadingMore ? "Memuat…" : "Muat 100 berikutnya"}
              </button>
            </div>
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
                onClick={() => {
                  setEditingKlasifikasiId(null)
                  setKlasifikasiForm({
                    kode_klasifikasi: "",
                    nama_klasifikasi: "",
                    kategori_utama: "Penyelenggaraan Pemilu",
                    deskripsi: "",
                    retensi_aktif_tahun: 2,
                    retensi_inaktif_tahun: 5,
                    hak_akses: "Terbatas",
                  })
                  setShowKlasifikasiModal(true)
                }}
                className="btn-kpu-red px-3.5 py-1.5 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Kode Klasifikasi</span>
              </button>
            </div>
          )}
          <div className={`flex flex-col lg:flex-row lg:items-center gap-2 p-4 border-b ${isDark ? "border-white/10" : "border-slate-200"}`}>
            <div className="relative w-full lg:max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                aria-label="Cari kode klasifikasi"
                value={klasSearch}
                onChange={(e) => setKlasSearch(e.target.value)}
                placeholder="Cari kode, nama, atau deskripsi…"
                className={`${field} pl-9`}
              />
            </div>
            <select aria-label="Filter kategori klasifikasi" className={`${field} lg:w-auto`} value={klasKategori} onChange={(e) => setKlasKategori(e.target.value)}>
              <option value="">Semua Kategori</option>
              {kategoriOptions.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <select aria-label="Filter hak akses" className={`${field} lg:w-auto`} value={klasAkses} onChange={(e) => setKlasAkses(e.target.value)}>
              <option value="">Semua Hak Akses</option>
              {klasAksesOptions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap lg:ml-auto">
              {filteredKlasifikasi.length} dari {klasifikasiList.length} kode
            </span>
            {klasFiltersActive && (
              <button
                type="button"
                onClick={() => { setKlasSearch(""); setKlasKategori(""); setKlasAkses("") }}
                className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer whitespace-nowrap"
              >
                Reset filter
              </button>
            )}
          </div>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className={isDark ? "border-b border-white/30 bg-[#0a0e1a]" : "border-b border-slate-200 bg-slate-100"}>
                  <TableHead className={headCell}>Kode</TableHead>
                  <TableHead className={headCell}>Nama Klasifikasi</TableHead>
                  <TableHead className={headCell}>Kategori</TableHead>
                  <TableHead className={headCell}>Retensi Aktif / Inaktif</TableHead>
                  <TableHead className={headCell}>Hak Akses</TableHead>
                  {isAdmin && <TableHead className={headCell}>Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredKlasifikasi.length === 0
                  ? emptyRow(isAdmin ? 6 : 5, klasFiltersActive ? "Tidak ada kode yang cocok dengan filter." : "Data master klasifikasi belum tersedia di server.")
                  : filteredKlasifikasi.map((k) => (
                      <TableRow key={k.id_klasifikasi} className={isDark ? "border-b border-white/20" : "border-b border-slate-100"}>
                        <TableCell className="font-mono text-xs font-bold text-red-600 dark:text-red-400">{k.kode_klasifikasi}</TableCell>
                        <TableCell className={`text-xs font-semibold ${isDark ? "text-white" : "text-black"}`}>{k.nama_klasifikasi}</TableCell>
                        <TableCell className="text-xs">{k.kategori_utama}</TableCell>
                        <TableCell className="text-xs">{k.retensi_aktif_tahun} th / {k.retensi_inaktif_tahun} th</TableCell>
                        <TableCell><Badge variant="outline">{k.hak_akses}</Badge></TableCell>
                        {isAdmin && (
                          <TableCell className="whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                title="Ubah kode klasifikasi"
                                onClick={() => {
                                  setEditingKlasifikasiId(k.id_klasifikasi)
                                  setKlasifikasiForm({
                                    kode_klasifikasi: k.kode_klasifikasi,
                                    nama_klasifikasi: k.nama_klasifikasi,
                                    kategori_utama: k.kategori_utama,
                                    deskripsi: k.deskripsi || "",
                                    retensi_aktif_tahun: k.retensi_aktif_tahun,
                                    retensi_inaktif_tahun: k.retensi_inaktif_tahun,
                                    hak_akses: k.hak_akses,
                                  })
                                  setShowKlasifikasiModal(true)
                                }}
                                className={`p-1.5 rounded-lg border cursor-pointer ${isDark ? "border-white/10 text-gray-200 hover:bg-white/5" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Hapus kode klasifikasi"
                                onClick={async () => {
                                  if (!window.confirm(`Hapus kode klasifikasi ${k.kode_klasifikasi}?`)) return
                                  try {
                                    await request(`/klasifikasi/${k.id_klasifikasi}`, "DELETE")
                                    setKlasifikasiList((prev) => prev.filter((x) => x.id_klasifikasi !== k.id_klasifikasi))
                                  } catch {
                                    // Toast displays conflict if still referenced
                                  }
                                }}
                                className="p-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* DETAIL SURAT KELUAR (semua akun; akun baca-saja tanpa tombol ubah) */}
      {detailSurat && (() => {
        const s = suratList.find((x) => x.id_surat_keluar === detailSurat.id_surat_keluar) ?? detailSurat
        const status = STATUS_LABEL[s.status] ?? { label: s.status, variant: "secondary" as const }
        const klas = klasifikasiById.get(s.id_klasifikasi)
        const row = (label: string, value?: string | null) => (
          <div className="grid grid-cols-3 gap-2 py-1.5">
            <dt className="text-slate-500 font-semibold">{label}</dt>
            <dd className={`col-span-2 font-medium ${isDark ? "text-white" : "text-slate-900"}`}>{value || "-"}</dd>
          </div>
        )
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`Detail surat ${s.perihal}`}
            onClick={() => setDetailSurat(null)}
            onKeyDown={(e) => e.key === "Escape" && setDetailSurat(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl border p-6 space-y-4 shadow-2xl ${isDark ? "bg-[#1e293b] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Surat Keluar</p>
                  <h2 className="text-base font-bold break-words">{s.perihal}</h2>
                  <p className="font-mono text-xs text-slate-500 mt-0.5">{s.nomor_surat || "(belum bernomor resmi)"}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={status.variant}>{status.label}</Badge>
                  <button type="button" aria-label="Tutup" autoFocus onClick={() => setDetailSurat(null)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {readOnly && (
                <p className={`text-[11px] font-semibold rounded-lg px-3 py-2 ${isDark ? "bg-white/5 text-gray-300" : "bg-slate-100 text-slate-600"}`}>
                  Mode baca saja: Anda dapat melihat dan mengunduh surat, tetapi tidak dapat mengubahnya.
                </p>
              )}

              <dl className={`text-xs divide-y ${isDark ? "divide-white/10" : "divide-slate-100"}`}>
                {row("Tujuan", s.tujuan_surat)}
                {row("Tanggal Surat", formatDate(s.tanggal_surat))}
                {row("Tanggal Terbit", s.tanggal_terbit ? formatDate(s.tanggal_terbit) : null)}
                {row("Sifat Surat", s.sifat_surat)}
                {row("Jenis Surat", jenisById.get(s.id_jenis_surat)?.nama_jenis)}
                {row("Klasifikasi", klas ? `${klas.kode_klasifikasi} — ${klas.nama_klasifikasi}` : null)}
                {row("Bagian Pengirim", departments.find((d) => d.id_bagian === s.id_bagian)?.nama_bagian)}
                {row("Lampiran", s.lampiran)}
                {row("Tembusan", s.tembusan)}
                {row(
                  "Penandatangan",
                  [s.atas_nama, s.penandatangan_jabatan, s.penandatangan_nama].filter(Boolean).join(" — ") || null
                )}
                {s.content_sha256 && row("Sidik Integritas (SHA-256)", s.content_sha256.slice(0, 24) + "…")}
              </dl>

              <div className="space-y-1.5">
                <p className="text-xs font-bold">Isi Surat</p>
                <div className={`rounded-xl border p-4 text-xs leading-relaxed whitespace-pre-wrap min-h-[80px] ${isDark ? "border-white/10 bg-[#0f172a] text-gray-200" : "border-slate-200 bg-slate-50 text-slate-800"}`}>
                  {s.isi_surat?.trim() || <span className="italic text-slate-500">Isi surat belum diisi.</span>}
                </div>
              </div>

              {/* Catatan pemeriksaan / paraf jika relevan */}
              {((s.status === "diajukan" && canReviewSurat) || ((s.status === "draft" || s.status === "revisi") && !readOnly)) && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold">Catatan Pemeriksaan / Pengajuan</label>
                  <input
                    className={field}
                    placeholder="Opsional: catatan paraf, revisi, atau pengajuan…"
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                  />
                </div>
              )}

              {/* Riwayat status surat */}
              {detailRiwayat.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-red-600" /> Riwayat Status &amp; Paraf ({detailRiwayat.length})
                  </p>
                  <ul className={`rounded-xl border divide-y text-xs max-h-40 overflow-y-auto ${isDark ? "border-white/10 divide-white/5" : "border-slate-200 divide-slate-100"}`}>
                    {detailRiwayat.map((r) => (
                      <li key={r.id_riwayat} className="px-3 py-2 flex items-start justify-between gap-2">
                        <div>
                          <span className="font-bold">{r.status_lama ? `${r.status_lama} → ${r.status_baru}` : r.status_baru}</span>
                          {r.catatan && <p className="text-[11px] text-slate-500">{r.catatan}</p>}
                        </div>
                        <div className="text-right text-[10px] text-slate-500 shrink-0">
                          <p className="font-semibold">{r.nama_pegawai}</p>
                          <p>{r.waktu ? new Date(r.waktu).toLocaleString("id-ID") : ""}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                {(s.status === "draft" || s.status === "revisi") && !readOnly && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openEditDraftModal(s)}
                      className={`px-3.5 py-2 text-xs font-bold rounded-xl border inline-flex items-center gap-1.5 cursor-pointer ${isDark ? "border-white/10 text-white" : "border-slate-300 text-slate-800"}`}
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDeleteDraft(s.id_surat_keluar)}
                      className="px-3.5 py-2 text-xs font-bold rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Hapus
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleLifecycleAction(s.id_surat_keluar, "ajukan", reviewNote)}
                      className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-800 text-white hover:bg-slate-900 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" /> Ajukan Pemeriksaan
                    </button>
                  </>
                )}
                {s.status === "diajukan" && canReviewSurat && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleLifecycleAction(s.id_surat_keluar, "revisi", reviewNote)}
                      className="px-3.5 py-2 text-xs font-bold rounded-xl border border-amber-500/40 text-amber-600 dark:text-amber-400 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Kembalikan Revisi
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleLifecycleAction(s.id_surat_keluar, "setujui", reviewNote)}
                      className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Setujui / Paraf
                    </button>
                  </>
                )}
                {(s.status === "terbit" || s.status === "diarsipkan") && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleExport(s, "pdf")}
                      className={`px-3.5 py-2 text-xs font-bold rounded-xl border inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer ${isDark ? "border-white/10 text-white" : "border-slate-300 text-slate-800"}`}
                    >
                      <Download className="w-3.5 h-3.5" /> PDF
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleExport(s, "docx")}
                      className={`px-3.5 py-2 text-xs font-bold rounded-xl border inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer ${isDark ? "border-white/10 text-white" : "border-slate-300 text-slate-800"}`}
                    >
                      <Download className="w-3.5 h-3.5" /> DOCX
                    </button>
                  </>
                )}
                {s.status === "terbit" && !readOnly && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleLifecycleAction(s.id_surat_keluar, "arsipkan")}
                    className="px-3.5 py-2 text-xs font-bold rounded-xl bg-slate-700 text-white hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Archive className="w-3.5 h-3.5" /> Arsipkan
                  </button>
                )}
                {(s.status === "draft" || s.status === "disetujui") && canReviewSurat && !readOnly && (
                  <button
                    type="button"
                    disabled={busy || issuanceLocked}
                    title={issuanceLocked ? issuanceLockReason : "Terbitkan nomor surat resmi"}
                    onClick={() => void handleLifecycleAction(s.id_surat_keluar, "finalisasi", reviewNote)}
                    className="btn-kpu-red px-4 py-2 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {issuanceLocked ? <Lock className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />} Terbitkan Nomor
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDetailSurat(null)}
                  className={`px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer ${isDark ? "border-white/10" : "border-slate-300"}`}
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* DETAIL SURAT TUGAS (semua akun; akun baca-saja tanpa tombol ubah) */}
      {detailTugas && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Detail surat tugas ${detailTugas.maksud_tugas}`}
          onClick={() => setDetailTugas(null)}
          onKeyDown={(e) => e.key === "Escape" && setDetailTugas(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl border p-6 space-y-4 shadow-2xl ${isDark ? "bg-[#1e293b] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Surat Tugas</p>
                <h2 className="text-base font-bold break-words">{detailTugas.maksud_tugas}</h2>
                <p className="font-mono text-xs text-slate-500 mt-0.5">{detailTugas.nomor_tugas || "-"}</p>
              </div>
              <button type="button" aria-label="Tutup" autoFocus onClick={() => setDetailTugas(null)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {readOnly && (
              <p className={`text-[11px] font-semibold rounded-lg px-3 py-2 ${isDark ? "bg-white/5 text-gray-300" : "bg-slate-100 text-slate-600"}`}>
                Mode baca saja: surat tugas ini ditampilkan karena Anda termasuk pegawai pelaksana.
              </p>
            )}

            <dl className={`text-xs divide-y ${isDark ? "divide-white/10" : "divide-slate-100"}`}>
              {([
                ["Dasar Tugas", detailTugas.dasar_tugas],
                ["Tempat / Lokasi", detailTugas.tempat_tugas],
                ["Periode", `${formatDate(detailTugas.tanggal_mulai)} – ${formatDate(detailTugas.tanggal_selesai)}`],
                ["Beban Anggaran", detailTugas.beban_anggaran],
                ["Status Surat", detailTugas.status_surat ? (STATUS_LABEL[detailTugas.status_surat]?.label ?? detailTugas.status_surat) : null],
              ] as const).map(([label, value]) => (
                <div key={label} className="grid grid-cols-3 gap-2 py-1.5">
                  <dt className="text-slate-500 font-semibold">{label}</dt>
                  <dd className={`col-span-2 font-medium ${isDark ? "text-white" : "text-slate-900"}`}>{value || "-"}</dd>
                </div>
              ))}
            </dl>

            <div className="space-y-2 pt-1">
              <p className="text-xs font-bold flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5 text-slate-400" /> Laporan Pelaksanaan Tugas
              </p>
              {detailTugas.laporan_file_id ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void download(`/files/${detailTugas.laporan_file_id}`, `laporan-tugas-${detailTugas.id_surat_tugas}`)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${isDark ? "border-white/10 text-white" : "border-slate-300 text-slate-800"}`}
                >
                  <Download className="w-3.5 h-3.5" /> Unduh Laporan Tugas
                </button>
              ) : (
                <p className="text-xs italic text-slate-500">Belum ada berkas laporan pelaksanaan tugas.</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={(e) => setLaporanFile(e.target.files?.[0] ?? null)}
                  className={`${field} !w-auto text-xs`}
                />
                <button
                  type="button"
                  disabled={busy || !laporanFile}
                  onClick={() => void handleUploadLaporanTugas(detailTugas)}
                  className="btn-kpu-red px-3.5 py-2 text-white text-xs font-bold rounded-xl disabled:opacity-40 cursor-pointer"
                >
                  {detailTugas.laporan_file_id ? "Ganti Laporan" : "Unggah Laporan"}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-bold flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" /> Pegawai Pelaksana ({detailTugas.pelaksana?.length ?? 0})
              </p>
              {detailTugas.pelaksana && detailTugas.pelaksana.length > 0 ? (
                <ul className={`rounded-xl border divide-y text-xs ${isDark ? "border-white/10 divide-white/5" : "border-slate-200 divide-slate-100"}`}>
                  {detailTugas.pelaksana.map((p) => (
                    <li key={p.id_pegawai} className="flex items-center justify-between px-3 py-2">
                      <span className="font-medium">{p.nama ?? `Pegawai #${p.id_pegawai}`}</span>
                      <span className="text-slate-500">{p.peran_tugas}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs italic text-slate-500">Belum ada pegawai pelaksana tercatat.</p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDetailTugas(null)}
                className={`px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer ${isDark ? "border-white/10" : "border-slate-300"}`}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAFT MODAL */}
      {showDraftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Buat draft surat keluar">
          <form
            onSubmit={handleCreateDraft}
            className={`w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl border p-6 space-y-4 shadow-2xl ${isDark ? "bg-[#1e293b] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"}`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">{editingSuratId !== null ? "Edit Draft Surat Keluar" : "Buat Draft Surat Keluar"}</h2>
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
                  <>
                    <input
                      readOnly
                      className={field}
                      value={departments.find((d) => String(d.id_bagian) === form.id_bagian)?.nama_bagian || currentUser?.subbagian || "Akun belum memiliki bagian"}
                    />
                    {!form.id_bagian && (
                      <span className="block text-[11px] font-semibold text-red-500">
                        Akun Anda belum terhubung ke bagian di database. Minta administrator mengisi bagian pada profil pegawai Anda.
                      </span>
                    )}
                  </>
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
              <label className="space-y-1.5">
                <span>Atas Nama (a.n. / u.b. / Plt.)</span>
                <input className={field} placeholder="Contoh: a.n." value={form.atas_nama} onChange={(e) => setForm({ ...form, atas_nama: e.target.value })} />
              </label>
              <label className="space-y-1.5">
                <span>Jabatan Penandatangan</span>
                <input className={field} placeholder="Contoh: Sekretaris KPU Provinsi Sulawesi Utara" value={form.penandatangan_jabatan} onChange={(e) => setForm({ ...form, penandatangan_jabatan: e.target.value })} />
              </label>
              <label className="space-y-1.5">
                <span>Nama Penandatangan</span>
                <input className={field} placeholder="Nama lengkap pejabat penandatangan" value={form.penandatangan_nama} onChange={(e) => setForm({ ...form, penandatangan_nama: e.target.value })} />
              </label>
              <label className="space-y-1.5">
                <span>Tembusan</span>
                <textarea rows={2} className={field} placeholder="1. Ketua KPU Provinsi Sulawesi Utara&#10;2. Arsip" value={form.tembusan} onChange={(e) => setForm({ ...form, tembusan: e.target.value })} />
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowDraftModal(false)} className={`px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer ${isDark ? "border-white/10" : "border-slate-300"}`}>
                Batal
              </button>
              <button type="submit" disabled={busy || !form.id_bagian} className="btn-kpu-red px-4 py-2 text-white text-xs font-bold rounded-xl disabled:opacity-40 cursor-pointer">
                {busy ? "Menyimpan…" : "Simpan Draft"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL TERBITKAN SURAT TUGAS */}
      {showTugasModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Terbitkan surat tugas">
          <form
            onSubmit={handleCreateTugas}
            className={`w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl border p-6 space-y-4 shadow-2xl ${isDark ? "bg-[#1e293b] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"}`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-red-600" /> Terbitkan Surat Tugas
              </h2>
              <button type="button" aria-label="Tutup" onClick={() => setShowTugasModal(false)} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className={`text-[11px] font-semibold rounded-lg px-3 py-2 ${isDark ? "bg-amber-500/10 text-amber-300" : "bg-amber-50 text-amber-800"}`}>
              Surat tugas disimpan sebagai draft dengan nomor register internal. Nomor resmi diterbitkan setelah penomoran resmi diaktifkan.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold">
              <label className="space-y-1.5 md:col-span-2">
                <span>Maksud Penugasan *</span>
                <textarea required rows={3} className={field} value={tugasForm.maksud_tugas} onChange={(e) => setTugasForm({ ...tugasForm, maksud_tugas: e.target.value })} placeholder="Contoh: Melaksanakan supervisi pemutakhiran data pemilih" />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span>Dasar Penugasan</span>
                <input className={field} value={tugasForm.dasar_tugas} onChange={(e) => setTugasForm({ ...tugasForm, dasar_tugas: e.target.value })} placeholder="Contoh: Undangan KPU RI Nomor 12/2026" />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span>Tempat / Lokasi Tugas *</span>
                <input required className={field} value={tugasForm.tempat_tugas} onChange={(e) => setTugasForm({ ...tugasForm, tempat_tugas: e.target.value })} placeholder="Contoh: KPU Kota Manado" />
              </label>
              <label className="space-y-1.5">
                <span>Tanggal Mulai *</span>
                <input type="date" required className={field} value={tugasForm.tanggal_mulai} onChange={(e) => setTugasForm({ ...tugasForm, tanggal_mulai: e.target.value })} />
              </label>
              <label className="space-y-1.5">
                <span>Tanggal Selesai *</span>
                <input type="date" required min={tugasForm.tanggal_mulai} className={field} value={tugasForm.tanggal_selesai} onChange={(e) => setTugasForm({ ...tugasForm, tanggal_selesai: e.target.value })} />
              </label>
              <label className="space-y-1.5">
                <span>Beban Anggaran *</span>
                <select className={field} value={tugasForm.beban_anggaran} onChange={(e) => setTugasForm({ ...tugasForm, beban_anggaran: e.target.value })}>
                  {BEBAN_ANGGARAN.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <label className="space-y-1.5">
                <span>Kode Klasifikasi *</span>
                <select required className={field} value={tugasForm.id_klasifikasi} onChange={(e) => setTugasForm({ ...tugasForm, id_klasifikasi: e.target.value })}>
                  {klasifikasiList.map((k) => (
                    <option key={k.id_klasifikasi} value={k.id_klasifikasi}>{k.kode_klasifikasi} — {k.nama_klasifikasi}</option>
                  ))}
                </select>
              </label>
              {isAdmin && (
                <label className="space-y-1.5 md:col-span-2">
                  <span>Bagian Penerbit</span>
                  <select className={field} value={tugasForm.id_bagian} onChange={(e) => setTugasForm({ ...tugasForm, id_bagian: e.target.value })}>
                    <option value="">Bagian akun saya</option>
                    {departments.map((d) => <option key={d.id_bagian} value={d.id_bagian}>{d.nama_bagian}</option>)}
                  </select>
                </label>
              )}
              <div className="space-y-1.5 md:col-span-2">
                <span>Pegawai Pelaksana Tugas * ({tugasForm.pelaksana.length} dipilih)</span>
                <input
                  aria-label="Cari pegawai"
                  className={field}
                  placeholder="Cari nama pegawai…"
                  value={pelaksanaSearch}
                  onChange={(e) => setPelaksanaSearch(e.target.value)}
                />
                <div className={`max-h-44 overflow-y-auto rounded-xl border divide-y ${isDark ? "border-white/10 divide-white/5" : "border-slate-200 divide-slate-100"}`}>
                  {pegawaiList
                    .filter((p) => p.is_active !== false && p.nama.toLowerCase().includes(pelaksanaSearch.toLowerCase()))
                    .map((p) => {
                      const checked = tugasForm.pelaksana.includes(p.id_pegawai)
                      return (
                        <div key={p.id_pegawai} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-white/5">
                          <label className="flex items-center gap-2 cursor-pointer flex-1">
                            <input type="checkbox" checked={checked} onChange={() => togglePelaksana(p.id_pegawai)} />
                            <span className="font-medium">{p.nama}</span>
                          </label>
                          {checked && (
                            <select
                              aria-label={`Peran ${p.nama}`}
                              value={pelaksanaRoles[p.id_pegawai] || "Pelaksana"}
                              onChange={(e) => setPelaksanaRoles((prev) => ({ ...prev, [p.id_pegawai]: e.target.value }))}
                              className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${isDark ? "bg-[#0f172a] border-white/15 text-white" : "bg-white border-slate-300 text-slate-800"}`}
                            >
                              {PERAN_TUGAS_OPTIONS.map((role) => (
                                <option key={role} value={role}>{role}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )
                    })}
                  {pegawaiList.length === 0 && <p className="px-3 py-4 text-center text-slate-500">Data pegawai belum tersedia.</p>}
                </div>
                {tugasKonflik.length > 0 && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] text-amber-700 dark:text-amber-300 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Peringatan Bentrok Jadwal Penugasan ({tugasKonflik.length})
                    </p>
                    {tugasKonflik.map((k, idx) => (
                      <p key={idx}>
                        • <strong>{k.nama_pegawai}</strong> sudah ditugaskan ({k.nomor_tugas}: {k.maksud_tugas}) pada {k.tanggal_mulai} s.d. {k.tanggal_selesai}.
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowTugasModal(false)} className={`px-4 py-2 rounded-xl border text-xs font-bold cursor-pointer ${isDark ? "border-white/10" : "border-slate-300"}`}>
                Batal
              </button>
              <button type="submit" disabled={busy} className="btn-kpu-red px-4 py-2 text-white text-xs font-bold rounded-xl disabled:opacity-40 cursor-pointer">
                {busy ? "Menyimpan…" : "Simpan Surat Tugas"}
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
                if (editingKlasifikasiId !== null) {
                  await request(`/klasifikasi/${editingKlasifikasiId}`, "PUT", {
                    nama_klasifikasi: klasifikasiForm.nama_klasifikasi,
                    kategori_utama: klasifikasiForm.kategori_utama,
                    deskripsi: klasifikasiForm.deskripsi || null,
                    retensi_aktif_tahun: klasifikasiForm.retensi_aktif_tahun,
                    retensi_inaktif_tahun: klasifikasiForm.retensi_inaktif_tahun,
                    hak_akses: klasifikasiForm.hak_akses,
                  })
                } else {
                  await createKlasifikasi(klasifikasiForm)
                }
                setShowKlasifikasiModal(false)
                setEditingKlasifikasiId(null)
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
              } catch {
                // The global notification already shows the server's message; keep the form open to fix it.
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
                {editingKlasifikasiId !== null ? "Ubah Kode Klasifikasi Arsip" : "Tambah Kode Klasifikasi Arsip"}
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
