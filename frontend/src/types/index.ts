export interface Bagian {
  id_bagian: number;
  kode_bagian: string;
  nama_bagian: string;
}

export interface Pegawai {
  id_pegawai: number;
  id_bagian?: number;
  nama: string;
  nip?: string;
  jabatan?: string;
  role: string;
}

export interface KodeKlasifikasiArsip {
  id_klasifikasi: number;
  kode_klasifikasi: string;
  nama_klasifikasi: string;
  kategori_utama: string;
  deskripsi?: string;
  retensi_aktif_tahun: number;
  retensi_inaktif_tahun: number;
  hak_akses: string;
}

export interface JenisSurat {
  id_jenis_surat: number;
  kode_jenis: string;
  nama_jenis: string;
  format_nomor: string;
}

export interface SuratKeluar {
  id_surat_keluar: number;
  id_pegawai: number;
  id_bagian: number;
  id_klasifikasi: number;
  id_jenis_surat: number;
  nomor_surat?: string;
  nomor_urut?: number;
  tahun: number;
  bulan_romawi: string;
  sifat_surat: string;
  lampiran?: string;
  perihal: string;
  tujuan_surat: string;
  isi_surat?: string;
  file_surat?: string;
  status: 'draft' | 'disetujui' | 'terbit' | 'diarsipkan';
  tanggal_surat: string;
  tanggal_terbit?: string;
  created_at: string;

  klasifikasi?: KodeKlasifikasiArsip;
  jenis_surat?: JenisSurat;
  bagian?: Bagian;
}

export interface PelaksanaTugas {
  id_pelaksana?: number;
  id_pegawai: number;
  peran_tugas: string;
  pegawai?: Pegawai;
}

export interface SuratTugas {
  id_surat_tugas: number;
  id_surat_keluar: number;
  nomor_tugas: string;
  maksud_tugas: string;
  tempat_tugas: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  beban_anggaran?: string;
  surat_keluar?: SuratKeluar;
  pelaksana: PelaksanaTugas[];
}
