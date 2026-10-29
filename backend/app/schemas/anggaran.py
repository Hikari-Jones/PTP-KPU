from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field, model_validator


# =========================================================
# 1. TAHUN ANGGARAN SCHEMAS
# =========================================================

class TahunAnggaranBase(BaseModel):
    tahun: int = Field(..., ge=2000, le=2100, description="Tahun anggaran (contoh: 2026)")
    status: str = Field("draft", pattern="^(draft|active|closed)$", description="Status tahun anggaran: draft, active, closed")
    tanggal_mulai: date
    tanggal_selesai: date
    deskripsi: Optional[str] = Field(None, max_length=255)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.tanggal_mulai >= self.tanggal_selesai:
            raise ValueError("tanggal_mulai harus sebelum tanggal_selesai")
        return self


class TahunAnggaranCreate(TahunAnggaranBase):
    id_pegawai_pembuat: Optional[int] = None


class TahunAnggaranUpdate(BaseModel):
    tahun: Optional[int] = Field(None, ge=2000, le=2100)
    status: Optional[str] = Field(None, pattern="^(draft|active|closed)$")
    tanggal_mulai: Optional[date] = None
    tanggal_selesai: Optional[date] = None
    deskripsi: Optional[str] = Field(None, max_length=255)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.tanggal_mulai and self.tanggal_selesai:
            if self.tanggal_mulai >= self.tanggal_selesai:
                raise ValueError("tanggal_mulai harus sebelum tanggal_selesai")
        return self


class TahunAnggaranResponse(TahunAnggaranBase):
    id_tahun_anggaran: int
    id_pegawai_pembuat: Optional[int] = None
    nama_pembuat: Optional[str] = None
    total_pagu: Decimal = Decimal("0.00")
    total_realisasi_verified: Decimal = Decimal("0.00")
    sisa_anggaran: Decimal = Decimal("0.00")
    persentase_serapan: float = 0.0
    jumlah_akun: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TahunAnggaranListResponse(BaseModel):
    total: int
    items: List[TahunAnggaranResponse]


# =========================================================
# 2. AKUN ANGGARAN SCHEMAS
# =========================================================

class AkunAnggaranBase(BaseModel):
    id_bagian: int = Field(..., description="ID Bagian / Divisi KPU")
    kode_akun: str = Field(..., max_length=50, description="Kode MAK / Akun Anggaran")
    nama_akun: str = Field(..., max_length=150, description="Nama uraian akun anggaran")
    jenis_belanja: Optional[str] = Field(None, max_length=100)
    program: Optional[str] = Field(None, max_length=255)
    sub_program: Optional[str] = Field(None, max_length=255)
    status: str = Field("active", pattern="^(active|inactive)$")


class AkunAnggaranCreate(AkunAnggaranBase):
    total_pagu: Optional[Decimal] = Field(Decimal("0.00"), ge=0, description="Legacy total pagu baseline")


class AkunAnggaranUpdate(BaseModel):
    id_bagian: Optional[int] = None
    kode_akun: Optional[str] = Field(None, max_length=50)
    nama_akun: Optional[str] = Field(None, max_length=150)
    jenis_belanja: Optional[str] = Field(None, max_length=100)
    program: Optional[str] = Field(None, max_length=255)
    sub_program: Optional[str] = Field(None, max_length=255)
    status: Optional[str] = Field(None, pattern="^(active|inactive)$")


class AkunAnggaranResponse(AkunAnggaranBase):
    id_akun_anggaran: int
    total_pagu: Decimal = Decimal("0.00")  # Legacy field preserved
    nama_bagian: Optional[str] = None
    kode_bagian: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AkunAnggaranListResponse(BaseModel):
    total: int
    items: List[AkunAnggaranResponse]


# =========================================================
# 3. PAGU ANGGARAN SCHEMAS
# =========================================================

class PaguAnggaranBase(BaseModel):
    id_tahun_anggaran: int
    id_akun_anggaran: int
    pagu_awal: Decimal = Field(..., ge=0, description="Pagu awal penetapan DIPA")
    nomor_sk: Optional[str] = Field(None, max_length=100)
    tanggal_sk: Optional[date] = None
    keterangan: Optional[str] = None


class PaguAnggaranCreate(PaguAnggaranBase):
    pagu_aktif: Optional[Decimal] = Field(None, ge=0, description="Default bernilai sama dengan pagu_awal jika None")


class PaguAnggaranUpdate(BaseModel):
    nomor_sk: Optional[str] = Field(None, max_length=100)
    tanggal_sk: Optional[date] = None
    keterangan: Optional[str] = None


class PaguAnggaranResponse(BaseModel):
    id_pagu: int
    id_tahun_anggaran: int
    id_akun_anggaran: int
    pagu_awal: Decimal
    pagu_aktif: Decimal
    nomor_sk: Optional[str] = None
    tanggal_sk: Optional[date] = None
    keterangan: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    # Calculated & related metadata populated by service
    tahun: Optional[int] = None
    kode_akun: Optional[str] = None
    nama_akun: Optional[str] = None
    nama_bagian: Optional[str] = None
    total_realisasi_verified: Decimal = Decimal("0.00")
    sisa_anggaran: Decimal = Decimal("0.00")
    persentase_serapan: float = 0.0

    class Config:
        from_attributes = True


