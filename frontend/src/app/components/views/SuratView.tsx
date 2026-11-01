import React, { useState } from "react"
import {
  FileText,
  Briefcase,
  Database,
  Plus,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
  Send,
  X,
  Clock,
  UserCheck,
  ArrowRight,
  PieChart,
  Layers,
  MapPin,
  Users
} from "lucide-react"
import type { SuratKeluar, KodeKlasifikasiArsip } from "../../../types"
import {
  createDraftSuratKeluar,
  finalisasiSuratAtomic,
} from "../../../services/api"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Badge } from "../ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table"
import { useAuth } from "../../context/AuthContext"
import { ReadOnlyBanner } from "../ui/read-only"

export interface SuratViewProps {
  theme?: "light" | "dark"
  subTab?: string
}

// 10 Comprehensive Initial Letters for Surat Keluar
const INITIAL_SURAT_KELUAR_DATA: SuratKeluar[] = [
  {
    id_surat_keluar: 1,
    id_pegawai: 1,
    id_bagian: 1,
    id_klasifikasi: 2,
    id_jenis_surat: 1,
    nomor_surat: "001/PL.02.1-SD/71/IX/2026",
    nomor_urut: 1,
    tahun: 2026,
    bulan_romawi: "IX",
    sifat_surat: "Biasa",
    perihal: "Rapat Pemutakhiran Data Pemilih Berkelanjutan Semester II",
    tujuan_surat: "KPU Kabupaten/Kota Se-Sulawesi Utara",
    status: "terbit",
    tanggal_surat: "2026-09-07",
    created_at: "2026-09-07T08:30:00Z",
  },
  {
    id_surat_keluar: 2,
    id_pegawai: 2,
    id_bagian: 2,
    id_klasifikasi: 4,
    id_jenis_surat: 1,
    nomor_surat: "002/HK.01.1-SD/71/IX/2026",
    nomor_urut: 2,
    tahun: 2026,
    bulan_romawi: "IX",
    sifat_surat: "Penting",
    perihal: "Sosialisasi Peraturan KPU tentang Syarat Pencalonan Pilkada 2026",
    tujuan_surat: "Pimpinan Partai Politik Provinsi Sulawesi Utara",
    status: "terbit",
    tanggal_surat: "2026-09-06",
    created_at: "2026-09-06T09:15:00Z",
  },
  {
    id_surat_keluar: 3,
    id_pegawai: 3,
    id_bagian: 3,
    id_klasifikasi: 5,
    id_jenis_surat: 1,
    nomor_surat: "003/KU.01.3-SD/71/IX/2026",
    nomor_urut: 3,
    tahun: 2026,
    bulan_romawi: "IX",
    sifat_surat: "Penting",
    perihal: "Penyampaian Laporan Realisasi Anggaran Tahapan Pilkada Triwulan III",
    tujuan_surat: "Sekretariat Jenderal KPU Republik Indonesia",
    status: "terbit",
    tanggal_surat: "2026-09-05",
    created_at: "2026-09-05T10:45:00Z",
  },
  {
    id_surat_keluar: 4,
    id_pegawai: 4,
    id_bagian: 1,
    id_klasifikasi: 1,
    id_jenis_surat: 1,
    nomor_surat: "004/PL.01.1-SD/71/IX/2026",
    nomor_urut: 4,
    tahun: 2026,
    bulan_romawi: "IX",
    sifat_surat: "Biasa",
    perihal: "Rakor Rekapitulasi Sinkronisasi Daftar Pemilih Tambahan (DPTb)",
    tujuan_surat: "Bawaslu Provinsi Sulawesi Utara",
    status: "terbit",
    tanggal_surat: "2026-09-04",
    created_at: "2026-09-04T13:20:00Z",
  },
  {
    id_surat_keluar: 5,
    id_pegawai: 5,
    id_bagian: 4,
    id_klasifikasi: 3,
    id_jenis_surat: 1,
    nomor_surat: "005/HR.01.2-SD/71/IX/2026",
    nomor_urut: 5,
    tahun: 2026,
    bulan_romawi: "IX",
    sifat_surat: "Penting",
    perihal: "Penetapan dan Penunjukan Petugas Operator Sirekap Kabupaten/Kota",
    tujuan_surat: "KPU Kabupaten/Kota se-Sulawesi Utara",
    status: "terbit",
    tanggal_surat: "2026-09-03",
    created_at: "2026-09-03T11:00:00Z",
  },
  {
    id_surat_keluar: 6,
    id_pegawai: 6,
    id_bagian: 1,
    id_klasifikasi: 6,
    id_jenis_surat: 1,
    nomor_surat: "006/IT.01.1-SD/71/IX/2026",
    nomor_urut: 6,
    tahun: 2026,
    bulan_romawi: "IX",
    sifat_surat: "Biasa",
    perihal: "Uji Coba Ketahanan Jaringan dan Server Integrasi Portal Pilkada",
    tujuan_surat: "Dinas Kominfo Provinsi Sulawesi Utara",
    status: "terbit",
    tanggal_surat: "2026-09-02",
    created_at: "2026-09-02T14:10:00Z",
  },
  {
    id_surat_keluar: 7,
    id_pegawai: 7,
    id_bagian: 5,
    id_klasifikasi: 14,
    id_jenis_surat: 1,
    nomor_surat: "007/RT.01.1-SD/71/IX/2026",
    nomor_urut: 7,
    tahun: 2026,
    bulan_romawi: "IX",
    sifat_surat: "Segera",
    perihal: "Permohonan Pengawalan & Pengamanan Distribusi Surat Suara Pilkada",
    tujuan_surat: "Kepala Kepolisian Daerah (Polda) Sulawesi Utara",
    status: "terbit",
    tanggal_surat: "2026-09-01",
    created_at: "2026-09-01T09:00:00Z",
  },
  {
    id_surat_keluar: 8,
    id_pegawai: 8,
    id_bagian: 1,
    id_klasifikasi: 6,
    id_jenis_surat: 1,
    nomor_surat: undefined,
    tahun: 2026,
    bulan_romawi: "IX",
    sifat_surat: "Penting",
    perihal: "Draft Petunjuk Teknis Manajemen Log Server & Atomic Row Lock",
    tujuan_surat: "Sekretariat KPU RI Jakarta",
    status: "draft",
    tanggal_surat: "2026-09-08",
    created_at: "2026-09-08T10:00:00Z",
  },
  {
    id_surat_keluar: 9,
    id_pegawai: 9,
    id_bagian: 3,
    id_klasifikasi: 5,
    id_jenis_surat: 1,
    nomor_surat: undefined,
    tahun: 2026,
    bulan_romawi: "IX",
    sifat_surat: "Penting",
    perihal: "Draft Naskah Perjanjian Hibah Daerah (NPHD) Tambahan Pilkada",
    tujuan_surat: "Badan Kesatuan Bangsa dan Politik Provinsi Sulut",
    status: "draft",
    tanggal_surat: "2026-09-08",
    created_at: "2026-09-08T11:30:00Z",
  },
  {
    id_surat_keluar: 10,
    id_pegawai: 10,
    id_bagian: 5,
    id_klasifikasi: 14,
    id_jenis_surat: 1,
    nomor_surat: undefined,
    tahun: 2026,
    bulan_romawi: "IX",
    sifat_surat: "Biasa",
    perihal: "Draft Evaluasi Tata Kelola Pergudangan Logistik Kotak dan Bilik Suara",
    tujuan_surat: "Pejabat Pembuat Komitmen & Pokja Pengadaan KPU Sulut",
    status: "draft",
    tanggal_surat: "2026-09-09",
    created_at: "2026-09-09T08:00:00Z",
  },
]

