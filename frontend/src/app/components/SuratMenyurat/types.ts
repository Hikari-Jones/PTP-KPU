export interface SuratItem {
  id: string
  nomorSurat: string
  perihal: string
  jenis: "masuk" | "keluar" | "nota_dinas"
  pengirim: string
  penerima: string
  tanggal: string
  tenggatWaktu?: string
  prioritas: "biasa" | "penting" | "sangat_penting" | "rahasia"
  status:
    | "registrasi"
    | "menunggu_disposisi"
    | "dalam_proses"
    | "selesai_disposisi"
    | "draft"
    | "revisi"
    | "menunggu_tte"
    | "disetujui"
    | "terkirim_terarsip"
  fileUrl?: string
  fileName?: string
  fileSize?: string
  ringkasanIsi?: string
  
  // Disposisi detail
  disposisi?: {
    tujuanUnit: string
    catatan: string
    prioritas: string
    tenggatWaktu: string
    tanggalDisposisi: string
    disposisiOleh: string
  }

  // Approval / Revisi detail
  catatanRevisi?: string

  // TTE detail
  tteInfo?: {
    penandatangan: string
    jabatan: string
    tanggalTte: string
    passphraseHash?: string
    barcodeData?: string
  }

  // Pengiriman detail
  pengiriman?: {
    metode: "email" | "cetak" | "internal"
    tanggalKirim: string
    nomorResiAtauBukti?: string
  }

  // Audit trail (riwayat)
  history: {
    id: string
    tanggal: string
    waktu: string
    aktor: string
    jabatan: string
    aksi: string
    keterangan: string
    badgeColor?: string
  }[]
}

export interface DisposisiFormState {
  tujuanUnit: string
  catatan: string
  prioritas: "biasa" | "penting" | "sangat_penting"
  tenggatWaktu: string
}

export interface SuratMasukFormState {
  pengirim: string
  penerima: string
  nomorSurat: string
  perihal: string
  tanggal: string
  prioritas: "biasa" | "penting" | "sangat_penting" | "rahasia"
  ringkasanIsi: string
  fileName: string
}

export interface SuratKeluarFormState {
  penerima: string
  perihal: string
  tujuan: string
  kategoriSurat: string
  isiSurat: string
  catatanInternal: string
  fileName: string
}
