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