// 8 Realistic Active Surat Tugas
const INITIAL_SURAT_TUGAS_DATA = [
  {
    id: 1,
    nomor_st: "042/HR.01.2-ST/71/IX/2026",
    nomor_tugas: "NT/042/2026",
    perihal: "Koordinasi Arsitektur Sistem Informasi Pemilu di KPU RI Jakarta",
    pelaksana: "3 Pegawai Subbag Data & Informasi",
    dipa: "DIPA KPU Prov. Sulawesi Utara TA 2026",
    tanggal: "10 - 13 Sep 2026",
    lokasi: "KPU Republik Indonesia, Jakarta",
    status: "Aktif",
  },
  {
    id: 2,
    nomor_st: "043/PL.02.1-ST/71/IX/2026",
    nomor_tugas: "NT/043/2026",
    perihal: "Monitoring dan Supervisi Pemutakhiran Data Pemilih di KPU Kota Manado",
    pelaksana: "2 Staf Perencanaan & Data",
    dipa: "DIPA KPU Prov. Sulawesi Utara TA 2026",
    tanggal: "08 - 09 Sep 2026",
    lokasi: "KPU Kota Manado",
    status: "Aktif",
  },
  {
    id: 3,
    nomor_st: "044/IT.01.1-ST/71/IX/2026",
    nomor_tugas: "NT/044/2026",
    perihal: "Bimbingan Teknis Penggunaan Aplikasi Sirekap Mobile bagi PPK Kota Bitung",
    pelaksana: "4 Staf IT & Operator Sirekap",
    dipa: "DIPA KPU Prov. Sulawesi Utara TA 2026",
    tanggal: "11 - 12 Sep 2026",
    lokasi: "Aula KPU Kota Bitung",
    status: "Aktif",
  },
  {
    id: 4,
    nomor_st: "045/RT.01.1-ST/71/IX/2026",
    nomor_tugas: "NT/045/2026",
    perihal: "Supervisi Verifikasi Gudang dan Keamanan Logistik Kotak Suara Kepulauan Sangihe",
    pelaksana: "3 Staf Subbag Umum & Logistik",
    dipa: "DIPA KPU Prov. Sulawesi Utara TA 2026",
    tanggal: "14 - 17 Sep 2026",
    lokasi: "Gudang Logistik KPU Kab. Kepulauan Sangihe",
    status: "Aktif",
  },
  {
    id: 5,
    nomor_st: "046/HK.01.1-ST/71/IX/2026",
    nomor_tugas: "NT/046/2026",
    perihal: "Rapat Koordinasi Penanganan Pelanggaran Administrasi Pemilu bersama Sentra Gakkumdu",
    pelaksana: "2 Pejabat Fungsional Hukum KPU Sulut",
    dipa: "DIPA KPU Prov. Sulawesi Utara TA 2026",
    tanggal: "09 Sep 2026",
    lokasi: "Kantor Kejaksaan Tinggi Sulawesi Utara",
    status: "Aktif",
  },
  {
    id: 6,
    nomor_st: "047/KU.01.3-ST/71/IX/2026",
    nomor_tugas: "NT/047/2026",
    perihal: "Rekonsiliasi Laporan Keuangan dan Verifikasi LPJ Hibah Pilkada KPU Minahasa",
    pelaksana: "3 Tim Verifikator Subbag Keuangan",
    dipa: "DIPA KPU Prov. Sulawesi Utara TA 2026",
    tanggal: "15 - 16 Sep 2026",
    lokasi: "KPU Kabupaten Minahasa, Tondano",
    status: "Aktif",
  },
  {
    id: 7,
    nomor_st: "048/PL.01.1-ST/71/IX/2026",
    nomor_tugas: "NT/048/2026",
    perihal: "Supervisi & Uji Publik Penetapan TPS Lokasi Khusus di Rutan & Lapas Malendeng",
    pelaksana: "2 Staf Teknis Penyelenggara Pemilu",
    dipa: "DIPA KPU Prov. Sulawesi Utara TA 2026",
    tanggal: "12 Sep 2026",
    lokasi: "Lapas Kelas IIA Manado",
    status: "Aktif",
  },
  {
    id: 8,
    nomor_st: "049/HR.01.2-ST/71/IX/2026",
    nomor_tugas: "NT/049/2026",
    perihal: "Pendampingan Seleksi Terbuka dan Wawancara Calon Petugas KPPS Pilkada 2026",
    pelaksana: "3 Staf Subbag SDM & Parmas",
    dipa: "DIPA KPU Prov. Sulawesi Utara TA 2026",
    tanggal: "18 - 20 Sep 2026",
    lokasi: "KPU Kabupaten Bolaang Mongondow",
    status: "Aktif",
  },
]

