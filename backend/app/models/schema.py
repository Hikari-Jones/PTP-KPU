from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List

from sqlalchemy import (
    String,
    Integer,
    Date,
    Text,
    ForeignKey,
    DateTime,
    DECIMAL,
    Boolean,
    BigInteger,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.mysql import LONGTEXT

from app.core.database import Base


# =========================================================
# 1. BAGIAN
# =========================================================

class Bagian(Base):
    __tablename__ = "bagian"

    id_bagian: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    kode_bagian: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        unique=True,
    )

    nama_bagian: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    # Relationships
    pegawai: Mapped[List["Pegawai"]] = relationship(
        "Pegawai",
        back_populates="bagian",
    )

    akun_anggaran: Mapped[List["AkunAnggaran"]] = relationship(
        "AkunAnggaran",
        back_populates="bagian",
    )

    penomoran_sequence: Mapped[List["PenomoranSequence"]] = relationship(
        "PenomoranSequence",
        back_populates="bagian",
    )

    surat_keluar: Mapped[List["SuratKeluar"]] = relationship(
        "SuratKeluar",
        back_populates="bagian",
    )


# =========================================================
# 2. PEGAWAI
# =========================================================

class Pegawai(Base):
    __tablename__ = "pegawai"

    id_pegawai: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    id_bagian: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "bagian.id_bagian",
            onupdate="CASCADE",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    nama: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    nip: Mapped[Optional[str]] = mapped_column(
        String(30),
        nullable=True,
    )

    jabatan: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )

    password: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    role: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="pegawai",
        server_default="pegawai",
    )

    # Relationships
    bagian: Mapped[Optional["Bagian"]] = relationship(
        "Bagian",
        back_populates="pegawai",
    )

    surat_keluar: Mapped[List["SuratKeluar"]] = relationship(
        "SuratKeluar",
        foreign_keys="SuratKeluar.id_pegawai",
        back_populates="pegawai",
    )

    surat_tugas_pelaksana: Mapped[List["SuratTugasPelaksana"]] = relationship(
        "SuratTugasPelaksana",
        back_populates="pegawai",
    )

    riwayat_status_surat: Mapped[List["RiwayatStatusSurat"]] = relationship(
        "RiwayatStatusSurat",
        back_populates="pegawai",
    )

    disposisi: Mapped[List["Disposisi"]] = relationship(
        "Disposisi",
        back_populates="pegawai",
    )

    dokumen_arsip: Mapped[List["DokumenArsip"]] = relationship(
        "DokumenArsip",
        foreign_keys="DokumenArsip.id_pegawai",
        back_populates="pegawai",
    )

    dokumen_dihapus: Mapped[List["DokumenArsip"]] = relationship(
        "DokumenArsip",
        foreign_keys="DokumenArsip.dihapus_oleh",
        back_populates="penghapus",
    )

    chat_session: Mapped[List["ChatSession"]] = relationship(
        "ChatSession",
        back_populates="pegawai",
    )

    tahun_anggaran_dibuat: Mapped[List["TahunAnggaran"]] = relationship(
        "TahunAnggaran",
        foreign_keys="TahunAnggaran.id_pegawai_pembuat",
        back_populates="pembuat",
    )

    revisi_anggaran_dibuat: Mapped[List["RevisiAnggaran"]] = relationship(
        "RevisiAnggaran",
        foreign_keys="RevisiAnggaran.id_pegawai",
        back_populates="pegawai",
    )

    realisasi_dibuat: Mapped[List["RealisasiAnggaran"]] = relationship(
        "RealisasiAnggaran",
        foreign_keys="RealisasiAnggaran.id_pegawai",
        back_populates="operator",
    )

    realisasi_diverifikasi: Mapped[List["RealisasiAnggaran"]] = relationship(
        "RealisasiAnggaran",
        foreign_keys="RealisasiAnggaran.id_verifier",
        back_populates="verifier",
    )


# =========================================================
# 3. KODE KLASIFIKASI ARSIP
# =========================================================

