export interface AkunAnggaran {
  kode: string
  nama: string
  tahun?: number
  pagu: number
  realisasi: number
  sisa: number
  divisi?: string
  persentase?: number
  subbagian?: string
}

export interface TransaksiRealisasi {
  id: string
  tanggal: string
  noDokumen: string
  kodeAkun: string
  namaAkun: string
  subbagian: string
  usulanKegiatan: string
  jumlah: number
  buktiFile: string | null
  status: "Draft" | "Menunggu Verifikasi" | "Disetujui" | "Ditolak"
  periode: string
}

export interface SatkerItem {
  id: string
  kode: string
  nama: string
  kepala: string
  pagu: number
  realisasi: number
  status: string
}

export interface TahunAnggaranItem {
  id: string
  tahun: number
  status: "Aktif" | "Ditutup" | "Draft"
  tanggalMulai: string
  tanggalSelesai: string
  deskripsi: string
  dibuatOleh: string
}

// =========================================================
// BACKEND RESPONSE INTERFACES (PHASE 7 - 11)
// =========================================================

export interface BagianResponse {
  id_bagian: number
  nama_bagian: string
}

export interface TahunAnggaranCreatePayload {
  tahun: number
  status: "draft" | "active" | "closed"
  tanggal_mulai: string
  tanggal_selesai: string
  deskripsi?: string | null
}

export interface TahunAnggaranUpdatePayload {
  tahun?: number
  status?: "draft" | "active" | "closed"
  tanggal_mulai?: string
  tanggal_selesai?: string
  deskripsi?: string | null
}

export interface TahunAnggaranResponse {
  id_tahun_anggaran: number
  tahun: number
  status: "draft" | "active" | "closed"
  tanggal_mulai: string
  tanggal_selesai: string
  deskripsi?: string | null
  id_pegawai_pembuat?: number | null
  nama_pembuat?: string | null
  total_pagu: number
  total_realisasi_verified: number
  sisa_anggaran: number
  persentase_serapan: number
  jumlah_akun: number
  created_at: string
  updated_at: string
}

export interface TahunAnggaranListResponse {
  total: number
  items: TahunAnggaranResponse[]
}

export interface AkunAnggaranCreatePayload {
  id_bagian: number
  kode_akun: string
  nama_akun: string
  jenis_belanja?: string | null
  program?: string | null
  sub_program?: string | null
  total_pagu?: number
  status: "active" | "inactive"
}

export interface AkunAnggaranUpdatePayload {
  id_bagian?: number
  kode_akun?: string
  nama_akun?: string
  jenis_belanja?: string | null
  program?: string | null
  sub_program?: string | null
  status?: "active" | "inactive"
}

export interface AkunAnggaranResponse {
  id_akun_anggaran: number
  id_bagian: number
  kode_akun: string
  nama_akun: string
  jenis_belanja?: string | null
  program?: string | null
  sub_program?: string | null
  status: "active" | "inactive"
  total_pagu: number
  nama_bagian?: string | null
  kode_bagian?: string | null
  created_at: string
  updated_at: string
}

export interface AkunAnggaranListResponse {
  total: number
  items: AkunAnggaranResponse[]
}

export interface PaguAnggaranResponse {
  id_pagu: number
  id_tahun_anggaran: number
  id_akun_anggaran: number
  pagu_awal: number
  pagu_aktif: number
  nomor_sk?: string | null
  tanggal_sk?: string | null
  keterangan?: string | null
  created_at: string
  updated_at: string
  tahun?: number | null
  kode_akun?: string | null
  nama_akun?: string | null
  nama_bagian?: string | null
  total_realisasi_verified: number
  sisa_anggaran: number
  persentase_serapan: number
}

export interface PaguAnggaranListResponse {
  total: number
  items: PaguAnggaranResponse[]
}

