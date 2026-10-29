CREATE DATABASE IF NOT EXISTS kpu_db;

USE kpu_db;

SET FOREIGN_KEY_CHECKS = 0;


-- =========================================================
-- 1. MASTER BAGIAN / SUB-BAGIAN KPU
-- =========================================================

CREATE TABLE IF NOT EXISTS bagian (
    id_bagian INT AUTO_INCREMENT PRIMARY KEY,
    kode_bagian VARCHAR(20) NOT NULL UNIQUE,
    nama_bagian VARCHAR(150) NOT NULL
) ENGINE=InnoDB;


-- =========================================================
-- 2. MASTER PEGAWAI
-- =========================================================

CREATE TABLE IF NOT EXISTS pegawai (
    id_pegawai INT AUTO_INCREMENT PRIMARY KEY,
    id_bagian INT NULL,
    nama VARCHAR(150) NOT NULL,
    nip VARCHAR(30) NULL,
    jabatan VARCHAR(100) NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'pegawai',

    CONSTRAINT fk_pegawai_bagian
        FOREIGN KEY (id_bagian)
        REFERENCES bagian(id_bagian)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE=InnoDB;


-- =========================================================
-- 3. MASTER KODE KLASIFIKASI ARSIP
-- =========================================================

CREATE TABLE IF NOT EXISTS kode_klasifikasi_arsip (
    id_klasifikasi INT AUTO_INCREMENT PRIMARY KEY,
    kode_klasifikasi VARCHAR(50) NOT NULL UNIQUE,
    nama_klasifikasi VARCHAR(255) NOT NULL,
    kategori_utama VARCHAR(100) NOT NULL,
    deskripsi TEXT NULL,
    retensi_aktif_tahun INT NOT NULL DEFAULT 2,
    retensi_inaktif_tahun INT NOT NULL DEFAULT 5,
    hak_akses VARCHAR(50) NOT NULL DEFAULT 'Internal'
) ENGINE=InnoDB;


-- =========================================================
-- 4. MASTER JENIS SURAT
-- =========================================================

CREATE TABLE IF NOT EXISTS jenis_surat (
    id_jenis_surat INT AUTO_INCREMENT PRIMARY KEY,
    kode_jenis VARCHAR(20) NOT NULL UNIQUE,
    nama_jenis VARCHAR(100) NOT NULL,
    format_nomor VARCHAR(255) NOT NULL
) ENGINE=InnoDB;


-- =========================================================
-- 5. SEQUENCE PENOMORAN SURAT
-- =========================================================

CREATE TABLE IF NOT EXISTS penomoran_sequence (
    id_sequence INT AUTO_INCREMENT PRIMARY KEY,
    tahun INT NOT NULL,
    id_jenis_surat INT NOT NULL,
    id_bagian INT NULL,
    last_number INT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_seq_jenis
        FOREIGN KEY (id_jenis_surat)
        REFERENCES jenis_surat(id_jenis_surat)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_seq_bagian
        FOREIGN KEY (id_bagian)
        REFERENCES bagian(id_bagian)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT uq_seq_rule
        UNIQUE (tahun, id_jenis_surat, id_bagian)
) ENGINE=InnoDB;


-- =========================================================
-- 6. SURAT KELUAR
-- =========================================================

CREATE TABLE IF NOT EXISTS surat_keluar (
    id_surat_keluar INT AUTO_INCREMENT PRIMARY KEY,
    id_pegawai INT NOT NULL,
    id_bagian INT NOT NULL,
    id_klasifikasi INT NOT NULL,
    id_jenis_surat INT NOT NULL,

    nomor_surat VARCHAR(150) NULL UNIQUE,
    nomor_urut INT NULL,
    tahun INT NOT NULL,
    bulan_romawi VARCHAR(10) NOT NULL,

    sifat_surat VARCHAR(30) NOT NULL DEFAULT 'Biasa',
    lampiran VARCHAR(100) NULL DEFAULT '-',

    perihal TEXT NOT NULL,
    tujuan_surat TEXT NOT NULL,
    isi_surat LONGTEXT NULL,
    file_surat VARCHAR(255) NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'draft',

    tanggal_surat DATE NOT NULL,
    tanggal_terbit DATETIME NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_suratkeluar_pegawai
        FOREIGN KEY (id_pegawai)
        REFERENCES pegawai(id_pegawai)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_suratkeluar_bagian
        FOREIGN KEY (id_bagian)
        REFERENCES bagian(id_bagian)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_suratkeluar_klasifikasi
        FOREIGN KEY (id_klasifikasi)
        REFERENCES kode_klasifikasi_arsip(id_klasifikasi)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_suratkeluar_jenis
        FOREIGN KEY (id_jenis_surat)
        REFERENCES jenis_surat(id_jenis_surat)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE=InnoDB;


-- =========================================================
-- 7. SURAT TUGAS
-- =========================================================

CREATE TABLE IF NOT EXISTS surat_tugas (
    id_surat_tugas INT AUTO_INCREMENT PRIMARY KEY,
    id_surat_keluar INT NOT NULL UNIQUE,

    nomor_tugas VARCHAR(100) NOT NULL,
    maksud_tugas TEXT NOT NULL,
    tempat_tugas VARCHAR(255) NOT NULL,

    tanggal_mulai DATE NOT NULL,
    tanggal_selesai DATE NOT NULL,

    beban_anggaran VARCHAR(255)
        NULL DEFAULT 'DIPA KPU Provinsi Sulawesi Utara',

    CONSTRAINT fk_surattugas_suratkeluar
        FOREIGN KEY (id_surat_keluar)
        REFERENCES surat_keluar(id_surat_keluar)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB;


-- =========================================================
-- 8. PEGAWAI PELAKSANA SURAT TUGAS
-- =========================================================

CREATE TABLE IF NOT EXISTS surat_tugas_pelaksana (
    id_pelaksana INT AUTO_INCREMENT PRIMARY KEY,
    id_surat_tugas INT NOT NULL,
    id_pegawai INT NOT NULL,

    peran_tugas VARCHAR(100) NOT NULL DEFAULT 'Pelaksana',

    CONSTRAINT fk_pelaksana_surattugas
        FOREIGN KEY (id_surat_tugas)
        REFERENCES surat_tugas(id_surat_tugas)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_pelaksana_pegawai
        FOREIGN KEY (id_pegawai)
        REFERENCES pegawai(id_pegawai)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE=InnoDB;


-- =========================================================
-- 9. RIWAYAT STATUS / AUDIT TRAIL SURAT
-- =========================================================

CREATE TABLE IF NOT EXISTS riwayat_status_surat (
    id_riwayat INT AUTO_INCREMENT PRIMARY KEY,
    id_surat_keluar INT NOT NULL,
    id_pegawai INT NOT NULL,

    status_lama VARCHAR(30) NULL,
    status_baru VARCHAR(30) NOT NULL,

    catatan TEXT NULL,

    waktu DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_riwayat_suratkeluar
        FOREIGN KEY (id_surat_keluar)
        REFERENCES surat_keluar(id_surat_keluar)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_riwayat_pegawai
        FOREIGN KEY (id_pegawai)
        REFERENCES pegawai(id_pegawai)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE=InnoDB;


-- =========================================================
-- 10. DISPOSISI
-- =========================================================

CREATE TABLE IF NOT EXISTS disposisi (
    id_disposisi INT AUTO_INCREMENT PRIMARY KEY,
    id_surat_keluar INT NOT NULL,
    id_pegawai INT NOT NULL,

    instruksi TEXT NOT NULL,
    tanggal_disposisi DATE NOT NULL,

    CONSTRAINT fk_disposisi_suratkeluar
        FOREIGN KEY (id_surat_keluar)
        REFERENCES surat_keluar(id_surat_keluar)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_disposisi_pegawai
        FOREIGN KEY (id_pegawai)
        REFERENCES pegawai(id_pegawai)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE=InnoDB;


-- =========================================================
-- 11. DOKUMEN ARSIP
-- =========================================================
-- BAGIAN INI MENGGABUNGKAN:
-- - struktur Arsip dari Project Manager
-- - FILTERING yang Anda buat
-- =========================================================

CREATE TABLE IF NOT EXISTS dokumen_arsip (
    id_dokumen INT AUTO_INCREMENT PRIMARY KEY,

    -- Relasi dengan Surat Menyurat
    id_surat_keluar INT NULL,
    id_klasifikasi INT NOT NULL,

    -- Pemilik / pengunggah
    id_pegawai INT NOT NULL,

    -- Informasi dokumen
    nama_dokumen VARCHAR(255) NOT NULL,
    nomor_dokumen VARCHAR(150) NOT NULL,

    -- Field filtering Anda
    kategori VARCHAR(100) NOT NULL,
    event VARCHAR(150) NULL,
    tanggal_dokumen DATE NOT NULL,

    -- File
    file_path VARCHAR(255) NULL,
    ukuran_file BIGINT NULL DEFAULT 0,

    -- Hak akses
    hak_akses VARCHAR(50) NOT NULL DEFAULT 'internal',

    -- Soft delete
    status_hapus BOOLEAN NOT NULL DEFAULT FALSE,
    dihapus_oleh INT NULL,
    dihapus_pada DATETIME NULL,

    -- Timestamp
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    -- Relasi ke Surat Keluar
    CONSTRAINT fk_dokumen_suratkeluar
        FOREIGN KEY (id_surat_keluar)
        REFERENCES surat_keluar(id_surat_keluar)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    -- Relasi ke Klasifikasi Arsip
    CONSTRAINT fk_dokumen_klasifikasi
        FOREIGN KEY (id_klasifikasi)
        REFERENCES kode_klasifikasi_arsip(id_klasifikasi)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    -- Relasi ke Pegawai
    CONSTRAINT fk_dokumen_pegawai
        FOREIGN KEY (id_pegawai)
        REFERENCES pegawai(id_pegawai)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    -- Pegawai yang melakukan penghapusan
    CONSTRAINT fk_dokumen_pegawai_hapus
        FOREIGN KEY (dihapus_oleh)
        REFERENCES pegawai(id_pegawai)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    -- Index untuk filtering Arsip Anda
    INDEX ix_dokumen_arsip_nomor (nomor_dokumen),
    INDEX ix_dokumen_arsip_kategori (kategori),
    INDEX ix_dokumen_arsip_event (event),
    INDEX ix_dokumen_arsip_tanggal (tanggal_dokumen),
    INDEX ix_dokumen_arsip_hak_akses (hak_akses),
    INDEX ix_dokumen_arsip_status_hapus (status_hapus),

    -- Index integrasi Surat Menyurat
    INDEX ix_dokumen_arsip_surat_keluar (id_surat_keluar),
    INDEX ix_dokumen_arsip_klasifikasi (id_klasifikasi)

) ENGINE=InnoDB;


-- =========================================================
-- 12. TAHUN ANGGARAN
-- =========================================================

CREATE TABLE IF NOT EXISTS tahun_anggaran (
    id_tahun_anggaran INT AUTO_INCREMENT PRIMARY KEY,
    tahun INT NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    tanggal_mulai DATE NOT NULL,
    tanggal_selesai DATE NOT NULL,
    deskripsi VARCHAR(255) NULL,
    id_pegawai_pembuat INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_tahun_pegawai
        FOREIGN KEY (id_pegawai_pembuat)
        REFERENCES pegawai(id_pegawai)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE=InnoDB;


-- =========================================================
-- 13. MASTER AKUN ANGGARAN
-- =========================================================

CREATE TABLE IF NOT EXISTS akun_anggaran (
    id_akun_anggaran INT AUTO_INCREMENT PRIMARY KEY,
    id_bagian INT NOT NULL,

    kode_akun VARCHAR(50) NOT NULL UNIQUE,
    nama_akun VARCHAR(150) NOT NULL,

    -- Legacy field: Dipertahankan untuk integritas data existing
    total_pagu DECIMAL(18,2) NOT NULL DEFAULT 0,

    jenis_belanja VARCHAR(100) NULL,
    program VARCHAR(255) NULL,
    sub_program VARCHAR(255) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_akun_bagian
        FOREIGN KEY (id_bagian)
        REFERENCES bagian(id_bagian)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE=InnoDB;


-- =========================================================
-- 14. PAGU ANGGARAN (ALOKASI TAHUNAN)
-- =========================================================

CREATE TABLE IF NOT EXISTS pagu_anggaran (
    id_pagu INT AUTO_INCREMENT PRIMARY KEY,
    id_tahun_anggaran INT NOT NULL,
    id_akun_anggaran INT NOT NULL,

    pagu_awal DECIMAL(18,2) NOT NULL DEFAULT 0,
    pagu_aktif DECIMAL(18,2) NOT NULL DEFAULT 0,

    nomor_sk VARCHAR(100) NULL,
    tanggal_sk DATE NULL,
    keterangan TEXT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_pagu_tahun
        FOREIGN KEY (id_tahun_anggaran)
        REFERENCES tahun_anggaran(id_tahun_anggaran)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_pagu_akun
        FOREIGN KEY (id_akun_anggaran)
        REFERENCES akun_anggaran(id_akun_anggaran)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT uq_pagu_tahun_akun
        UNIQUE (id_tahun_anggaran, id_akun_anggaran)
) ENGINE=InnoDB;


-- =========================================================
-- 15. REVISI ANGGARAN (AUDIT TRAIL)
-- =========================================================

CREATE TABLE IF NOT EXISTS revisi_anggaran (
    id_revisi INT AUTO_INCREMENT PRIMARY KEY,
    id_pagu INT NOT NULL,
    id_pegawai INT NOT NULL,

    nomor_revisi VARCHAR(100) NOT NULL,
    tanggal_revisi DATE NOT NULL,
    pagu_sebelum DECIMAL(18,2) NOT NULL,
    pagu_sesudah DECIMAL(18,2) NOT NULL,
    alasan_revisi TEXT NOT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_revisi_pagu
        FOREIGN KEY (id_pagu)
        REFERENCES pagu_anggaran(id_pagu)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_revisi_pegawai
        FOREIGN KEY (id_pegawai)
        REFERENCES pegawai(id_pegawai)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE=InnoDB;


-- =========================================================
-- 16. TRANSAKSI REALISASI ANGGARAN
-- =========================================================

CREATE TABLE IF NOT EXISTS realisasi_anggaran (
    id_realisasi INT AUTO_INCREMENT PRIMARY KEY,

    -- Budget allocation relation (Nullable for legacy transactions)
    id_pagu INT NULL,

    -- Legacy master account relation preserved
    id_akun_anggaran INT NOT NULL,

    id_pegawai INT NULL,
    id_verifier INT NULL,

    tanggal_transaksi DATE NOT NULL,
    nomor_dokumen VARCHAR(100) NOT NULL,
    uraian_kegiatan TEXT NOT NULL,

    jumlah_realisasi DECIMAL(18,2) NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',

    periode VARCHAR(50) NULL,
    bukti_file_path VARCHAR(255) NULL,
    bukti_file_nama VARCHAR(255) NULL,
    bukti_file_ukuran BIGINT NULL,
    bukti_file_mime VARCHAR(100) NULL,

    catatan_verifikasi TEXT NULL,
    verified_at DATETIME NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_realisasi_pagu
        FOREIGN KEY (id_pagu)
        REFERENCES pagu_anggaran(id_pagu)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_realisasi_akun
        FOREIGN KEY (id_akun_anggaran)
        REFERENCES akun_anggaran(id_akun_anggaran)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_realisasi_pegawai
        FOREIGN KEY (id_pegawai)
        REFERENCES pegawai(id_pegawai)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_realisasi_verifier
        FOREIGN KEY (id_verifier)
        REFERENCES pegawai(id_pegawai)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    INDEX ix_realisasi_status (status),
    INDEX ix_realisasi_tanggal (tanggal_transaksi),
    INDEX ix_realisasi_pagu (id_pagu)
) ENGINE=InnoDB;


-- =========================================================
-- 13. CHAT SESSION
-- =========================================================

CREATE TABLE IF NOT EXISTS chat_session (
    id_sesi_chat INT AUTO_INCREMENT PRIMARY KEY,

    id_pegawai INT NOT NULL,

    dibuat_pada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_chat_session_pegawai
        FOREIGN KEY (id_pegawai)
        REFERENCES pegawai(id_pegawai)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB;


-- =========================================================
-- 14. CHAT MESSAGE
-- =========================================================

CREATE TABLE IF NOT EXISTS chat_message (
    id_pesan INT AUTO_INCREMENT PRIMARY KEY,

    id_sesi_chat INT NOT NULL,

    role VARCHAR(20) NOT NULL,
    teks LONGTEXT NULL,
    jenis_dokumen VARCHAR(50) NULL,
    lampiran_file VARCHAR(255) NULL,

    CONSTRAINT fk_chat_message_session
        FOREIGN KEY (id_sesi_chat)
        REFERENCES chat_session(id_sesi_chat)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB;


SET FOREIGN_KEY_CHECKS = 1;