class KodeKlasifikasiArsip(Base):
    __tablename__ = "kode_klasifikasi_arsip"

    id_klasifikasi: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    kode_klasifikasi: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        unique=True,
    )

    nama_klasifikasi: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    kategori_utama: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    deskripsi: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    retensi_aktif_tahun: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=2,
        server_default="2",
    )

    retensi_inaktif_tahun: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=5,
        server_default="5",
    )

    hak_akses: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="Internal",
        server_default="Internal",
    )

    # Relationships
    surat_keluar: Mapped[List["SuratKeluar"]] = relationship(
        "SuratKeluar",
        back_populates="klasifikasi",
    )

    dokumen_arsip: Mapped[List["DokumenArsip"]] = relationship(
        "DokumenArsip",
        back_populates="klasifikasi",
    )


# =========================================================
# 4. JENIS SURAT
# =========================================================

class JenisSurat(Base):
    __tablename__ = "jenis_surat"

    id_jenis_surat: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    kode_jenis: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        unique=True,
    )

    nama_jenis: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    format_nomor: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    # Relationships
    penomoran_sequence: Mapped[List["PenomoranSequence"]] = relationship(
        "PenomoranSequence",
        back_populates="jenis_surat",
    )

    surat_keluar: Mapped[List["SuratKeluar"]] = relationship(
        "SuratKeluar",
        back_populates="jenis_surat",
    )


# =========================================================
# 5. PENOMORAN SEQUENCE
# =========================================================

class PenomoranSequence(Base):
    __tablename__ = "penomoran_sequence"

    id_sequence: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    tahun: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    id_jenis_surat: Mapped[int] = mapped_column(
        ForeignKey(
            "jenis_surat.id_jenis_surat",
            onupdate="CASCADE",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    id_bagian: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "bagian.id_bagian",
            onupdate="CASCADE",
            ondelete="CASCADE",
        ),
        nullable=True,
    )

    last_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )

    __table_args__ = (
        UniqueConstraint(
            "tahun",
            "id_jenis_surat",
            "id_bagian",
            name="uq_seq_rule",
        ),
    )

    # Relationships
    jenis_surat: Mapped["JenisSurat"] = relationship(
        "JenisSurat",
        back_populates="penomoran_sequence",
    )

    bagian: Mapped[Optional["Bagian"]] = relationship(
        "Bagian",
        back_populates="penomoran_sequence",
    )


# =========================================================
# 6. SURAT KELUAR
# =========================================================