export interface RealisasiAnggaranCreatePayload {
  id_pagu: number
  tanggal_transaksi: string
  nomor_dokumen: string
  uraian_kegiatan: string
  jumlah_realisasi: number
  periode?: string | null
  bukti_file_path?: string | null
  bukti_file_nama?: string | null
  bukti_file_ukuran?: number | null
  bukti_file_mime?: string | null
}

export interface RealisasiAnggaranResponse {
  id_realisasi: number
  id_pagu?: number | null
  id_akun_anggaran: number
  id_pegawai?: number | null
  id_verifier?: number | null
  tanggal_transaksi: string
  nomor_dokumen: string
  uraian_kegiatan: string
  jumlah_realisasi: number
  status: "draft" | "submitted" | "verified" | "rejected"
  periode?: string | null
  bukti_file_path?: string | null
  bukti_file_nama?: string | null
  bukti_file_ukuran?: number | null
  bukti_file_mime?: string | null
  catatan_verifikasi?: string | null
  verified_at?: string | null
  created_at: string
  updated_at: string
  tahun?: number | null
  kode_akun?: string | null
  nama_akun?: string | null
  nama_bagian?: string | null
  nama_operator?: string | null
  nama_verifier?: string | null
  pagu_aktif?: number | null
  sisa_anggaran?: number | null
  persentase_serapan?: number | null
}

export interface RealisasiAnggaranListResponse {
  total: number
  items: RealisasiAnggaranResponse[]
}

export interface MonthlyRealizationItem {
  bulan: number
  nama_bulan: string
  total_realisasi_verified: number
  persentase_serapan: number
  total_transaksi_verified: number
}

export interface DashboardSummaryResponse {
  id_tahun_anggaran?: number | null
  tahun?: number | null
  status_tahun?: "draft" | "active" | "closed" | null
  id_akun_anggaran?: number | null
  bulan?: number | null
  total_pagu_aktif: number
  total_realisasi_verified: number
  total_sisa_anggaran: number
  persentase_serapan: number
  total_transaksi_draft: number
  total_transaksi_submitted: number
  total_transaksi_verified: number
  total_transaksi_rejected: number
  monthly_recap: MonthlyRealizationItem[]
}

export interface MonthlyReportRowItem {
  id_akun_anggaran: number
  kode_akun: string
  nama_akun: string
  nama_bagian?: string | null
  pagu: number
  januari: number
  februari: number
  maret: number
  april: number
  mei: number
  juni: number
  juli: number
  agustus: number
  september: number
  oktober: number
  november: number
  desember: number
  total_realisasi: number
  sisa_anggaran: number
  persentase_realisasi: number
}

export interface MonthlyReportTotal {
  pagu: number
  januari: number
  februari: number
  maret: number
  april: number
  mei: number
  juni: number
  juli: number
  agustus: number
  september: number
  oktober: number
  november: number
  desember: number
  total_realisasi: number
  sisa_anggaran: number
  persentase_realisasi: number
}

export interface MonthlyReportResponse {
  id_tahun_anggaran?: number | null
  tahun?: number | null
  status_tahun?: string | null
  rows: MonthlyReportRowItem[]
  total: MonthlyReportTotal
}

// =========================================================
// REVISI ANGGARAN & AUDIT TRAIL (PHASE 12 & 15A)
// =========================================================

export interface RevisiAnggaranCreatePayload {
  id_pagu: number
  nomor_revisi: string
  tanggal_revisi: string
  pagu_baru: number
  alasan_revisi: string
}

export interface RevisiAnggaranResponse {
  id_revisi: number
  id_pagu: number
  id_pegawai: number
  nomor_revisi: string
  tanggal_revisi: string
  pagu_sebelum: number
  pagu_sesudah: number
  perubahan_netto: number
  alasan_revisi: string
  nama_pegawai?: string | null
  created_at: string
}

export interface RevisiAnggaranListResponse {
  total: number
  items: RevisiAnggaranResponse[]
}