// 15 Comprehensive Classification Codes according to Keputusan KPU No. 666
const INITIAL_KLASIFIKASI_DATA: KodeKlasifikasiArsip[] = [
  { id_klasifikasi: 1, kode_klasifikasi: "PL.01.1", nama_klasifikasi: "Perencanaan Penyelenggaraan Pemilu & Pemilihan", kategori_utama: "Penyelenggaraan Pemilu", retensi_aktif_tahun: 5, retensi_inaktif_tahun: 10, hak_akses: "Publik" },
  { id_klasifikasi: 2, kode_klasifikasi: "PL.02.1", nama_klasifikasi: "Pemutakhiran dan Penyusunan Data Pemilih (DPT/DPS)", kategori_utama: "Penyelenggaraan Pemilu", retensi_aktif_tahun: 3, retensi_inaktif_tahun: 5, hak_akses: "Internal" },
  { id_klasifikasi: 3, kode_klasifikasi: "PL.02.2", nama_klasifikasi: "Penetapan Daftar Pemilih Tetap & Salinan Berita Acara", kategori_utama: "Penyelenggaraan Pemilu", retensi_aktif_tahun: 5, retensi_inaktif_tahun: 10, hak_akses: "Publik" },
  { id_klasifikasi: 4, kode_klasifikasi: "PL.03.1", nama_klasifikasi: "Pencalonan Kepala Daerah & Verifikasi Berkas Paslon", kategori_utama: "Penyelenggaraan Pemilu", retensi_aktif_tahun: 5, retensi_inaktif_tahun: 10, hak_akses: "Publik" },
  { id_klasifikasi: 5, kode_klasifikasi: "PL.04.1", nama_klasifikasi: "Kampanye & Audit Laporan Dana Kampanye Peserta", kategori_utama: "Penyelenggaraan Pemilu", retensi_aktif_tahun: 5, retensi_inaktif_tahun: 7, hak_akses: "Publik" },
  { id_klasifikasi: 6, kode_klasifikasi: "HR.01.1", nama_klasifikasi: "Formasi, Rekrutmen & Administrasi Pegawai ASN KPU", kategori_utama: "SDM & Kepegawaian", retensi_aktif_tahun: 5, retensi_inaktif_tahun: 10, hak_akses: "Rahasia" },
  { id_klasifikasi: 7, kode_klasifikasi: "HR.01.2", nama_klasifikasi: "Surat Tugas & Surat Perjalanan Dinas (SPD)", kategori_utama: "SDM & Kepegawaian", retensi_aktif_tahun: 2, retensi_inaktif_tahun: 5, hak_akses: "Internal" },
  { id_klasifikasi: 8, kode_klasifikasi: "HR.02.1", nama_klasifikasi: "Pembentukan dan Pembekalan Badan Adhoc (PPK/PPS/KPPS)", kategori_utama: "SDM & Kepegawaian", retensi_aktif_tahun: 3, retensi_inaktif_tahun: 5, hak_akses: "Internal" },
  { id_klasifikasi: 9, kode_klasifikasi: "HK.01.1", nama_klasifikasi: "Peraturan, Keputusan & Keputusan Penetapan KPU", kategori_utama: "Hukum & Pengawasan", retensi_aktif_tahun: 10, retensi_inaktif_tahun: 20, hak_akses: "Publik" },
  { id_klasifikasi: 10, kode_klasifikasi: "HK.02.2", nama_klasifikasi: "Advokasi Hukum, Gugatan PTUN & Penanganan Sengketa", kategori_utama: "Hukum & Pengawasan", retensi_aktif_tahun: 5, retensi_inaktif_tahun: 10, hak_akses: "Internal" },
  { id_klasifikasi: 11, kode_klasifikasi: "KU.01.1", nama_klasifikasi: "Rencana Kerja Anggaran (RKA-K/L) & DIPA Petikan", kategori_utama: "Keuangan & Aset", retensi_aktif_tahun: 5, retensi_inaktif_tahun: 10, hak_akses: "Internal" },
  { id_klasifikasi: 12, kode_klasifikasi: "KU.01.3", nama_klasifikasi: "SPJ, Bukti Pengeluaran Kas & Hibah Daerah (NPHD)", kategori_utama: "Keuangan & Aset", retensi_aktif_tahun: 5, retensi_inaktif_tahun: 10, hak_akses: "Internal" },
  { id_klasifikasi: 13, kode_klasifikasi: "IT.01.1", nama_klasifikasi: "Infrastruktur Jaringan, Server & Keamanan Cyber IT", kategori_utama: "Data & Informasi", retensi_aktif_tahun: 3, retensi_inaktif_tahun: 5, hak_akses: "Internal" },
  { id_klasifikasi: 14, kode_klasifikasi: "RT.01.1", nama_klasifikasi: "Pengadaan, Penyimpanan & Distribusi Logistik Pemilihan", kategori_utama: "Umum & Logistik", retensi_aktif_tahun: 3, retensi_inaktif_tahun: 5, hak_akses: "Internal" },
  { id_klasifikasi: 15, kode_klasifikasi: "HM.01.1", nama_klasifikasi: "Hubungan Antar Lembaga, Pers & Publikasi Media KPU", kategori_utama: "Partisipasi Masyarakat", retensi_aktif_tahun: 2, retensi_inaktif_tahun: 5, hak_akses: "Publik" },
]