class SuratKeluar(Base):
    __tablename__ = "surat_keluar"

    id_surat_keluar: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    id_pegawai: Mapped[int] = mapped_column(
        ForeignKey(
            "pegawai.id_pegawai",
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    id_bagian: Mapped[int] = mapped_column(
        ForeignKey(
            "bagian.id_bagian",
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    id_klasifikasi: Mapped[int] = mapped_column(
        ForeignKey(
            "kode_klasifikasi_arsip.id_klasifikasi",
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    id_jenis_surat: Mapped[int] = mapped_column(
        ForeignKey(
            "jenis_surat.id_jenis_surat",
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    nomor_surat: Mapped[Optional[str]] = mapped_column(
        String(150),
        nullable=True,
        unique=True,
    )

    nomor_urut: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
    )

    tahun: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    bulan_romawi: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )

    sifat_surat: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="Biasa",
        server_default="Biasa",
    )

    lampiran: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        default="-",
        server_default="-",
    )

    perihal: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    tujuan_surat: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    isi_surat: Mapped[Optional[str]] = mapped_column(
        LONGTEXT,
        nullable=True,
    )

    file_surat: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="draft",
        server_default="draft",
    )

    tanggal_surat: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )

    tanggal_terbit: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )

    # Relationships
    pegawai: Mapped["Pegawai"] = relationship(
        "Pegawai",
        foreign_keys=[id_pegawai],
        back_populates="surat_keluar",
    )

    bagian: Mapped["Bagian"] = relationship(
        "Bagian",
        back_populates="surat_keluar",
    )

    klasifikasi: Mapped["KodeKlasifikasiArsip"] = relationship(
        "KodeKlasifikasiArsip",
        back_populates="surat_keluar",
    )

    jenis_surat: Mapped["JenisSurat"] = relationship(
        "JenisSurat",
        back_populates="surat_keluar",
    )

    surat_tugas: Mapped[Optional["SuratTugas"]] = relationship(
        "SuratTugas",
        back_populates="surat_keluar",
        uselist=False,
        cascade="all, delete-orphan",
    )

    riwayat_status: Mapped[List["RiwayatStatusSurat"]] = relationship(
        "RiwayatStatusSurat",
        back_populates="surat_keluar",
        cascade="all, delete-orphan",
    )

    disposisi: Mapped[List["Disposisi"]] = relationship(
        "Disposisi",
        back_populates="surat_keluar",
        cascade="all, delete-orphan",
    )

    dokumen_arsip: Mapped[List["DokumenArsip"]] = relationship(
        "DokumenArsip",
        back_populates="surat_keluar",
    )


# =========================================================
# 7. SURAT TUGAS
# =========================================================

class SuratTugas(Base):
    __tablename__ = "surat_tugas"

    id_surat_tugas: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    id_surat_keluar: Mapped[int] = mapped_column(
        ForeignKey(
            "surat_keluar.id_surat_keluar",
            onupdate="CASCADE",
            ondelete="CASCADE",
        ),
        nullable=False,
        unique=True,
    )

    nomor_tugas: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    maksud_tugas: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    tempat_tugas: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    tanggal_mulai: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )

    tanggal_selesai: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )

    beban_anggaran: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
        default="DIPA KPU Provinsi Sulawesi Utara",
        server_default="DIPA KPU Provinsi Sulawesi Utara",
    )

    # Relationships
    surat_keluar: Mapped["SuratKeluar"] = relationship(
        "SuratKeluar",
        back_populates="surat_tugas",
    )

    pelaksana: Mapped[List["SuratTugasPelaksana"]] = relationship(
        "SuratTugasPelaksana",
        back_populates="surat_tugas",
        cascade="all, delete-orphan",
    )


# =========================================================
# 8. SURAT TUGAS PELAKSANA
# =========================================================