class PaguAnggaranListResponse(BaseModel):
    total: int
    items: List[PaguAnggaranResponse]


# =========================================================
# 4. REVISI ANGGARAN SCHEMAS
# =========================================================

class RevisiAnggaranCreate(BaseModel):
    id_pagu: int
    nomor_revisi: str = Field(..., max_length=100, description="Nomor Surat/SK Revisi DIPA")
    tanggal_revisi: date
    pagu_baru: Decimal = Field(..., ge=0, description="Nilai pagu aktif yang baru setelah revisi")
    alasan_revisi: str = Field(..., min_length=5, description="Alasan pergeseran / penambahan anggaran")


class RevisiAnggaranResponse(BaseModel):
    id_revisi: int
    id_pagu: int
    id_pegawai: int
    nomor_revisi: str
    tanggal_revisi: date
    pagu_sebelum: Decimal
    pagu_sesudah: Decimal
    perubahan_netto: Decimal = Decimal("0.00")
    alasan_revisi: str
    nama_pegawai: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class RevisiAnggaranListResponse(BaseModel):
    total: int
    items: List[RevisiAnggaranResponse]


# =========================================================
# 5. REALISASI ANGGARAN SCHEMAS
# =========================================================

class RealisasiAnggaranCreateDraft(BaseModel):
    id_pagu: int = Field(..., description="ID Pagu Anggaran tahun berjalan")
    tanggal_transaksi: date
    nomor_dokumen: str = Field(..., max_length=100)
    uraian_kegiatan: str = Field(..., min_length=3)
    jumlah_realisasi: Decimal = Field(..., gt=0, description="Nominal transaksi belanja harus > 0")
    periode: Optional[str] = Field(None, max_length=50)
    bukti_file_path: Optional[str] = Field(None, max_length=255)
    bukti_file_nama: Optional[str] = Field(None, max_length=255)
    bukti_file_ukuran: Optional[int] = None
    bukti_file_mime: Optional[str] = Field(None, max_length=100)


class RealisasiAnggaranUpdateDraft(BaseModel):
    tanggal_transaksi: Optional[date] = None
    nomor_dokumen: Optional[str] = Field(None, max_length=100)
    uraian_kegiatan: Optional[str] = Field(None, min_length=3)
    jumlah_realisasi: Optional[Decimal] = Field(None, gt=0)
    periode: Optional[str] = Field(None, max_length=50)
    bukti_file_path: Optional[str] = Field(None, max_length=255)
    bukti_file_nama: Optional[str] = Field(None, max_length=255)
    bukti_file_ukuran: Optional[int] = None
    bukti_file_mime: Optional[str] = Field(None, max_length=100)


class RealisasiAnggaranVerify(BaseModel):
    catatan_verifikasi: Optional[str] = Field(None, description="Catatan persetujuan verifikator")


class RealisasiAnggaranReject(BaseModel):
    catatan_verifikasi: str = Field(..., min_length=3, description="Alasan penolakan transaksi wajib diisi")


class RealisasiAnggaranResponse(BaseModel):
    id_realisasi: int
    id_pagu: Optional[int] = None  # None for legacy transactions
    id_akun_anggaran: int
    id_pegawai: Optional[int] = None
    id_verifier: Optional[int] = None
    tanggal_transaksi: date
    nomor_dokumen: str
    uraian_kegiatan: str
    jumlah_realisasi: Decimal
    status: str  # 'draft', 'submitted', 'verified', 'rejected'
    periode: Optional[str] = None
    bukti_file_path: Optional[str] = None
    bukti_file_nama: Optional[str] = None
    bukti_file_ukuran: Optional[int] = None
    bukti_file_mime: Optional[str] = None
    catatan_verifikasi: Optional[str] = None
    verified_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    # Calculated context fields from database joins
    tahun: Optional[int] = None
    kode_akun: Optional[str] = None
    nama_akun: Optional[str] = None
    nama_bagian: Optional[str] = None
    nama_operator: Optional[str] = None
    nama_verifier: Optional[str] = None
    pagu_aktif: Optional[Decimal] = None
    sisa_anggaran: Optional[Decimal] = None
    persentase_serapan: Optional[float] = None

    class Config:
        from_attributes = True


class RealisasiAnggaranListResponse(BaseModel):
    total: int
    items: List[RealisasiAnggaranResponse]


# =========================================================
# 6. REUSABLE BUDGET SUMMARY
# =========================================================

class BudgetSummaryResponse(BaseModel):
    id_pagu: int
    id_tahun_anggaran: int
    tahun: int
    id_akun_anggaran: int
    kode_akun: str
    nama_akun: str
    nama_bagian: str
    pagu_awal: Decimal
    pagu_aktif: Decimal
    total_realisasi_verified: Decimal
    sisa_anggaran: Decimal
    persentase_serapan: float


class DashboardSummaryResponse(BaseModel):
    id_tahun_anggaran: Optional[int] = None
    tahun: Optional[int] = None
    status_tahun: Optional[str] = None
    total_pagu_aktif: Decimal = Decimal("0.00")
    total_realisasi_verified: Decimal = Decimal("0.00")
    total_sisa_anggaran: Decimal = Decimal("0.00")
    persentase_serapan: float = 0.0
    total_transaksi_draft: int = 0
    total_transaksi_submitted: int = 0
    total_transaksi_verified: int = 0
    total_transaksi_rejected: int = 0