export function SuratView({ theme = "dark", subTab = "overview" }: SuratViewProps) {
  const isDark = theme === "dark"
  const { canEdit } = useAuth()
  const readOnly = !canEdit("surat")

  const getInitialTab = (
    tab: string
  ): "overview" | "surat-keluar" | "surat-tugas" | "klasifikasi" => {
    if (tab === "keluar" || tab === "surat-keluar") return "surat-keluar"
    if (tab === "surat-tugas" || tab === "masuk") return "surat-tugas"
    if (tab === "klasifikasi" || tab === "surat-klasifikasi") return "klasifikasi"
    return "overview"
  }

  const [activeTab, setActiveTab] = useState<
    "overview" | "surat-keluar" | "surat-tugas" | "klasifikasi"
  >(() => getInitialTab(subTab))

  const [suratList, setSuratList] = useState<SuratKeluar[]>(INITIAL_SURAT_KELUAR_DATA)
  const [klasifikasiList] = useState<KodeKlasifikasiArsip[]>(INITIAL_KLASIFIKASI_DATA)
  const [searchQuery, setSearchQuery] = useState<string>("")

  // Modal State
  const [showDraftModal, setShowDraftModal] = useState<boolean>(false)
  const [notification, setNotification] = useState<string | null>(null)

  // Draft Form State
  const [formKlasifikasi, setFormKlasifikasi] = useState<number>(1)
  const [formPerihal, setFormPerihal] = useState<string>("")
  const [formTujuan, setFormTujuan] = useState<string>("")
  const [formIsi, setFormIsi] = useState<string>("")

  const showToast = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 4500)
  }

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formPerihal || !formTujuan) {
      alert("Mohon isi perihal dan tujuan surat!")
      return
    }

    const newDraft = await createDraftSuratKeluar({
      id_pegawai: 1,
      id_bagian: 1,
      id_klasifikasi: formKlasifikasi,
      id_jenis_surat: 1,
      sifat_surat: "Biasa",
      perihal: formPerihal,
      tujuan_surat: formTujuan,
      isi_surat: formIsi,
      tanggal_surat: new Date().toISOString().split("T")[0],
    })

    setSuratList([newDraft, ...suratList])
    setShowDraftModal(false)
    setFormPerihal("")
    setFormTujuan("")
    setFormIsi("")
    showToast("Draft surat keluar berhasil dibuat!")
  }

  const handleFinalizeNumber = async (id: number) => {
    const updated = await finalisasiSuratAtomic(id)
    setSuratList(suratList.map((s) => (s.id_surat_keluar === id ? updated : s)))
    showToast(`Nomor Surat Resmi Berhasil Diterbitkan: ${updated.nomor_surat}`)
  }

  const filteredSurat = suratList.filter(
    (s) =>
      s.perihal.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.nomor_surat && s.nomor_surat.toLowerCase().includes(searchQuery.toLowerCase())) ||
      s.tujuan_surat.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Top 5 recent letters for overview
  const recentSuratOverview = suratList.slice(0, 5)

  // Category distribution for overview
  const categoryDistribution = [
    { name: "Penyelenggaraan Pemilu (PL)", count: 4, pct: 40 },
    { name: "Keuangan & Pertanggungjawaban (KU)", count: 2, pct: 20 },
    { name: "Umum & Logistik Pilkada (RT)", count: 2, pct: 20 },
    { name: "Hukum & Advokasi (HK)", count: 1, pct: 10 },
    { name: "SDM & Kepegawaian (HR)", count: 1, pct: 10 },
  ]

  const pageTitle = {
    overview: "Overview",
    "surat-keluar": "Surat Keluar",
    "surat-tugas": "Surat Tugas",
    klasifikasi: "Kode Klasifikasi",
  }[activeTab]

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Notification Toast */}
      {notification && (
        <div
          className={`fixed top-6 right-6 z-50 p-4 px-5 rounded-2xl border flex items-center gap-3 backdrop-blur-md shadow-2xl transition-all ${isDark
              ? "bg-[#0f172a]/95 border-red-500/40 text-white"
              : "bg-white/95 border-red-500/50 text-slate-900"
            }`}
        >
          <div className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <span className="text-sm font-bold">
            {notification}
          </span>
          <button
            onClick={() => setNotification(null)}
            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors ml-2 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Standard Unified Page Header - Merah, Hitam, Putih */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
            Surat
          </p>
          <h1 className={`text-xl font-bold tracking-tight my-0 ${isDark ? "text-white" : "text-black"}`}>
            {pageTitle}
          </h1>
          <p className={`text-xs mt-1 font-medium ${isDark ? "text-gray-300" : "text-slate-700"}`}>
            Portal Penomoran Surat Keluar, Penugasan Pegawai & Standarisasi Klasifikasi Arsip KPU Provinsi Sulawesi Utara
          </p>
        </div>

        {/* Action Buttons for Surat Keluar */}
        {activeTab === "surat-keluar" && !readOnly && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSuratList(INITIAL_SURAT_KELUAR_DATA)}
              className={`px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-sm ${isDark
                  ? "border-slate-700 bg-[#0f172a] text-white hover:bg-slate-800"
                  : "border-slate-300 bg-white text-black hover:bg-slate-50"
                }`}
            >
              <RefreshCw className="w-4 h-4 text-red-600" />
              <span>Reset Data</span>
            </button>
            <button
              onClick={() => setShowDraftModal(true)}
              className="btn-kpu-red px-4 py-2 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Draft Surat</span>
            </button>
          </div>
        )}
      </div>

      {readOnly && <ReadOnlyBanner theme={theme} modul="surat menyurat" pengelola="Sub Bagian Umum dan Logistik (UMLOG)" />}

      {/* ========================================================================= */}
      {/* 1. OVERVIEW TAB */}
      {/* ========================================================================= */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* 4 Metric Cards - Konsisten Merah, Hitam, Putih (Warna Ikon & Aksen Seragam) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Surat Keluar */}
            <Card
              className={`relative overflow-hidden transition-all ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"
                } backdrop-blur-md shadow-lg rounded-2xl`}
            >
              <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600"></div>
              <CardContent className={`m-3 ml-4 p-4 rounded-xl border flex items-center justify-between min-h-[118px] ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                <div className="flex-1 flex flex-col justify-center">
                  <p className={`text-xs font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                    Total Surat Keluar
                  </p>
                  <h2 className={`text-3xl font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>
                    {suratList.length}
                  </h2>
                  <p className="text-xs font-semibold mt-1.5 text-red-600 dark:text-red-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Penomoran Otomatis Aktif
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Draft Dalam Proses */}
            <Card
              className={`relative overflow-hidden transition-all ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"
                } backdrop-blur-md shadow-lg rounded-2xl`}
            >
              <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600"></div>
              <CardContent className={`m-3 ml-4 p-4 rounded-xl border flex items-center justify-between min-h-[118px] ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                <div className="flex-1 flex flex-col justify-center">
                  <p className={`text-xs font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                    Draft Dalam Proses
                  </p>
                  <h2 className={`text-3xl font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>
                    {suratList.filter((s) => s.status === "draft").length}
                  </h2>
                  <p className="text-xs font-semibold mt-1.5 text-red-600 dark:text-red-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Menunggu finalisasi nomor
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0">
                  <AlertCircle className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Surat Diterbitkan Resmi */}
            <Card
              className={`relative overflow-hidden transition-all ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"
                } backdrop-blur-md shadow-lg rounded-2xl`}
            >
              <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600"></div>
              <CardContent className={`m-3 ml-4 p-4 rounded-xl border flex items-center justify-between min-h-[118px] ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                <div className="flex-1 flex flex-col justify-center">
                  <p className={`text-xs font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                    Surat Diterbitkan
                  </p>
                  <h2 className={`text-3xl font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>
                    {suratList.filter((s) => s.status === "terbit").length}
                  </h2>
                  <p className="text-xs font-semibold mt-1.5 text-red-600 dark:text-red-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Terarsip Elektronik
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>

            {/* Card 4: Master Klasifikasi Arsip */}
            <Card
              className={`relative overflow-hidden transition-all ${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"
                } backdrop-blur-md shadow-lg rounded-2xl`}
            >
              <div className="absolute top-0 left-0 w-1.5 h-full bg-red-600"></div>
              <CardContent className={`m-3 ml-4 p-4 rounded-xl border flex items-center justify-between min-h-[118px] ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                <div className="flex-1 flex flex-col justify-center">
                  <p className={`text-xs font-extrabold tracking-wider uppercase ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                    Klasifikasi Arsip
                  </p>
                  <h2 className={`text-3xl font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>
                    {klasifikasiList.length}
                  </h2>
                  <p className="text-xs font-semibold mt-1.5 text-red-600 dark:text-red-400 flex items-center gap-1">
                    <Database className="w-3.5 h-3.5" /> Keputusan KPU No. 666
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0">
                  <Database className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Data Ringkasan Overview (Menggantikan Card Keunggulan) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 1. Ringkasan Surat Keluar Terkini (2 Kolom) */}
            <div className="lg:col-span-2">
              <Card
                className={`${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"
                  } backdrop-blur-md shadow-lg rounded-2xl h-full flex flex-col justify-between`}
              >
                <CardHeader className="p-5 pb-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-5 h-5 text-red-600" />
                    <div>
                      <CardTitle className={`text-base font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>
                        Surat Keluar Terkini
                      </CardTitle>
                      <p className={`text-xs mt-0.5 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                        5 berkas surat keluar terakhir yang dicatat dalam sistem
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab("surat-keluar")}
                    className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>Lihat Semua</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </CardHeader>

                <CardContent className="p-5 flex-1">
                  <div className="space-y-2.5">
                    {recentSuratOverview.map((item) => (
                      <div
                        key={item.id_surat_keluar}
                        className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${isDark ? "bg-[#111827]/60 border-white/10 hover:border-white/20" : "bg-slate-50 border-slate-200 hover:border-slate-300"
                          }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {item.status === "terbit" ? (
                              <Badge variant="terkirim" className="text-[10px] px-2 py-0.5">
                                Terbit
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-red-600/10 text-red-600 border-red-500/30">
                                Draft
                              </Badge>
                            )}
                            <span className="font-mono text-xs font-bold text-red-600 dark:text-red-400">
                              {item.nomor_surat || "(Draft Belum Terbit)"}
                            </span>
                          </div>
                          <h4 className={`text-xs font-bold my-0.5 truncate ${isDark ? "text-white" : "text-black"}`}>
                            {item.perihal}
                          </h4>
                          <p className={`text-xs truncate m-0 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                            Tujuan: {item.tujuan_surat}
                          </p>
                        </div>
                        <div className="text-left sm:text-right shrink-0">
                          <span className={`text-xs font-semibold ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                            {item.tanggal_surat}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 2. Distribusi Kategori Klasifikasi Arsip (1 Kolom) */}
            <div className="lg:col-span-1">
              <Card
                className={`${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"
                  } backdrop-blur-md shadow-lg rounded-2xl h-full flex flex-col justify-between`}
              >
                <CardHeader className="p-5 pb-4 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <PieChart className="w-5 h-5 text-red-600" />
                    <div>
                      <CardTitle className={`text-base font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>
                        Distribusi Berkas
                      </CardTitle>
                      <p className={`text-xs mt-0.5 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                        Berdasarkan kategori klasifikasi arsip
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-white bg-red-600 px-2.5 py-0.5 rounded-md shadow-sm">
                    {suratList.length} Total
                  </span>
                </CardHeader>

                <CardContent className="p-5 space-y-2.5 flex-1 flex flex-col">
                  {categoryDistribution.map((cat, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-xl border space-y-2 transition-colors ${isDark ? "bg-[#111827]/60 border-white/10 hover:border-white/20" : "bg-slate-50 border-slate-200 hover:border-slate-300"}`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className={`font-bold truncate max-w-[200px] ${isDark ? "text-white" : "text-black"}`}>
                          {cat.name}
                        </span>
                        <span className="font-mono font-bold text-red-600 dark:text-red-400">
                          {cat.count} surat ({cat.pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-red-600 h-full rounded-full transition-all duration-500"
                          style={{ width: `${cat.pct}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 3. Ringkasan Penugasan Lapangan (Surat Tugas Aktif) */}
          <Card
            className={`${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"
              } backdrop-blur-md shadow-lg rounded-2xl`}
          >
            <CardHeader className="p-5 pb-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Briefcase className="w-5 h-5 text-red-600" />
                <div>
                  <CardTitle className={`text-base font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>
                    Ringkasan Penugasan Pegawai & Surat Tugas Berjalan
                  </CardTitle>
                  <p className={`text-xs mt-0.5 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                    Status personil lapangan yang sedang aktif melaksanakan tugas dinas KPU Sulut
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveTab("surat-tugas")}
                className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer transition-colors self-start sm:self-auto"
              >
                <span>Buka Modul Surat Tugas</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </CardHeader>

            <CardContent className="p-5">
              {/* Highlight Metrics Penugasan */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className={`p-3.5 rounded-xl border ${isDark ? "bg-[#111827]/70 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <Layers className="w-4 h-4 text-red-600" />
                    <span>Total ST Terbit</span>
                  </div>
                  <div className={`text-xl font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>
                    8 Berkas
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border ${isDark ? "bg-[#111827]/70 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <Users className="w-4 h-4 text-red-600" />
                    <span>Personil Lapangan</span>
                  </div>
                  <div className={`text-xl font-black mt-1 text-red-600 dark:text-red-400`}>
                    22 Pegawai
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border ${isDark ? "bg-[#111827]/70 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <MapPin className="w-4 h-4 text-red-600" />
                    <span>Wilayah Tugas</span>
                  </div>
                  <div className={`text-xl font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>
                    5 Kab/Kota & Pusat
                  </div>
                </div>

                <div className={`p-3.5 rounded-xl border ${isDark ? "bg-[#111827]/70 border-white/10" : "bg-slate-50 border-slate-200"}`}>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <CheckCircle2 className="w-4 h-4 text-red-600" />
                    <span>Beban Anggaran</span>
                  </div>
                  <div className={`text-xl font-black mt-1 ${isDark ? "text-white" : "text-black"}`}>
                    100% DIPA Sulut
                  </div>
                </div>
              </div>

              {/* List of 3 Active Assignments Preview */}
              <div className="space-y-2.5">
                {INITIAL_SURAT_TUGAS_DATA.slice(0, 3).map((st) => (
                  <div
                    key={st.id}
                    className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors ${isDark ? "bg-[#111827]/60 border-white/10" : "bg-slate-50 border-slate-200"
                      }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-red-600 dark:text-red-400">
                          {st.nomor_tugas}
                        </span>
                        <span className={`text-xs font-bold ${isDark ? "text-white" : "text-black"}`}>
                          {st.perihal}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                        <span>Pelaksana: <strong className={isDark ? "text-gray-300" : "text-slate-700"}>{st.pelaksana}</strong></span>
                        <span>Lokasi: <strong className={isDark ? "text-gray-300" : "text-slate-700"}>{st.lokasi}</strong></span>
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <span className="text-xs font-bold text-red-600 dark:text-red-400">
                        {st.tanggal}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SURAT KELUAR TAB */}
      {/* ========================================================================= */}
      {activeTab === "surat-keluar" && (
        <div className="space-y-4">
          {/* Search & Stats Bar */}
          <Card
            className={`${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"
              } backdrop-blur-md shadow-lg rounded-2xl`}
          >
            <CardContent className="p-4 !pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
              <div className="relative flex-1 max-w-md">
                <Search
                  className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? "text-gray-400" : "text-slate-500"
                    }`}
                />
                <input
                  type="text"
                  placeholder="Cari perihal surat, nomor surat resmi, tujuan..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`workspace-search-input w-full pl-10 pr-4 py-2 text-xs font-semibold rounded-xl border outline-none transition-colors ${isDark
                      ? "bg-[#131b2e] border-[#1e293b] text-white focus:border-red-500"
                      : "bg-slate-50 border-slate-300 text-black placeholder-slate-400 focus:border-red-500"
                    }`}
                />
              </div>

              <div className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                Total: <span className="text-red-600 font-extrabold">{filteredSurat.length}</span> surat keluar terdaftar
              </div>
            </CardContent>
          </Card>

          {/* Surat Keluar Table */}
          <Card
            className={`${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"
              } backdrop-blur-md shadow-lg rounded-2xl overflow-hidden`}
          >
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow
                    className={
                      isDark
                        ? "border-b border-white/30 bg-[#0a0e1a]"
                        : "border-b border-slate-200 bg-slate-100"
                    }
                  >
                    <TableHead className={`h-11 text-xs font-extrabold ${isDark ? "text-white" : "text-black"}`}>
                      Status
                    </TableHead>
                    <TableHead className={`h-11 text-xs font-extrabold ${isDark ? "text-white" : "text-black"}`}>
                      Nomor Surat Resmi
                    </TableHead>
                    <TableHead className={`h-11 text-xs font-extrabold ${isDark ? "text-white" : "text-black"}`}>
                      Perihal
                    </TableHead>
                    <TableHead className={`h-11 text-xs font-extrabold ${isDark ? "text-white" : "text-black"}`}>
                      Tujuan Surat
                    </TableHead>
                    <TableHead className={`h-11 text-xs font-extrabold ${isDark ? "text-white" : "text-black"}`}>
                      Tanggal
                    </TableHead>
                    <TableHead className={`h-11 text-xs font-extrabold text-center ${isDark ? "text-white" : "text-black"}`}>
                      Aksi / Finalisasi
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSurat.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-sm text-slate-500">
                        Tidak ada surat yang sesuai dengan filter pencarian.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSurat.map((surat) => (
                      <TableRow
                        key={surat.id_surat_keluar}
                        className={
                          isDark
                            ? "border-b border-white/20"
                            : "border-b border-slate-100"
                        }
                      >
                        <TableCell className="py-3.5">
                          {surat.status === "terbit" ? (
                            <Badge variant="terkirim" className="text-xs px-2.5 py-1">
                              Terbit
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs px-2.5 py-1 bg-red-600/10 text-red-600 border-red-500/30">
                              Draft
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm font-bold text-red-600 dark:text-red-400 py-3.5 whitespace-nowrap">
                          {surat.nomor_surat || "(Belum Terbit)"}
                        </TableCell>
                        <TableCell className={`text-sm font-semibold py-3.5 max-w-xs ${isDark ? "text-white" : "text-black"}`}>
                          {surat.perihal}
                        </TableCell>
                        <TableCell className={`text-sm py-3.5 ${isDark ? "text-gray-300" : "text-slate-700"}`}>
                          {surat.tujuan_surat}
                        </TableCell>
                        <TableCell className={`text-sm py-3.5 whitespace-nowrap ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                          {surat.tanggal_surat}
                        </TableCell>
                        <TableCell className="text-center py-3.5">
                          {surat.status === "draft" && readOnly ? (
                            <span className="text-xs font-bold text-slate-500 dark:text-gray-400">Draft</span>
                          ) : surat.status === "draft" ? (
                            <button
                              onClick={() => handleFinalizeNumber(surat.id_surat_keluar)}
                              className="btn-kpu-red px-3 py-1.5 text-xs font-bold text-white rounded-lg flex items-center gap-1.5 mx-auto transition-all cursor-pointer active:scale-95"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Terbitkan (Atomic)</span>
                            </button>
                          ) : (
                            <span className="text-xs font-bold text-red-600 dark:text-red-400 inline-flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4" /> Terarsip
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SURAT TUGAS TAB */}
      {/* ========================================================================= */}
      {activeTab === "surat-tugas" && (
        <div className="space-y-4">
          <Card
            className={`${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"
              } backdrop-blur-md shadow-lg rounded-2xl`}
          >
            <CardHeader className="p-5 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className={`text-base font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>
                    Daftar Surat Tugas & Penugasan Pegawai Aktif
                  </CardTitle>
                  <p className={`text-xs mt-1 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                    Penerbitan Nomor Tugas (NT) otomatis dan integrasi anggaran DIPA KPU Provinsi Sulawesi Utara
                  </p>
                </div>
                <Badge variant="terkirim" className="text-xs px-3 py-1 self-start sm:self-auto">
                  {INITIAL_SURAT_TUGAS_DATA.length} Surat Tugas Aktif
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5 space-y-3.5">
              {INITIAL_SURAT_TUGAS_DATA.map((st) => (
                <div
                  key={st.id}
                  className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all ${isDark
                      ? "bg-[#111827]/70 border-white/10 hover:border-red-500/40"
                      : "bg-slate-50 border-slate-200 hover:border-red-300"
                    }`}
                >
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="text-xs font-black bg-red-600 text-white px-2.5 py-0.5 rounded-md">
                        ST Resmi
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-400">{st.nomor_st}</span>
                      <span className="text-xs font-mono font-bold text-red-600 dark:text-red-400">
                        ({st.nomor_tugas})
                      </span>
                    </div>
                    <h4 className={`text-sm font-bold my-1 ${isDark ? "text-white" : "text-black"}`}>
                      {st.perihal}
                    </h4>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-red-600" />
                        {st.tanggal}
                      </span>
                      <span>Lokasi: <strong className={isDark ? "text-gray-300" : "text-slate-700"}>{st.lokasi}</strong></span>
                    </div>
                  </div>

                  <div className="text-left md:text-right border-t md:border-t-0 pt-2 md:pt-0 border-slate-200 dark:border-slate-800">
                    <div className={`text-xs font-semibold flex items-center md:justify-end gap-1 ${isDark ? "text-gray-300" : "text-slate-800"}`}>
                      <UserCheck className="w-3.5 h-3.5 text-red-600" />
                      {st.pelaksana}
                    </div>
                    <div className="text-xs font-bold text-red-600 dark:text-red-400 mt-1">
                      {st.dipa}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. KODE KLASIFIKASI ARSIP TAB */}
      {/* ========================================================================= */}
      {activeTab === "klasifikasi" && (
        <div className="space-y-4">
          <Card
            className={`${isDark ? "bg-[#1e293b]/70 border-white/10" : "bg-white/85 border-slate-200"
              } backdrop-blur-md shadow-lg rounded-2xl`}
          >
            <CardHeader className="p-5 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className={`text-base font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>
                    Master Kode Klasifikasi Arsip KPU RI
                  </CardTitle>
                  <p className={`text-xs mt-1 ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                    Standardisasi Klasifikasi Surat & Dokumen Resmi KPU Sulawesi Utara sesuai Keputusan KPU No. 666
                  </p>
                </div>
                <Badge variant="terkirim" className="text-xs px-3 py-1 self-start sm:self-auto">
                  {klasifikasiList.length} Kode Standar KPU
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {klasifikasiList.map((item) => (
                  <div
                    key={item.id_klasifikasi}
                    className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${isDark
                        ? "bg-[#111827]/70 border-white/10 hover:border-red-500/40"
                        : "bg-slate-50 border-slate-200 hover:border-red-300"
                      }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-xs font-black bg-red-600 text-white px-2.5 py-0.5 rounded-md shadow-sm">
                          {item.kode_klasifikasi}
                        </span>
                        <span className="text-xs font-bold text-slate-700 dark:text-gray-300 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">
                          Akses: {item.hak_akses}
                        </span>
                      </div>
                      <h4 className={`text-sm font-bold my-1 ${isDark ? "text-white" : "text-black"}`}>
                        {item.nama_klasifikasi}
                      </h4>
                      <p className={`text-xs ${isDark ? "text-gray-400" : "text-slate-600"}`}>
                        Kategori: <span className="font-semibold">{item.kategori_utama}</span>
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-3 mt-3 border-t border-slate-200 dark:border-slate-800 font-medium">
                      <span>Aktif: <strong className="text-red-600">{item.retensi_aktif_tahun} Thn</strong></span>
                      <span>Inaktif: <strong className={isDark ? "text-gray-300" : "text-black"}>{item.retensi_inaktif_tahun} Thn</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRAFT SURAT MODAL - Merah, Hitam, Putih */}
      {/* ========================================================================= */}
      {showDraftModal && !readOnly && (
        <div className="modal-overlay">
          <div
            className={`w-full max-w-lg p-6 rounded-2xl border backdrop-blur-md shadow-2xl transition-all ${isDark
                ? "bg-[#0f172a] border-white/20 text-white"
                : "bg-white border-slate-300 text-slate-900"
              }`}
          >
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className={`text-base font-bold my-0 ${isDark ? "text-white" : "text-black"}`}>
                Buat Draft Surat Keluar Baru
              </h3>
              <button
                onClick={() => setShowDraftModal(false)}
                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleCreateDraft} className="space-y-4 text-xs">
              <div>
                <label className={`block font-bold mb-1.5 ${isDark ? "text-gray-200" : "text-slate-800"}`}>
                  Kode Klasifikasi Arsip (Sesuai Kpt 666)
                </label>
                <select
                  value={formKlasifikasi}
                  onChange={(e) => setFormKlasifikasi(Number(e.target.value))}
                  className={`w-full px-3.5 py-2 rounded-xl border text-xs font-medium outline-none ${isDark
                      ? "bg-[#131b2e] border-[#1e293b] text-white"
                      : "bg-slate-50 border-slate-300 text-black"
                    }`}
                >
                  {klasifikasiList.map((k) => (
                    <option key={k.id_klasifikasi} value={k.id_klasifikasi}>
                      {k.kode_klasifikasi} - {k.nama_klasifikasi} ({k.kategori_utama})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block font-bold mb-1.5 ${isDark ? "text-gray-200" : "text-slate-800"}`}>
                  Perihal Surat
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Rapat Koordinasi Pemutakhiran Data Pemilih..."
                  value={formPerihal}
                  onChange={(e) => setFormPerihal(e.target.value)}
                  className={`w-full px-3.5 py-2 rounded-xl border text-xs font-medium outline-none ${isDark
                      ? "bg-[#131b2e] border-[#1e293b] text-white placeholder-gray-500"
                      : "bg-slate-50 border-slate-300 text-black placeholder-slate-400"
                    }`}
                />
              </div>

              <div>
                <label className={`block font-bold mb-1.5 ${isDark ? "text-gray-200" : "text-slate-800"}`}>
                  Tujuan Surat
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Ketua KPU Kabupaten/Kota Se-Sulawesi Utara..."
                  value={formTujuan}
                  onChange={(e) => setFormTujuan(e.target.value)}
                  className={`w-full px-3.5 py-2 rounded-xl border text-xs font-medium outline-none ${isDark
                      ? "bg-[#131b2e] border-[#1e293b] text-white placeholder-gray-500"
                      : "bg-slate-50 border-slate-300 text-black placeholder-slate-400"
                    }`}
                />
              </div>

              <div>
                <label className={`block font-bold mb-1.5 ${isDark ? "text-gray-200" : "text-slate-800"}`}>
                  Isi Ringkas Surat (Opsional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Catatan atau pokok draf surat dinas..."
                  value={formIsi}
                  onChange={(e) => setFormIsi(e.target.value)}
                  className={`w-full px-3.5 py-2 rounded-xl border text-xs font-medium outline-none resize-none ${isDark
                      ? "bg-[#131b2e] border-[#1e293b] text-white placeholder-gray-500"
                      : "bg-slate-50 border-slate-300 text-black placeholder-slate-400"
                    }`}
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDraftModal(false)}
                  className={`px-4 py-2 rounded-xl border font-bold text-xs ${isDark
                      ? "border-slate-700 hover:bg-slate-800 text-gray-300"
                      : "border-slate-300 hover:bg-slate-100 text-slate-700"
                    }`}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-kpu-red px-5 py-2 text-white font-bold text-xs rounded-xl cursor-pointer transition-all active:scale-95"
                >
                  Simpan Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