class SuratTugasPelaksana(Base):
    __tablename__ = "surat_tugas_pelaksana"

    id_pelaksana: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    id_surat_tugas: Mapped[int] = mapped_column(
        ForeignKey(
            "surat_tugas.id_surat_tugas",
            onupdate="CASCADE",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    id_pegawai: Mapped[int] = mapped_column(
        ForeignKey(
            "pegawai.id_pegawai",
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    peran_tugas: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="Pelaksana",
        server_default="Pelaksana",
    )

    # Relationships
    surat_tugas: Mapped["SuratTugas"] = relationship(
        "SuratTugas",
        back_populates="pelaksana",
    )

    pegawai: Mapped["Pegawai"] = relationship(
        "Pegawai",
        back_populates="surat_tugas_pelaksana",
    )


# =========================================================
# 9. RIWAYAT STATUS SURAT
# =========================================================

class RiwayatStatusSurat(Base):
    __tablename__ = "riwayat_status_surat"

    id_riwayat: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    id_surat_keluar: Mapped[int] = mapped_column(
        ForeignKey(
            "surat_keluar.id_surat_keluar",
            onupdate="CASCADE",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    id_pegawai: Mapped[int] = mapped_column(
        ForeignKey(
            "pegawai.id_pegawai",
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    status_lama: Mapped[Optional[str]] = mapped_column(
        String(30),
        nullable=True,
    )

    status_baru: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    catatan: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    waktu: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )

    # Relationships
    surat_keluar: Mapped["SuratKeluar"] = relationship(
        "SuratKeluar",
        back_populates="riwayat_status",
    )

    pegawai: Mapped["Pegawai"] = relationship(
        "Pegawai",
        back_populates="riwayat_status_surat",
    )


# =========================================================
# 10. DISPOSISI
# =========================================================

class Disposisi(Base):
    __tablename__ = "disposisi"

    id_disposisi: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    id_surat_keluar: Mapped[int] = mapped_column(
        ForeignKey(
            "surat_keluar.id_surat_keluar",
            onupdate="CASCADE",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    id_pegawai: Mapped[int] = mapped_column(
        ForeignKey(
            "pegawai.id_pegawai",
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    instruksi: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    tanggal_disposisi: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )

    # Relationships
    surat_keluar: Mapped["SuratKeluar"] = relationship(
        "SuratKeluar",
        back_populates="disposisi",
    )

    pegawai: Mapped["Pegawai"] = relationship(
        "Pegawai",
        back_populates="disposisi",
    )


# =========================================================
# 11. DOKUMEN ARSIP
# =========================================================

class DokumenArsip(Base):
    __tablename__ = "dokumen_arsip"

    id_dokumen: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # Relasi dengan Surat Keluar
    id_surat_keluar: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "surat_keluar.id_surat_keluar",
            onupdate="CASCADE",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    # Relasi dengan Klasifikasi Arsip
    id_klasifikasi: Mapped[int] = mapped_column(
        ForeignKey(
            "kode_klasifikasi_arsip.id_klasifikasi",
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    # Pemilik / Pengunggah
    id_pegawai: Mapped[int] = mapped_column(
        ForeignKey(
            "pegawai.id_pegawai",
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    # Informasi dokumen
    nama_dokumen: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    nomor_dokumen: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
        index=True,
    )

    # Filtering
    kategori: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    event: Mapped[Optional[str]] = mapped_column(
        String(150),
        nullable=True,
        index=True,
    )

    tanggal_dokumen: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        index=True,
    )

    # File
    file_path: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    ukuran_file: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        nullable=True,
        default=0,
    )

    # Hak akses
    hak_akses: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="internal",
        server_default="internal",
        index=True,
    )

    # Soft delete
    status_hapus: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="0",
        index=True,
    )

    dihapus_oleh: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "pegawai.id_pegawai",
            onupdate="CASCADE",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    dihapus_pada: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
    )

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )

    # Relationships
    surat_keluar: Mapped[Optional["SuratKeluar"]] = relationship(
        "SuratKeluar",
        back_populates="dokumen_arsip",
    )

    klasifikasi: Mapped["KodeKlasifikasiArsip"] = relationship(
        "KodeKlasifikasiArsip",
        back_populates="dokumen_arsip",
    )

    pegawai: Mapped["Pegawai"] = relationship(
        "Pegawai",
        foreign_keys=[id_pegawai],
        back_populates="dokumen_arsip",
    )

    penghapus: Mapped[Optional["Pegawai"]] = relationship(
        "Pegawai",
        foreign_keys=[dihapus_oleh],
        back_populates="dokumen_dihapus",
    )

    # =====================================================
    # Helper Properties
    # =====================================================

    @property
    def nama_pengunggah(self) -> Optional[str]:
        return self.pegawai.nama if self.pegawai else None

    @property
    def nama_penghapus(self) -> Optional[str]:
        return self.penghapus.nama if self.penghapus else None

    @property
    def nama_bagian(self) -> Optional[str]:
        if self.pegawai and self.pegawai.bagian:
            return self.pegawai.bagian.nama_bagian

        return None


# =========================================================
# 12. TAHUN ANGGARAN
# =========================================================

class TahunAnggaran(Base):
    __tablename__ = "tahun_anggaran"

    id_tahun_anggaran: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    tahun: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        unique=True,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="draft",
        server_default="draft",
    )

    tanggal_mulai: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )

    tanggal_selesai: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )

    deskripsi: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    id_pegawai_pembuat: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "pegawai.id_pegawai",
            onupdate="CASCADE",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )

    # Relationships
    pembuat: Mapped[Optional["Pegawai"]] = relationship(
        "Pegawai",
        foreign_keys=[id_pegawai_pembuat],
        back_populates="tahun_anggaran_dibuat",
    )

    pagu_anggaran: Mapped[List["PaguAnggaran"]] = relationship(
        "PaguAnggaran",
        back_populates="tahun_anggaran",
        cascade="all, delete-orphan",
    )


# =========================================================
# 13. AKUN ANGGARAN
# =========================================================

class AkunAnggaran(Base):
    __tablename__ = "akun_anggaran"

    id_akun_anggaran: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    id_bagian: Mapped[int] = mapped_column(
        ForeignKey(
            "bagian.id_bagian",
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    kode_akun: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        unique=True,
    )

    nama_akun: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    # Legacy field - Preserved for existing data integrity
    total_pagu: Mapped[Decimal] = mapped_column(
        DECIMAL(18, 2),
        nullable=False,
        default=0,
        server_default="0",
    )

    jenis_belanja: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )

    program: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    sub_program: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        server_default="active",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )

    # Relationships
    bagian: Mapped["Bagian"] = relationship(
        "Bagian",
        back_populates="akun_anggaran",
    )

    pagu_anggaran: Mapped[List["PaguAnggaran"]] = relationship(
        "PaguAnggaran",
        back_populates="akun_anggaran",
        cascade="all, delete-orphan",
    )

    realisasi_anggaran: Mapped[List["RealisasiAnggaran"]] = relationship(
        "RealisasiAnggaran",
        foreign_keys="RealisasiAnggaran.id_akun_anggaran",
        back_populates="akun_anggaran",
    )


# =========================================================
# 14. PAGU ANGGARAN
# =========================================================

class PaguAnggaran(Base):
    __tablename__ = "pagu_anggaran"
    __table_args__ = (
        UniqueConstraint("id_tahun_anggaran", "id_akun_anggaran", name="uq_pagu_tahun_akun"),
    )

    id_pagu: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    id_tahun_anggaran: Mapped[int] = mapped_column(
        ForeignKey(
            "tahun_anggaran.id_tahun_anggaran",
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    id_akun_anggaran: Mapped[int] = mapped_column(
        ForeignKey(
            "akun_anggaran.id_akun_anggaran",
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    pagu_awal: Mapped[Decimal] = mapped_column(
        DECIMAL(18, 2),
        nullable=False,
        default=0,
        server_default="0",
    )

    pagu_aktif: Mapped[Decimal] = mapped_column(
        DECIMAL(18, 2),
        nullable=False,
        default=0,
        server_default="0",
    )

    nomor_sk: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )

    tanggal_sk: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
    )

    keterangan: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )

    # Relationships
    tahun_anggaran: Mapped["TahunAnggaran"] = relationship(
        "TahunAnggaran",
        back_populates="pagu_anggaran",
    )

    akun_anggaran: Mapped["AkunAnggaran"] = relationship(
        "AkunAnggaran",
        back_populates="pagu_anggaran",
    )

    revisi_anggaran: Mapped[List["RevisiAnggaran"]] = relationship(
        "RevisiAnggaran",
        back_populates="pagu_anggaran",
    )

    realisasi_anggaran: Mapped[List["RealisasiAnggaran"]] = relationship(
        "RealisasiAnggaran",
        foreign_keys="RealisasiAnggaran.id_pagu",
        back_populates="pagu_anggaran",
    )


# =========================================================
# 15. REVISI ANGGARAN
# =========================================================

class RevisiAnggaran(Base):
    __tablename__ = "revisi_anggaran"

    id_revisi: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    id_pagu: Mapped[int] = mapped_column(
        ForeignKey(
            "pagu_anggaran.id_pagu",
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    id_pegawai: Mapped[int] = mapped_column(
        ForeignKey(
            "pegawai.id_pegawai",
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    nomor_revisi: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    tanggal_revisi: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )

    pagu_sebelum: Mapped[Decimal] = mapped_column(
        DECIMAL(18, 2),
        nullable=False,
    )

    pagu_sesudah: Mapped[Decimal] = mapped_column(
        DECIMAL(18, 2),
        nullable=False,
    )

    alasan_revisi: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )

    # Relationships
    pagu_anggaran: Mapped["PaguAnggaran"] = relationship(
        "PaguAnggaran",
        back_populates="revisi_anggaran",
    )

    pegawai: Mapped["Pegawai"] = relationship(
        "Pegawai",
        foreign_keys=[id_pegawai],
        back_populates="revisi_anggaran_dibuat",
    )


# =========================================================
# 16. REALISASI ANGGARAN
# =========================================================

class RealisasiAnggaran(Base):
    __tablename__ = "realisasi_anggaran"

    id_realisasi: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # New budget relationship (Nullable for legacy transactions)
    id_pagu: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "pagu_anggaran.id_pagu",
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        nullable=True,
    )

    # Legacy account relationship preserved
    id_akun_anggaran: Mapped[int] = mapped_column(
        ForeignKey(
            "akun_anggaran.id_akun_anggaran",
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )

    # Operator who recorded the transaction (Nullable for legacy rows)
    id_pegawai: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "pegawai.id_pegawai",
            onupdate="CASCADE",
            ondelete="RESTRICT",
        ),
        nullable=True,
    )

    # Verifier who approved/rejected the transaction
    id_verifier: Mapped[Optional[int]] = mapped_column(
        ForeignKey(
            "pegawai.id_pegawai",
            onupdate="CASCADE",
            ondelete="SET NULL",
        ),
        nullable=True,
    )

    tanggal_transaksi: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )

    nomor_dokumen: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    uraian_kegiatan: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    jumlah_realisasi: Mapped[Decimal] = mapped_column(
        DECIMAL(18, 2),
        nullable=False,
        default=0,
        server_default="0",
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="draft",
        server_default="draft",
    )

    periode: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )

    bukti_file_path: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    bukti_file_nama: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    bukti_file_ukuran: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        nullable=True,
    )

    bukti_file_mime: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )

    catatan_verifikasi: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    verified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )

    # Relationships
    pagu_anggaran: Mapped[Optional["PaguAnggaran"]] = relationship(
        "PaguAnggaran",
        foreign_keys=[id_pagu],
        back_populates="realisasi_anggaran",
    )

    akun_anggaran: Mapped["AkunAnggaran"] = relationship(
        "AkunAnggaran",
        foreign_keys=[id_akun_anggaran],
        back_populates="realisasi_anggaran",
    )

    operator: Mapped[Optional["Pegawai"]] = relationship(
        "Pegawai",
        foreign_keys=[id_pegawai],
        back_populates="realisasi_dibuat",
    )

    verifier: Mapped[Optional["Pegawai"]] = relationship(
        "Pegawai",
        foreign_keys=[id_verifier],
        back_populates="realisasi_diverifikasi",
    )


# =========================================================
# 14. CHAT SESSION
# =========================================================

class ChatSession(Base):
    __tablename__ = "chat_session"

    id_sesi_chat: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    id_pegawai: Mapped[int] = mapped_column(
        ForeignKey(
            "pegawai.id_pegawai",
            onupdate="CASCADE",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    dibuat_pada: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )

    # Relationships
    pegawai: Mapped["Pegawai"] = relationship(
        "Pegawai",
        back_populates="chat_session",
    )

    messages: Mapped[List["ChatMessage"]] = relationship(
        "ChatMessage",
        back_populates="session",
        cascade="all, delete-orphan",
    )


# =========================================================
# 15. CHAT MESSAGE
# =========================================================

class ChatMessage(Base):
    __tablename__ = "chat_message"

    id_pesan: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    id_sesi_chat: Mapped[int] = mapped_column(
        ForeignKey(
            "chat_session.id_sesi_chat",
            onupdate="CASCADE",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    teks: Mapped[Optional[str]] = mapped_column(
        LONGTEXT,
        nullable=True,
    )

    jenis_dokumen: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )

    lampiran_file: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    # Relationships
    session: Mapped["ChatSession"] = relationship(
        "ChatSession",
        back_populates="messages",
    )