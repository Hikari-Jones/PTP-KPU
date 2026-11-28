import { saveCsv } from "../../../services/csv"
import { useState, useEffect, useCallback, useRef } from "react"
import { BarChart3, Download, Plus, RefreshCw, Search, X, Loader2, AlertCircle, CheckCircle2, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { CharLimit } from "../ui/CharLimit"
import { useAuth } from "../../context/AuthContext"
import {
  paguAnggaranApi,
  revisiAnggaranApi,
  tahunAnggaranApi,
  akunAnggaranApi,
  bagianApi,
} from "../../../services/api"
import {
  decimalToEditableString,
  formatCurrencyInput,
  formatRupiah,
  parseCurrencyValue,
  sanitizeCurrencyInput,
} from "../../../utils/currency"
import type {
  PaguAnggaranResponse,
  RevisiAnggaranResponse,
  TahunAnggaranResponse,
  AkunAnggaranResponse,
  BagianResponse,
} from "./types"

const ITEMS_PER_PAGE = 100

export function PaguAnggaranView({ theme }: { theme: "light" | "dark"; onNavigate?: (tab: string) => void }) {
  const isDark = theme === "dark"
  const auth = useAuth()
  const readOnly = !auth.canEdit("anggaran") || !auth.isRendatinOrKeuangan
  const [activeTab, setActiveTab] = useState<"pagu" | "revisi">("pagu")

  // Master Tahun Anggaran & Akun Anggaran
  const [tahunList, setTahunList] = useState<TahunAnggaranResponse[]>([])
  const [selectedTAId, setSelectedTAId] = useState<number | undefined>(undefined)
  const [selectedTAYear, setSelectedTAYear] = useState<number | null>(null)
  const [allAkunList, setAllAkunList] = useState<AkunAnggaranResponse[]>([])
  const [bagianList, setBagianList] = useState<BagianResponse[]>([])
  const [loadingActiveYear, setLoadingActiveYear] = useState<boolean>(true)
  const [activeYearError, setActiveYearError] = useState<string | null>(null)

  // Data states
  const [paguList, setPaguList] = useState<PaguAnggaranResponse[]>([])
  const [revisiList, setRevisiList] = useState<RevisiAnggaranResponse[]>([])
  const [selectedSubbagian, setSelectedSubbagian] = useState("Semua Subbagian")
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)

  // Loading & Error states
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Modal & Form states
  const [modalType, setModalType] = useState<"pagu" | "revisi" | "pok" | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [selectedPaguToEdit, setSelectedPaguToEdit] = useState<PaguAnggaranResponse | null>(null)
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<PaguAnggaranResponse | null>(null)
  const [confirmAddPagu, setConfirmAddPagu] = useState(false)

  // Form Tambah / Edit Pagu Fields
  const [formAkunId, setFormAkunId] = useState<number | "">("")
  const [formPaguAwal, setFormPaguAwal] = useState<string>("")
  const [formPaguBlokir, setFormPaguBlokir] = useState<string>("")
  const [formRpd1, setFormRpd1] = useState<string>("")
  const [formRpd2, setFormRpd2] = useState<string>("")
  const [formRpd3, setFormRpd3] = useState<string>("")
  const [formRpd4, setFormRpd4] = useState<string>("")
  const [formNomorSK, setFormNomorSK] = useState("")
  const [formTanggalSK, setFormTanggalSK] = useState("")
  const [formKeterangan, setFormKeterangan] = useState("")

  // Revisi Form Fields (Aligned with Phase 12 RevisiAnggaranCreate)
  const [formPaguId, setFormPaguId] = useState<number | "">("")
  const [formNomorRevisi, setFormNomorRevisi] = useState("")
  const [formTanggalRevisi, setFormTanggalRevisi] = useState("")
  const [formPaguSebelum, setFormPaguSebelum] = useState(0)
  const [formPaguBaru, setFormPaguBaru] = useState<string>("")
  const [formAlasanRevisi, setFormAlasanRevisi] = useState("")

  // Pergeseran POK (Zero-Sum) Fields
  const [pokAsalId, setPokAsalId] = useState<number | "">("")
  const [pokTujuanId, setPokTujuanId] = useState<number | "">("")
  const [pokNominal, setPokNominal] = useState<string>("")

  const requestIdRef = useRef(0)

  // 1. Initial Load: Fetch Global Active Year, All Tahun Anggaran, Master Bagian & Master Akun Anggaran
  useEffect(() => {
    let isMounted = true
    const initMaster = async () => {
      setLoadingActiveYear(true)
      setActiveYearError(null)
      try {
        const [activeRes, taRes, akunRes, bagRes] = await Promise.all([
          tahunAnggaranApi.getActive().catch((e) => {
            console.warn("Gagal memuat tahun anggaran aktif", e)
            return null
          }),
          tahunAnggaranApi.getAll({ limit: 100 }).catch(() => ({ total: 0, items: [] })),
          akunAnggaranApi.getAll({ limit: 500 }).catch(() => ({ total: 0, items: [] })),
          bagianApi.getAll({ limit: 100 }).catch(() => [] as BagianResponse[]),
        ])
        if (!isMounted) return

        const items = taRes.items || []
        setTahunList(items)
        setAllAkunList(akunRes.items || [])
        setBagianList(bagRes || [])

        if (activeRes) {
          setSelectedTAId(activeRes.id_tahun_anggaran)
          setSelectedTAYear(activeRes.tahun)
        } else if (items.length > 0) {
          const activeYr = items.find((y) => y.status === "active") || items[0]
          setSelectedTAId(activeYr.id_tahun_anggaran)
          setSelectedTAYear(activeYr.tahun)
        } else {
          setActiveYearError("Sistem belum memiliki Tahun Anggaran yang aktif. Silakan hubungi Administrator.")
        }
      } catch (e: any) {
        if (!isMounted) return
        setActiveYearError(e.message || "Gagal memuat konfigurasi tahun anggaran dari server")
      } finally {
        if (isMounted) setLoadingActiveYear(false)
      }
    }
    initMaster()
    return () => { isMounted = false }
  }, [])

  // 2. Fetch Data (Pagu & Revisi) whenever selectedTAId changes
  const fetchData = useCallback(async () => {
    if (!selectedTAId) return
    const currentReq = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const [paguRes, revisiRes] = await Promise.all([
        paguAnggaranApi.getAll({
          id_tahun_anggaran: selectedTAId,
          limit: 500,
        }).catch((e) => {
          console.warn("Gagal memuat pagu", e)
          return { total: 0, items: [] }
        }),
        revisiAnggaranApi.getAll({
          id_tahun_anggaran: selectedTAId,
          limit: 500,
        }).catch((e) => {
          console.warn("Gagal memuat riwayat revisi", e)
          return { total: 0, items: [] }
        }),
      ])

      if (currentReq === requestIdRef.current) {
        setPaguList(paguRes.items || [])
        setRevisiList(revisiRes.items || [])
      }
    } catch (e: any) {
      if (currentReq === requestIdRef.current) {
        setError(e.message || "Gagal memuat data dari server")
      }
    } finally {
      if (currentReq === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [selectedTAId])

  useEffect(() => {
    if (selectedTAId) {
      fetchData()
    }
  }, [selectedTAId, fetchData])

  // Filtered Pagu List
  const filteredPagu = paguList.filter((item) => {
    const matchesSubbagian = selectedSubbagian === "Semua Subbagian" || item.nama_bagian === selectedSubbagian
    const term = searchQuery.toLowerCase()
    const matchesSearch =
      (item.kode_akun || "").toLowerCase().includes(term) ||
      (item.nama_akun || "").toLowerCase().includes(term) ||
      (item.nama_bagian || "").toLowerCase().includes(term)
    return matchesSubbagian && matchesSearch
  })

  const totalPages = Math.max(1, Math.ceil(filteredPagu.length / ITEMS_PER_PAGE))
  const activePage = Math.min(currentPage, totalPages)
  const firstItemIndex = (activePage - 1) * ITEMS_PER_PAGE
  const paginatedPagu = filteredPagu.slice(firstItemIndex, firstItemIndex + ITEMS_PER_PAGE)

  // Filtered Revisi List
  const filteredRevisi = revisiList.filter((item) => {
    const term = searchQuery.toLowerCase()
    return (
      (item.nomor_revisi || "").toLowerCase().includes(term) ||
      (item.kode_akun || "").toLowerCase().includes(term) ||
      (item.nama_akun || "").toLowerCase().includes(term) ||
      (item.alasan_revisi || "").toLowerCase().includes(term) ||
      (item.nama_pegawai || "").toLowerCase().includes(term)
    )
  })

  const totalPaguAktif = filteredPagu.reduce((total, item) => total + (Number(item.pagu_aktif) || 0), 0)

  const closeModal = () => {
    setModalType(null)
    setSelectedPaguToEdit(null)
    setConfirmAddPagu(false)
    setFormAkunId("")
    setFormPaguAwal("")
    setFormPaguBlokir("")
    setFormRpd1("")
    setFormRpd2("")
    setFormRpd3("")
    setFormRpd4("")
    setFormNomorSK("")
    setFormTanggalSK("")
    setFormKeterangan("")
    setFormPaguId("")
    setFormNomorRevisi("")
    setFormTanggalRevisi("")
    setFormPaguSebelum(0)
    setFormPaguBaru("")
    setFormAlasanRevisi("")
    setPokAsalId("")
    setPokTujuanId("")
    setPokNominal("")
    setError(null)
  }

  // Buka Modal Tambah Pagu Baru
  const openAddPagu = () => {
    setSelectedPaguToEdit(null)
    setFormAkunId("")
    setFormPaguAwal("")
    setFormPaguBlokir("")
    setFormRpd1("")
    setFormRpd2("")
    setFormRpd3("")
    setFormRpd4("")
    setFormNomorSK("")
    const today = new Date().toISOString().split("T")[0]
    setFormTanggalSK(today)
    setFormKeterangan("")
    setError(null)
    setModalType("pagu")
  }

  // Buka Modal Edit Pagu (Metadata, Blokir & RPD)
  const openEditPagu = (item: PaguAnggaranResponse) => {
    setSelectedPaguToEdit(item)
    setFormAkunId(item.id_akun_anggaran)
    setFormPaguAwal(decimalToEditableString(item.pagu_awal))
    setFormPaguBlokir(decimalToEditableString(item.pagu_blokir ?? 0))
    setFormRpd1(decimalToEditableString(item.rpd_triwulan_1 ?? 0))
    setFormRpd2(decimalToEditableString(item.rpd_triwulan_2 ?? 0))
    setFormRpd3(decimalToEditableString(item.rpd_triwulan_3 ?? 0))
    setFormRpd4(decimalToEditableString(item.rpd_triwulan_4 ?? 0))
    setFormNomorSK(item.nomor_sk || "")
    setFormTanggalSK(item.tanggal_sk || "")
    setFormKeterangan(item.keterangan || "")
    setError(null)
    setModalType("pagu")
  }

  const openAddPok = () => {
    const today = new Date().toISOString().split("T")[0]
    setFormTanggalRevisi(today)
    setFormNomorRevisi(`POK-${String(revisiList.length + 1).padStart(3, "0")}/${selectedTAYear}`)
    setPokAsalId(paguList[0]?.id_pagu ?? "")
    setPokTujuanId(paguList[1]?.id_pagu ?? "")
    setPokNominal("")
    setFormAlasanRevisi("")
    setError(null)
    setModalType("pok")
  }

  // Hapus Pagu
  const handleDeletePagu = (item: PaguAnggaranResponse) => {
    setDeleteConfirmItem(item)
  }

  const executeDeletePagu = async () => {
    if (!deleteConfirmItem) return
    const item = deleteConfirmItem
    setSubmitting(true)
    setError(null)
    try {
      await paguAnggaranApi.delete(item.id_pagu)
      setDeleteConfirmItem(null)
      setSuccessMessage(`Pagu ${item.kode_akun} (${item.nama_akun}) berhasil dihapus.`)
      setTimeout(() => setSuccessMessage(null), 4000)
      await fetchData()
    } catch (e: any) {
      setError(e.message || "Gagal menghapus pagu anggaran")
      setDeleteConfirmItem(null)
    } finally {
      setSubmitting(false)
    }
  }

  // Submit Tambah atau Edit Pagu
  const submitPagu = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedTAId) {
      setError("Pilih tahun anggaran terlebih dahulu.")
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      if (selectedPaguToEdit) {
        // Mode Edit Metadata, Pagu Blokir & RPD Triwulan
        await paguAnggaranApi.update(selectedPaguToEdit.id_pagu, {
          nomor_sk: formNomorSK.trim() || undefined,
          tanggal_sk: formTanggalSK || undefined,
          keterangan: formKeterangan.trim() || undefined,
          pagu_blokir: parseCurrencyValue(formPaguBlokir),
          rpd_triwulan_1: parseCurrencyValue(formRpd1),
          rpd_triwulan_2: parseCurrencyValue(formRpd2),
          rpd_triwulan_3: parseCurrencyValue(formRpd3),
          rpd_triwulan_4: parseCurrencyValue(formRpd4),
        })
        setSuccessMessage(`Pagu ${selectedPaguToEdit.kode_akun} berhasil diperbarui!`)
      } else {
        // Mode Tambah Pagu Baru
        if (!formAkunId) {
          setError("Pilih akun anggaran terlebih dahulu.")
          setSubmitting(false)
          return
        }
        if (!confirmAddPagu) {
          setConfirmAddPagu(true)
          setSubmitting(false)
          return
        }
        const numericPaguAwal = parseCurrencyValue(formPaguAwal)
        await paguAnggaranApi.create({
          id_tahun_anggaran: selectedTAId,
          id_akun_anggaran: Number(formAkunId),
          pagu_awal: numericPaguAwal,
          pagu_aktif: numericPaguAwal,
          pagu_blokir: parseCurrencyValue(formPaguBlokir),
          rpd_triwulan_1: parseCurrencyValue(formRpd1),
          rpd_triwulan_2: parseCurrencyValue(formRpd2),
          rpd_triwulan_3: parseCurrencyValue(formRpd3),
          rpd_triwulan_4: parseCurrencyValue(formRpd4),
          nomor_sk: formNomorSK.trim() || undefined,
          tanggal_sk: formTanggalSK || undefined,
          keterangan: formKeterangan.trim() || undefined,
        })
        setConfirmAddPagu(false)
        setSuccessMessage("Pagu anggaran baru berhasil ditambahkan!")
      }
      setTimeout(() => setSuccessMessage(null), 4000)
      closeModal()
      await fetchData()
    } catch (e: any) {
      setError(e.message || "Gagal menyimpan pagu anggaran")
    } finally {
      setSubmitting(false)
    }
  }

  const openAddRevisi = () => {
    const firstPagu = paguList[0]
    const today = new Date().toISOString().split("T")[0]
    setFormTanggalRevisi(today)
    setFormNomorRevisi(`REV-${String(revisiList.length + 1).padStart(3, "0")}/${selectedTAYear}`)
    if (firstPagu) {
      setFormPaguId(firstPagu.id_pagu)
      setFormPaguSebelum(Number(firstPagu.pagu_aktif) || 0)
      setFormPaguBaru(decimalToEditableString(firstPagu.pagu_aktif))
    } else {
      setFormPaguId("")
      setFormPaguSebelum(0)
      setFormPaguBaru("")
    }
    setFormAlasanRevisi("")
    setModalType("revisi")
  }

  const handlePaguChange = (idPagu: number) => {
    setFormPaguId(idPagu)
    const selected = paguList.find((p) => p.id_pagu === idPagu)
    if (selected) {
      setFormPaguSebelum(Number(selected.pagu_aktif) || 0)
      setFormPaguBaru(decimalToEditableString(selected.pagu_aktif))
    }
  }

  // Submit Revisi to Backend (Phase 12 Atomic Transaction)
  const submitRevisi = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!formPaguId) {
      setError("Pilih akun pagu anggaran yang akan direvisi.")
      return
    }
    const numericPaguBaru = parseCurrencyValue(formPaguBaru)
    if (numericPaguBaru < 0) {
      setError("Pagu baru tidak boleh bernilai negatif.")
      return
    }
    const revisedPagu = paguList.find((p) => p.id_pagu === Number(formPaguId))
    const realisasiVerified = Number(revisedPagu?.total_realisasi_verified) || 0
    if (numericPaguBaru < realisasiVerified) {
      setError(`Pagu baru tidak boleh lebih kecil dari realisasi terverifikasi (${formatRupiah(realisasiVerified)}).`)
      return
    }
    if (!formNomorRevisi.trim()) {
      setError("Nomor surat/SK revisi wajib diisi.")
      return
    }
    if (!formAlasanRevisi.trim() || formAlasanRevisi.trim().length < 5) {
      setError("Alasan revisi minimal 5 karakter.")
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await revisiAnggaranApi.create({
        id_pagu: Number(formPaguId),
        nomor_revisi: formNomorRevisi.trim(),
        tanggal_revisi: formTanggalRevisi,
        pagu_baru: numericPaguBaru,
        alasan_revisi: formAlasanRevisi.trim(),
      })
      setSuccessMessage("Revisi anggaran berhasil dieksekusi dan tercatat di audit trail!")
      setTimeout(() => setSuccessMessage(null), 4000)
      closeModal()
      // Refresh pagu and history from backend
      await fetchData()
    } catch (e: any) {
      setError(e.message || "Gagal mengeksekusi revisi anggaran")
    } finally {
      setSubmitting(false)
    }
  }

  const submitPok = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!pokAsalId || !pokTujuanId || pokAsalId === pokTujuanId) {
      setError("Pilih pagu asal dan pagu tujuan yang berbeda.")
      return
    }
    const nominal = parseCurrencyValue(pokNominal)
    if (nominal <= 0) {
      setError("Nominal pergeseran POK harus lebih besar dari 0.")
      return
    }
    if (!formNomorRevisi.trim() || formAlasanRevisi.trim().length < 5) {
      setError("Nomor POK dan alasan pergeseran (minimal 5 karakter) wajib diisi.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await revisiAnggaranApi.createPok({
        id_pagu_asal: Number(pokAsalId),
        id_pagu_tujuan: Number(pokTujuanId),
        nominal_geser: nominal,
        nomor_revisi: formNomorRevisi.trim(),
        tanggal_revisi: formTanggalRevisi,
        alasan_revisi: formAlasanRevisi.trim(),
      })
      setSuccessMessage("Pergeseran POK (zero-sum) berhasil dieksekusi dan tercatat di audit trail!")
      setTimeout(() => setSuccessMessage(null), 4000)
      closeModal()
      await fetchData()
    } catch (e: any) {
      setError(e.message || "Gagal mengeksekusi pergeseran POK")
    } finally {
      setSubmitting(false)
    }
  }

  const handleExport = () => {
    const rows: unknown[][] = activeTab === "pagu"
      ? [["Tahun", "Kode", "Nama Akun", "Bagian", "Pagu Awal", "Pagu Aktif", "Realisasi", "Sisa"],
         ...filteredPagu.map((item) => [item.tahun || selectedTAYear, item.kode_akun, item.nama_akun, item.nama_bagian || "",
           formatRupiah(Number(item.pagu_awal) || 0), formatRupiah(Number(item.pagu_aktif) || 0),
           formatRupiah(Number(item.total_realisasi_verified) || 0), formatRupiah(Number(item.sisa_anggaran) || 0)])]
      : [["No Revisi", "Tanggal", "Pagu Sebelum", "Pagu Sesudah", "Perubahan Netto", "Alasan", "Dibuat Oleh"],
         ...filteredRevisi.map((item) => [item.nomor_revisi, item.tanggal_revisi, formatRupiah(Number(item.pagu_sebelum) || 0),
           formatRupiah(Number(item.pagu_sesudah) || 0), formatRupiah(Number(item.perubahan_netto) || 0), item.alasan_revisi, item.nama_pegawai || ""])]
    saveCsv(`${activeTab === "pagu" ? "Pagu" : "Revisi"}_Anggaran_TA_${selectedTAYear}.csv`, rows)
  }

  const inputClass = `w-full rounded-xl border px-3 py-2 text-xs font-semibold outline-none transition-colors ${isDark ? "bg-[#131b2e] border-white/10 text-white focus:border-red-500" : "bg-slate-50 border-slate-300 text-slate-900 focus:border-red-500"}`

  // Akun yang belum dialokasikan di TA ini (untuk dropdown Tambah Pagu)
  const existingAkunIds = new Set(paguList.map((p) => p.id_akun_anggaran))
  const availableAkunList = allAkunList.filter((a) => a.status === "active" && !existingAkunIds.has(a.id_akun_anggaran))

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Tab Navigation */}
      <div className={`flex items-center gap-6 border-b ${isDark ? "border-white/10" : "border-slate-200"}`}>
        <button
          type="button"
          onClick={() => { setActiveTab("pagu"); setSearchQuery("") }}
          className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-bold transition-colors cursor-pointer ${activeTab === "pagu" ? "border-red-600 text-red-600 dark:text-red-400" : "border-transparent text-slate-500 hover:text-red-500"}`}
        >
          <BarChart3 className="h-4 w-4" /> Pagu Anggaran
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${isDark ? "bg-white/5" : "bg-slate-100"}`}>{paguList.length}</span>
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab("revisi"); setSearchQuery("") }}
          className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-bold transition-colors cursor-pointer ${activeTab === "revisi" ? "border-red-600 text-red-600 dark:text-red-400" : "border-transparent text-slate-500 hover:text-red-500"}`}
        >
          <RefreshCw className="h-4 w-4" /> Histori Revisi & Audit Trail
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${isDark ? "bg-white/5" : "bg-slate-100"}`}>{revisiList.length}</span>
        </button>
      </div>

      {/* Success & Error Banner */}
      {successMessage && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {error && !modalType && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs font-bold text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Title & Action Buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">Realisasi Anggaran</p>
          <h1 className={`m-0 text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-black"}`}>
            {activeTab === "pagu" ? "Pagu Anggaran" : "Histori Revisi Anggaran (Audit Trail)"}
          </h1>
          <p className={`mt-1 text-xs font-medium ${isDark ? "text-gray-400" : "text-slate-600"}`}>
            {activeTab === "pagu" ? `${filteredPagu.length} pagu terdaftar` : `${filteredRevisi.length} riwayat revisi tercatat`} — Tahun Anggaran {selectedTAYear ?? "..."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExport}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold cursor-pointer transition-colors ${isDark ? "bg-[#0f172a] border-white/10 text-gray-300 hover:bg-[#1e293b]" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}
          >
            <Download className="h-4 w-4" /> Export
          </button>
          {!readOnly && (
            <>
              {activeTab === "pagu" ? (
                <button
                  type="button"
                  onClick={openAddPagu}
                  className="btn-kpu-red flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white cursor-pointer shadow-md hover:opacity-95"
                >
                  <Plus className="h-4 w-4" /> Tambah Pagu
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openAddPok}
                    disabled={paguList.length < 2}
                    className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold cursor-pointer disabled:opacity-40 ${isDark ? "border-white/15 bg-[#0f172a] text-white hover:bg-[#1e293b]" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"}`}
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-red-600" /> Pergeseran POK (Zero-Sum)
                  </button>
                  <button
                    type="button"
                    onClick={openAddRevisi}
                    className="btn-kpu-red flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white cursor-pointer shadow-md hover:opacity-95"
                  >
                    <Plus className="h-4 w-4" /> Tambah Revisi DIPA
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Global Active Year Loading / Error */}
      {loadingActiveYear && (
        <div className="flex items-center justify-center py-6 gap-2 text-xs font-semibold text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-red-600" />
          Memverifikasi tahun anggaran aktif global...
        </div>
      )}
      {activeYearError && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs font-bold text-rose-600 dark:text-rose-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{activeYearError}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 md:flex-row">
        <select
          value={selectedTAId ?? ""}
          onChange={(event) => {
            const idVal = Number(event.target.value)
            setSelectedTAId(idVal)
            const yr = tahunList.find((y) => y.id_tahun_anggaran === idVal)
            if (yr) setSelectedTAYear(yr.tahun)
            setSearchQuery("")
          }}
          className={`${inputClass} md:w-36 cursor-pointer`}
        >
          {tahunList.map((t) => (
            <option key={t.id_tahun_anggaran} value={t.id_tahun_anggaran}>
              TA {t.tahun} ({t.status})
            </option>
          ))}
        </select>
        {activeTab === "pagu" && (
          <select
            value={selectedSubbagian}
            onChange={(event) => {
              setSelectedSubbagian(event.target.value)
              setCurrentPage(1)
            }}
            className={`${inputClass} md:w-52 cursor-pointer`}
          >
            <option>Semua Subbagian</option>
            {bagianList.map((b) => <option key={b.id_bagian} value={b.nama_bagian}>{b.nama_bagian}</option>)}
          </select>
        )}
        <div className="flex-1 space-y-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              maxLength={150}
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setCurrentPage(1)
              }}
              placeholder={activeTab === "pagu" ? "Cari kode, nama akun, atau bagian..." : "Cari no. revisi, kode akun, alasan, atau nama operator..."}
              className={`${inputClass} pl-9`}
            />
          </div>
          <div className="flex justify-end">
            <CharLimit value={searchQuery} max={150} />
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 gap-3 text-xs font-semibold text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-red-600" />
          Memuat data dari server...
        </div>
      )}

      {/* TAB 1: PAGU ANGGARAN */}
      {!loading && activeTab === "pagu" && (
        <>
          <div className={`flex items-center justify-between px-1 text-xs ${isDark ? "text-gray-400" : "text-slate-600"}`}>
            <span>{filteredPagu.length} akun teralokasi • TA {selectedTAYear}</span>
            <span className="font-bold text-red-600 dark:text-red-400">Total Pagu Aktif: {formatRupiah(totalPaguAktif)}</span>
          </div>
          <Card className={`${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} overflow-hidden rounded-2xl shadow-lg backdrop-blur-md`}>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow className={isDark ? "bg-[#0a0f1d]" : "bg-slate-50"}>
                  {['KODE', 'NAMA AKUN', 'BAGIAN / UNIT', 'PAGU AWAL', 'PAGU AKTIF', 'REALISASI', 'SISA', 'SERAPAN', 'AKSI'].map((head) => (
                    <TableHead key={head} className={`text-[11px] font-extrabold ${head === 'SERAPAN' ? 'text-center' : ''} ${head === 'AKSI' ? 'text-right' : ''} ${isDark ? "text-gray-400" : "text-slate-600"}`}>{head}</TableHead>
                  ))}
                </TableRow></TableHeader>
                <TableBody>
                  {filteredPagu.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="py-10 text-center text-xs text-slate-500">Tidak ada data pagu untuk filter ini.</TableCell></TableRow>
                  ) : paginatedPagu.map((item) => {
                    const percentage = item.persentase_serapan || 0
                    return (
                      <TableRow key={item.id_pagu}>
                        <TableCell className="font-mono text-xs font-bold text-red-600 dark:text-red-400">{item.kode_akun}</TableCell>
                        <TableCell className={`max-w-[220px] text-xs font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{item.nama_akun}</TableCell>
                        <TableCell className={`text-xs font-semibold ${isDark ? "text-gray-300" : "text-slate-600"}`}>{item.nama_bagian || "-"}</TableCell>
                        <TableCell className={`whitespace-nowrap text-xs font-semibold ${isDark ? "text-gray-400" : "text-slate-500"}`}>{formatRupiah(item.pagu_awal)}</TableCell>
                        <TableCell className={`whitespace-nowrap text-xs font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                          {formatRupiah(item.pagu_aktif)}
                          {Number(item.pagu_blokir || 0) > 0 && (
                            <span className="block text-[10px] font-semibold text-amber-500">
                              Blokir: {formatRupiah(item.pagu_blokir)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs font-bold text-red-600 dark:text-red-400">{formatRupiah(item.total_realisasi_verified)}</TableCell>
                        <TableCell className={`whitespace-nowrap text-xs font-bold ${Number(item.sisa_anggaran) < 0 ? "text-rose-500" : isDark ? "text-red-400" : "text-red-600"}`}>{formatRupiah(item.sisa_anggaran)}</TableCell>
                        <TableCell><div className="flex min-w-[105px] items-center justify-center gap-2"><div className={`h-2 flex-1 overflow-hidden rounded-full ${isDark ? "bg-slate-800" : "bg-slate-200"}`}><div className="h-full rounded-full bg-red-600" style={{ width: `${Math.min(percentage, 100)}%` }} /></div><span className="text-[11px] font-bold text-red-600 dark:text-red-400">{percentage}%</span></div></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!readOnly && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditPagu(item)}
                                  title="Edit Keterangan / SK Pagu"
                                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePagu(item)}
                                  title="Hapus Pagu"
                                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-rose-500 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {/* Pagination */}
              <div className={`p-4 flex items-center justify-between text-xs border-t ${
                isDark ? "border-slate-800 text-gray-300" : "border-slate-200 text-slate-700"
              }`}>
                <span>
                  {filteredPagu.length === 0
                    ? "Tidak ada data pagu"
                    : `Menampilkan ${firstItemIndex + 1}-${Math.min(firstItemIndex + ITEMS_PER_PAGE, filteredPagu.length)} dari ${filteredPagu.length} data pagu anggaran`}
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={activePage === 1}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        activePage === 1 ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:border-red-500 hover:text-red-500"
                      } ${isDark ? "border-slate-700 text-white" : "border-slate-300 text-black"}`}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`min-w-7 h-7 px-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                          page === activePage
                            ? "bg-red-600 text-white"
                            : isDark
                            ? "border border-slate-700 text-gray-300 hover:bg-white/5"
                            : "border border-slate-300 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={activePage === totalPages}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        activePage === totalPages ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:border-red-500 hover:text-red-500"
                      } ${isDark ? "border-slate-700 text-white" : "border-slate-300 text-black"}`}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* TAB 2: REVISI ANGGARAN & AUDIT TRAIL (IMMUTABLE) */}
      {!loading && activeTab === "revisi" && (
        <Card className={`${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"} overflow-hidden rounded-2xl shadow-lg backdrop-blur-md`}>
          <CardContent className="p-0">
            <div className={`p-4 border-b text-xs font-semibold flex items-center justify-between ${isDark ? "border-white/10 bg-[#0a0f1d]/50 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
              <span>Jejak Audit Pergeseran & Revisi Anggaran (BPK/KPU Compliant)</span>
            </div>
            <Table>
              <TableHeader><TableRow className={isDark ? "bg-[#0a0f1d]" : "bg-slate-50"}>
                {['NO. REVISI', 'AKUN / MAK', 'TANGGAL', 'PAGU SEBELUM', 'PAGU SESUDAH', 'PERUBAHAN NETTO', 'ALASAN REVISI', 'DIEKSEKUSI OLEH'].map((head) => (
                  <TableHead key={head} className={`text-[11px] font-extrabold ${isDark ? "text-gray-400" : "text-slate-600"}`}>{head}</TableHead>
                ))}
              </TableRow></TableHeader>
              <TableBody>
                {filteredRevisi.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="py-10 text-center text-xs text-slate-500">Belum ada riwayat revisi anggaran pada tahun ini.</TableCell></TableRow>
                ) : filteredRevisi.map((item) => {
                  const difference = Number(item.perubahan_netto) || 0
                  return (
                    <TableRow key={item.id_revisi}>
                      <TableCell className="whitespace-nowrap font-mono text-xs font-bold text-red-600 dark:text-red-400">{item.nomor_revisi}</TableCell>
                      <TableCell className="text-xs">
                        <span className="font-mono font-bold text-slate-900 dark:text-white block">{item.kode_akun || `Pagu #${item.id_pagu}`}</span>
                        {item.nama_akun && <span className="text-[10px] text-slate-500 dark:text-gray-400">{item.nama_akun}</span>}
                      </TableCell>
                      <TableCell className={`whitespace-nowrap text-xs ${isDark ? "text-gray-300" : "text-slate-600"}`}>{item.tanggal_revisi}</TableCell>
                      <TableCell className={`whitespace-nowrap text-xs font-semibold ${isDark ? "text-gray-200" : "text-slate-700"}`}>{formatRupiah(item.pagu_sebelum)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs font-bold text-red-600 dark:text-red-400">{formatRupiah(item.pagu_sesudah)}</TableCell>
                      <TableCell className={`whitespace-nowrap text-xs font-bold ${difference >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {difference >= 0 ? "+" : "−"}{formatRupiah(Math.abs(difference))}
                      </TableCell>
                      <TableCell className={`max-w-[240px] truncate text-xs ${isDark ? "text-gray-300" : "text-slate-600"}`} title={item.alasan_revisi}>{item.alasan_revisi}</TableCell>
                      <TableCell className={`whitespace-nowrap text-xs font-semibold ${isDark ? "text-gray-400" : "text-slate-600"}`}>{item.nama_pegawai || "Administrator"}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <div className={`border-t p-4 text-xs ${isDark ? "border-white/10 text-gray-400" : "border-slate-200 text-slate-600"}`}>Menampilkan {filteredRevisi.length} catatan audit trail revisi</div>
          </CardContent>
        </Card>
      )}

      {/* MODAL TAMBAH / EDIT PAGU */}
      {modalType === "pagu" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className={`w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl ${isDark ? "bg-[#0f172a] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-white/10 bg-[#0a0f1d]" : "border-slate-200 bg-slate-50"}`}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">TA {selectedTAYear}</p>
                <h2 className="text-sm font-bold">
                  {selectedPaguToEdit ? `Edit Pagu ${selectedPaguToEdit.kode_akun}` : "Tambahkan Pagu Anggaran Baru"}
                </h2>
              </div>
              <button type="button" onClick={closeModal} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/15 hover:text-red-500 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submitPagu} className="space-y-4 p-5 text-xs">
              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {confirmAddPagu && !selectedPaguToEdit ? (
                <div className="space-y-4">
                  <div className={`rounded-xl border p-4 space-y-3 ${isDark ? "border-amber-500/25 bg-amber-500/10" : "border-amber-200 bg-amber-50"}`}>
                    <p className={`text-xs font-bold ${isDark ? "text-amber-300" : "text-amber-800"}`}>
                      Konfirmasi Ganda: Pastikan nominal pagu berikut sudah benar sebelum disimpan.
                    </p>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-500 dark:text-slate-400">Akun / MAK:</span>
                        <strong className="text-right">
                          {(() => {
                            const ak = availableAkunList.find((a) => a.id_akun_anggaran === Number(formAkunId))
                            return ak ? `${ak.kode_akun} — ${ak.nama_akun}` : "-"
                          })()}
                        </strong>
                      </div>
                      <div className="flex justify-between items-center gap-2 pt-1 border-t border-amber-500/20">
                        <span className="text-slate-500 dark:text-slate-400">Nominal Pagu Awal:</span>
                        <strong className="text-base font-extrabold text-red-600 dark:text-red-400">
                          {formatRupiah(parseCurrencyValue(formPaguAwal))}
                        </strong>
                      </div>
                      {(formNomorSK || formTanggalSK) && (
                        <div className="flex justify-between gap-2">
                          <span className="text-slate-500 dark:text-slate-400">SK / Tanggal:</span>
                          <strong className="text-right">
                            {formNomorSK || "-"} {formTanggalSK ? `(${formTanggalSK})` : ""}
                          </strong>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setConfirmAddPagu(false)}
                      disabled={submitting}
                      className={`rounded-xl border px-4 py-2 font-bold cursor-pointer ${isDark ? "border-white/10 text-gray-300" : "border-slate-300 text-slate-700"}`}
                    >
                      Periksa Kembali
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn-kpu-red flex items-center gap-2 rounded-xl px-5 py-2 font-bold text-white cursor-pointer shadow-md hover:opacity-95"
                    >
                      {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                      {submitting ? "Menyimpan..." : "Ya, Simpan Pagu"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
              {/* Pilih Akun (Hanya saat Tambah Baru) */}
              {!selectedPaguToEdit ? (
                <label className="block space-y-1 font-semibold">
                  Pilih Akun Anggaran / MAK
                  <select
                    required
                    value={formAkunId}
                    onChange={(e) => setFormAkunId(Number(e.target.value))}
                    className={inputClass}
                  >
                    <option value="">-- Pilih Akun MAK yang Belum Dialokasikan --</option>
                    {availableAkunList.map((a) => (
                      <option key={a.id_akun_anggaran} value={a.id_akun_anggaran}>
                        {a.kode_akun} — {a.nama_akun} ({a.nama_bagian || "Tanpa Bagian"})
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="space-y-1">
                  <span className="block font-semibold text-slate-400">Akun Anggaran</span>
                  <div className={`p-2.5 rounded-xl border font-bold ${isDark ? "bg-white/5 border-white/10 text-white" : "bg-slate-100 border-slate-200 text-slate-800"}`}>
                    {selectedPaguToEdit.kode_akun} — {selectedPaguToEdit.nama_akun}
                  </div>
                </div>
              )}

              {/* Nilai Pagu Awal (Hanya saat Tambah Baru) */}
              {!selectedPaguToEdit ? (
                <label className="block space-y-1 font-semibold">
                  <span className="flex items-center justify-between gap-2">
                    <span>Pagu Awal Penetapan DIPA (Rp)</span>
                    <CharLimit value={formatCurrencyInput(formPaguAwal)} max={22} />
                  </span>
                  <input
                    required
                    type="text"
                    inputMode="decimal"
                    maxLength={22}
                    value={formatCurrencyInput(formPaguAwal)}
                    onChange={(e) => setFormPaguAwal(sanitizeCurrencyInput(e.target.value))}
                    placeholder="Contoh: 50.000.000"
                    className={inputClass}
                  />
                </label>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="block font-semibold text-slate-400">Pagu Awal</span>
                    <div className="font-bold text-sm text-slate-300">{formatRupiah(selectedPaguToEdit.pagu_awal)}</div>
                  </div>
                  <div>
                    <span className="block font-semibold text-slate-400">Pagu Aktif</span>
                    <div className="font-bold text-sm text-red-500">{formatRupiah(selectedPaguToEdit.pagu_aktif)}</div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-1 font-semibold">
                  <span className="flex items-center justify-between gap-2">
                    <span>Nomor SK / Dasar Hukum (Opsional)</span>
                    <CharLimit value={formNomorSK} max={100} />
                  </span>
                  <input
                    maxLength={100}
                    value={formNomorSK}
                    onChange={(e) => setFormNomorSK(e.target.value)}
                    placeholder="Contoh: SK-001/DIPA/2026"
                    className={inputClass}
                  />
                </label>
                <label className="space-y-1 font-semibold">
                  Tanggal SK (Opsional)
                  <input
                    type="date"
                    value={formTanggalSK}
                    onChange={(e) => setFormTanggalSK(e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1 font-semibold">
                  <span className="flex items-center justify-between gap-2">
                    <span>Pagu Blokir / Self-Blocking (Rp)</span>
                    <CharLimit value={formatCurrencyInput(formPaguBlokir)} max={22} />
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    maxLength={22}
                    value={formatCurrencyInput(formPaguBlokir)}
                    onChange={(e) => setFormPaguBlokir(sanitizeCurrencyInput(e.target.value))}
                    placeholder="0"
                    className={inputClass}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 font-semibold">
                    <span className="flex items-center justify-between gap-1">
                      <span>RPD Triwulan I</span>
                      <CharLimit value={formatCurrencyInput(formRpd1)} max={22} />
                    </span>
                    <input type="text" inputMode="decimal" maxLength={22} value={formatCurrencyInput(formRpd1)} onChange={(e) => setFormRpd1(sanitizeCurrencyInput(e.target.value))} placeholder="0" className={inputClass} />
                  </label>
                  <label className="space-y-1 font-semibold">
                    <span className="flex items-center justify-between gap-1">
                      <span>RPD Triwulan II</span>
                      <CharLimit value={formatCurrencyInput(formRpd2)} max={22} />
                    </span>
                    <input type="text" inputMode="decimal" maxLength={22} value={formatCurrencyInput(formRpd2)} onChange={(e) => setFormRpd2(sanitizeCurrencyInput(e.target.value))} placeholder="0" className={inputClass} />
                  </label>
                  <label className="space-y-1 font-semibold">
                    <span className="flex items-center justify-between gap-1">
                      <span>RPD Triwulan III</span>
                      <CharLimit value={formatCurrencyInput(formRpd3)} max={22} />
                    </span>
                    <input type="text" inputMode="decimal" maxLength={22} value={formatCurrencyInput(formRpd3)} onChange={(e) => setFormRpd3(sanitizeCurrencyInput(e.target.value))} placeholder="0" className={inputClass} />
                  </label>
                  <label className="space-y-1 font-semibold">
                    <span className="flex items-center justify-between gap-1">
                      <span>RPD Triwulan IV</span>
                      <CharLimit value={formatCurrencyInput(formRpd4)} max={22} />
                    </span>
                    <input type="text" inputMode="decimal" maxLength={22} value={formatCurrencyInput(formRpd4)} onChange={(e) => setFormRpd4(sanitizeCurrencyInput(e.target.value))} placeholder="0" className={inputClass} />
                  </label>
                </div>
              </div>

              <label className="block space-y-1 font-semibold">
                <span className="flex items-center justify-between gap-2">
                  <span>Keterangan (Opsional)</span>
                  <CharLimit value={formKeterangan} max={1000} />
                </span>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={formKeterangan}
                  onChange={(e) => setFormKeterangan(e.target.value)}
                  placeholder="Catatan alokasi pagu..."
                  className={inputClass}
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className={`rounded-xl border px-4 py-2 font-bold cursor-pointer ${isDark ? "border-white/10 text-gray-300" : "border-slate-300 text-slate-700"}`}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-kpu-red flex items-center gap-2 rounded-xl px-5 py-2 font-bold text-white cursor-pointer shadow-md hover:opacity-95"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Menyimpan..." : selectedPaguToEdit ? "Simpan Perubahan" : "Tambahkan Pagu"}
                </button>
              </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH REVISI DIPA (PHASE 12 ATOMIC EXECUTION) */}
      {modalType === "revisi" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className={`w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl ${isDark ? "bg-[#0f172a] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-white/10 bg-[#0a0f1d]" : "border-slate-200 bg-slate-50"}`}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">TA {selectedTAYear}</p>
                <h2 className="text-sm font-bold">Eksekusi Revisi Anggaran / DIPA</h2>
              </div>
              <button type="button" onClick={closeModal} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/15 hover:text-red-500 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={submitRevisi} className="space-y-4 p-5 text-xs">
              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-1 font-semibold">
                  <span className="flex items-center justify-between gap-2">
                    <span>Nomor Surat/SK Revisi</span>
                    <CharLimit value={formNomorRevisi} max={100} />
                  </span>
                  <input
                    required
                    maxLength={100}
                    value={formNomorRevisi}
                    onChange={(e) => setFormNomorRevisi(e.target.value)}
                    placeholder="Contoh: REV-001/2026"
                    className={inputClass}
                  />
                </label>
                <label className="space-y-1 font-semibold">
                  Tanggal Revisi
                  <input
                    required
                    type="date"
                    value={formTanggalRevisi}
                    onChange={(e) => setFormTanggalRevisi(e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>

              <label className="block space-y-1 font-semibold">
                Akun Pagu Anggaran
                <select
                  required
                  value={formPaguId}
                  onChange={(e) => handlePaguChange(Number(e.target.value))}
                  className={inputClass}
                >
                  <option value="">-- Pilih Akun Pagu --</option>
                  {paguList.map((p) => (
                    <option key={p.id_pagu} value={p.id_pagu}>
                      {p.kode_akun} — {p.nama_akun} (Pagu Aktif: {formatRupiah(p.pagu_aktif)})
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-1 font-semibold">
                  Pagu Sebelum
                  <input readOnly value={formatRupiah(formPaguSebelum)} className={`${inputClass} opacity-70`} />
                </label>
                <label className="space-y-1 font-semibold">
                  <span className="flex items-center justify-between gap-2">
                    <span>Pagu Baru Setelah Revisi (Rp)</span>
                    <CharLimit value={formatCurrencyInput(formPaguBaru)} max={22} />
                  </span>
                  <input
                    required
                    type="text"
                    inputMode="decimal"
                    maxLength={22}
                    value={formatCurrencyInput(formPaguBaru)}
                    onChange={(e) => setFormPaguBaru(sanitizeCurrencyInput(e.target.value))}
                    placeholder="0"
                    className={inputClass}
                  />
                  <span className="block text-[11px] font-medium text-slate-500">
                    Minimal: {formatRupiah(paguList.find((p) => p.id_pagu === Number(formPaguId))?.total_realisasi_verified)} (realisasi terverifikasi)
                  </span>
                </label>
              </div>

              <label className="block space-y-1 font-semibold">
                <span className="flex items-center justify-between gap-2">
                  <span>Alasan Revisi / Pergeseran (Minimal 5 karakter)</span>
                  <CharLimit value={formAlasanRevisi} max={1000} />
                </span>
                <textarea
                  required
                  rows={3}
                  maxLength={1000}
                  value={formAlasanRevisi}
                  onChange={(e) => setFormAlasanRevisi(e.target.value)}
                  placeholder="Jelaskan dasar pertimbangan perubahan pagu..."
                  className={inputClass}
                />
              </label>

              <div className={`rounded-xl border p-3 ${isDark ? "border-red-500/20 bg-red-950/20" : "border-red-200 bg-red-50"}`}>
                <span className="text-slate-500">Perubahan Netto: </span>
                <strong className={parseCurrencyValue(formPaguBaru) - formPaguSebelum >= 0 ? "text-emerald-500" : "text-rose-500"}>
                  {parseCurrencyValue(formPaguBaru) - formPaguSebelum >= 0 ? "+" : "−"}{formatRupiah(Math.abs(parseCurrencyValue(formPaguBaru) - formPaguSebelum))}
                </strong>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className={`rounded-xl border px-4 py-2 font-bold cursor-pointer ${isDark ? "border-white/10 text-gray-300" : "border-slate-300 text-slate-700"}`}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-kpu-red flex items-center gap-2 rounded-xl px-5 py-2 font-bold text-white cursor-pointer shadow-md hover:opacity-95"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Menyimpan..." : "Eksekusi Revisi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PERGESERAN POK (ZERO-SUM) */}
      {modalType === "pok" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className={`w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl ${isDark ? "bg-[#0f172a] border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-white/10 bg-[#0a0f1d]" : "border-slate-200 bg-slate-50"}`}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">TA {selectedTAYear} · Zero-Sum</p>
                <h2 className="text-sm font-bold">Pergeseran POK Antar Pagu Anggaran</h2>
              </div>
              <button type="button" onClick={closeModal} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/15 hover:text-red-500 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={submitPok} className="space-y-4 p-5 text-xs">
              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="space-y-1 font-semibold">
                  <span className="flex items-center justify-between gap-2">
                    <span>Nomor Revisi POK</span>
                    <CharLimit value={formNomorRevisi} max={100} />
                  </span>
                  <input required maxLength={100} value={formNomorRevisi} onChange={(e) => setFormNomorRevisi(e.target.value)} className={inputClass} />
                </label>
                <label className="space-y-1 font-semibold">
                  Tanggal Pergeseran
                  <input required type="date" value={formTanggalRevisi} onChange={(e) => setFormTanggalRevisi(e.target.value)} className={inputClass} />
                </label>
              </div>
              <label className="block space-y-1 font-semibold">
                Pagu Asal (Dikurangi)
                <select required value={pokAsalId} onChange={(e) => setPokAsalId(Number(e.target.value))} className={inputClass}>
                  <option value="">-- Pilih Pagu Asal --</option>
                  {paguList.map((p) => (
                    <option key={p.id_pagu} value={p.id_pagu}>
                      {p.kode_akun} — {p.nama_akun} (Sisa Efektif: {formatRupiah(p.sisa_anggaran)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 font-semibold">
                Pagu Tujuan (Ditambah)
                <select required value={pokTujuanId} onChange={(e) => setPokTujuanId(Number(e.target.value))} className={inputClass}>
                  <option value="">-- Pilih Pagu Tujuan --</option>
                  {paguList.map((p) => (
                    <option key={p.id_pagu} value={p.id_pagu}>
                      {p.kode_akun} — {p.nama_akun} (Pagu Aktif: {formatRupiah(p.pagu_aktif)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 font-semibold">
                <span className="flex items-center justify-between gap-2">
                  <span>Nominal Pergeseran (Rp)</span>
                  <CharLimit value={formatCurrencyInput(pokNominal)} max={22} />
                </span>
                <input
                  required
                  type="text"
                  inputMode="decimal"
                  maxLength={22}
                  value={formatCurrencyInput(pokNominal)}
                  onChange={(e) => setPokNominal(sanitizeCurrencyInput(e.target.value))}
                  placeholder="0"
                  className={inputClass}
                />
              </label>
              <label className="block space-y-1 font-semibold">
                <span className="flex items-center justify-between gap-2">
                  <span>Alasan Pergeseran POK (Minimal 5 karakter)</span>
                  <CharLimit value={formAlasanRevisi} max={1000} />
                </span>
                <textarea required rows={3} maxLength={1000} value={formAlasanRevisi} onChange={(e) => setFormAlasanRevisi(e.target.value)} className={inputClass} />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeModal} disabled={submitting} className={`rounded-xl border px-4 py-2 font-bold cursor-pointer ${isDark ? "border-white/10 text-gray-300" : "border-slate-300 text-slate-700"}`}>
                  Batal
                </button>
                <button type="submit" disabled={submitting} className="btn-kpu-red flex items-center gap-2 rounded-xl px-5 py-2 font-bold text-white cursor-pointer shadow-md">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Memproses..." : "Eksekusi Pergeseran POK"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Pagu */}
      {deleteConfirmItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Hapus Pagu Anggaran"
        >
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${isDark ? "bg-[#0f172a] border-white/10 text-white" : "bg-white border-slate-200 text-black"}`}>
            <div className={`p-4 border-b flex items-center justify-between ${isDark ? "border-white/10 bg-[#0a0f1d]" : "border-slate-200 bg-slate-50"}`}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                  Konfirmasi Penghapusan
                </p>
                <h3 className="text-sm font-bold">Hapus Pagu Anggaran?</h3>
              </div>
              <button
                type="button"
                aria-label="Batalkan"
                onClick={() => setDeleteConfirmItem(null)}
                disabled={submitting}
                className="p-1 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="leading-relaxed">
                Apakah Anda yakin ingin menghapus pagu{" "}
                <strong className="text-red-600 dark:text-red-400">
                  {deleteConfirmItem.kode_akun} — {deleteConfirmItem.nama_akun}
                </strong>
                ? Pagu hanya dapat dihapus jika belum memiliki transaksi realisasi atau revisi.
              </p>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmItem(null)}
                  disabled={submitting}
                  className={`px-4 py-2 rounded-xl border font-bold cursor-pointer ${
                    isDark ? "border-white/10 text-gray-300 hover:bg-white/5" : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={executeDeletePagu}
                  disabled={submitting}
                  className="btn-kpu-red px-5 py-2 rounded-xl text-white font-bold flex items-center gap-2 cursor-pointer shadow-md"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {submitting ? "Menghapus..." : "Ya, Hapus Pagu"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
