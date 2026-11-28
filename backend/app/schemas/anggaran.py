from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field, model_validator, ConfigDict


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
    konfirmasi_tutup_tahun: Optional[int] = Field(
        None,
        description="Second confirmation: the number of the currently active year, required to close it automatically",
    )


class TahunAnggaranUpdate(BaseModel):
    tahun: Optional[int] = Field(None, ge=2000, le=2100)
    konfirmasi_tutup_tahun: Optional[int] = Field(
        None,
        description="Second confirmation: the number of the currently active year, required to close it automatically",
    )
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


class TahunAnggaranActivatePayload(BaseModel):
    alasan: Optional[str] = Field(None, max_length=500, description="Alasan pengaktifan tahun anggaran")


class AuditAktivasiTahunResponse(BaseModel):
    id_audit: int
    id_tahun_sebelum: Optional[int] = None
    tahun_sebelum: Optional[int] = None
    id_tahun_aktif: int
    tahun_aktif: int
    id_pegawai: Optional[int] = None
    nama_pegawai: Optional[str] = None
    alasan: Optional[str] = None
    waktu_aktivasi: datetime

    class Config:
        from_attributes = True


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
    pagu_blokir: Decimal = Field(Decimal("0.00"), ge=0, description="Nilai pagu diblokir (self-blocking / automatic adjustment)")
    rpd_triwulan_1: Decimal = Field(Decimal("0.00"), ge=0)
    rpd_triwulan_2: Decimal = Field(Decimal("0.00"), ge=0)
    rpd_triwulan_3: Decimal = Field(Decimal("0.00"), ge=0)
    rpd_triwulan_4: Decimal = Field(Decimal("0.00"), ge=0)


class PaguAnggaranUpdate(BaseModel):
    nomor_sk: Optional[str] = Field(None, max_length=100)
    tanggal_sk: Optional[date] = None
    keterangan: Optional[str] = None
    pagu_blokir: Optional[Decimal] = Field(None, ge=0)
    rpd_triwulan_1: Optional[Decimal] = Field(None, ge=0)
    rpd_triwulan_2: Optional[Decimal] = Field(None, ge=0)
    rpd_triwulan_3: Optional[Decimal] = Field(None, ge=0)
    rpd_triwulan_4: Optional[Decimal] = Field(None, ge=0)


class PaguAnggaranResponse(BaseModel):
    id_pagu: int
    id_tahun_anggaran: int
    id_akun_anggaran: int
    pagu_awal: Decimal
    pagu_aktif: Decimal
    pagu_blokir: Decimal = Decimal("0.00")
    pagu_efektif: Decimal = Decimal("0.00")
    rpd_triwulan_1: Decimal = Decimal("0.00")
    rpd_triwulan_2: Decimal = Decimal("0.00")
    rpd_triwulan_3: Decimal = Decimal("0.00")
    rpd_triwulan_4: Decimal = Decimal("0.00")
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
    jenis_revisi: str = Field("DIPA", pattern="^(DIPA|POK)$")


class RevisiPOKCreate(BaseModel):
    id_pagu_asal: int
    id_pagu_tujuan: int
    nominal_geser: Decimal = Field(..., gt=0, max_digits=18, decimal_places=2)
    nomor_revisi: str = Field(..., min_length=2, max_length=100)
    tanggal_revisi: date
    alasan_revisi: str = Field(..., min_length=5)


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
    jenis_revisi: str = "DIPA"
    batch_kode: Optional[str] = None
    nama_pegawai: Optional[str] = None
    kode_akun: Optional[str] = None
    nama_akun: Optional[str] = None
    nama_bagian: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class RevisiPOKResponse(BaseModel):
    batch_kode: str
    nominal_geser: Decimal
    asal: RevisiAnggaranResponse
    tujuan: RevisiAnggaranResponse


class RevisiAnggaranListResponse(BaseModel):
    total: int
    items: List[RevisiAnggaranResponse]


# =========================================================
# 5. REALISASI ANGGARAN SCHEMAS
# =========================================================

class RealisasiAnggaranCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    id_pagu: int = Field(..., description="ID Pagu Anggaran tahun berjalan")
    tanggal_transaksi: date
    nomor_dokumen: str = Field(..., min_length=1, max_length=100)
    uraian_kegiatan: str = Field(..., min_length=3)
    jumlah_realisasi: Decimal = Field(..., gt=0, max_digits=18, decimal_places=2, description="Nominal bruto transaksi belanja harus > 0")
    mekanisme_bayar: str = Field("LS", pattern="^(UP|TUP|GUP|LS)$")
    jenis_dokumen_bayar: str = Field("SP2D", pattern="^(SPBy|SPP|SPM|SP2D|Kuitansi|SSPB)$")
    nomor_sp2d: Optional[str] = Field(None, max_length=100)
    penerima_pembayaran: Optional[str] = Field(None, max_length=200)
    potongan_pajak: Decimal = Field(Decimal("0.00"), ge=0, max_digits=18, decimal_places=2)
    periode: Optional[str] = Field(None, max_length=50)
    bukti_file_path: Optional[str] = Field(None, max_length=255)
    bukti_file_nama: Optional[str] = Field(None, max_length=255)
    bukti_file_ukuran: Optional[int] = None
    bukti_file_mime: Optional[str] = Field(None, max_length=100)

    @model_validator(mode="after")
    def validate_pajak(self):
        if self.potongan_pajak >= self.jumlah_realisasi:
            raise ValueError("Potongan pajak harus lebih kecil dari nominal bruto realisasi")
        return self


# Backward compatibility alias
RealisasiAnggaranCreateDraft = RealisasiAnggaranCreate


class RealisasiAnggaranUpdateDraft(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    id_pagu: Optional[int] = None
    tanggal_transaksi: Optional[date] = None
    nomor_dokumen: Optional[str] = Field(None, min_length=1, max_length=100)
    uraian_kegiatan: Optional[str] = Field(None, min_length=3)
    jumlah_realisasi: Optional[Decimal] = Field(None, gt=0, max_digits=18, decimal_places=2)
    mekanisme_bayar: Optional[str] = Field(None, pattern="^(UP|TUP|GUP|LS)$")
    jenis_dokumen_bayar: Optional[str] = Field(None, pattern="^(SPBy|SPP|SPM|SP2D|Kuitansi|SSPB)$")
    nomor_sp2d: Optional[str] = Field(None, max_length=100)
    penerima_pembayaran: Optional[str] = Field(None, max_length=200)
    potongan_pajak: Optional[Decimal] = Field(None, ge=0, max_digits=18, decimal_places=2)
    periode: Optional[str] = Field(None, max_length=50)
    bukti_file_path: Optional[str] = Field(None, max_length=255)
    bukti_file_nama: Optional[str] = Field(None, max_length=255)
    bukti_file_ukuran: Optional[int] = None
    bukti_file_mime: Optional[str] = Field(None, max_length=100)


class RealisasiKoreksiCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    nomor_dokumen: str = Field(..., min_length=2, max_length=100, description="Nomor SSPB / dokumen koreksi")
    tanggal_transaksi: date
    nominal_koreksi: Decimal = Field(..., gt=0, max_digits=18, decimal_places=2, description="Nominal pengembalian belanja (positif)")
    alasan: str = Field(..., min_length=5, max_length=500)


class RealisasiAnggaranVerify(BaseModel):
    catatan_verifikasi: Optional[str] = Field(None, description="Catatan persetujuan verifikator")


class RealisasiAnggaranReject(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
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
    mekanisme_bayar: str = "LS"
    jenis_dokumen_bayar: str = "SP2D"
    nomor_sp2d: Optional[str] = None
    penerima_pembayaran: Optional[str] = None
    potongan_pajak: Decimal = Decimal("0.00")
    jumlah_netto: Decimal = Decimal("0.00")
    is_koreksi: bool = False
    koreksi_dari_id: Optional[int] = None
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
    pagu_blokir: Decimal = Decimal("0.00")
    pagu_efektif: Decimal = Decimal("0.00")
    total_realisasi_verified: Decimal
    sisa_anggaran: Decimal
    persentase_serapan: float


class MonthlyRealizationItem(BaseModel):
    bulan: int = Field(..., ge=1, le=12, description="Index bulan 1-12")
    nama_bulan: str = Field(..., description="Nama bulan Indonesia")
    total_realisasi_verified: Decimal = Decimal("0.00")
    persentase_serapan: float = 0.0
    total_transaksi_verified: int = 0


class DashboardSummaryResponse(BaseModel):
    id_tahun_anggaran: Optional[int] = None
    tahun: Optional[int] = None
    status_tahun: Optional[str] = None
    id_akun_anggaran: Optional[int] = None
    id_bagian: Optional[int] = None
    bulan: Optional[int] = None
    total_pagu_aktif: Decimal = Decimal("0.00")
    total_pagu_blokir: Decimal = Decimal("0.00")
    total_pagu_efektif: Decimal = Decimal("0.00")
    total_realisasi_verified: Decimal = Decimal("0.00")
    total_realisasi_tahun: Optional[Decimal] = None
    total_sisa_anggaran: Decimal = Decimal("0.00")
    persentase_serapan: float = 0.0
    total_transaksi_draft: int = 0
    total_transaksi_submitted: int = 0
    total_transaksi_verified: int = 0
    total_transaksi_rejected: int = 0
    monthly_recap: List[MonthlyRealizationItem] = Field(default_factory=list)


# =========================================================
# 7. MONTHLY REPORT MATRIX (STEP 10)
# =========================================================

class MonthlyReportRowItem(BaseModel):
    id_akun_anggaran: int
    kode_akun: str
    nama_akun: str
    nama_bagian: Optional[str] = None
    pagu: Decimal = Decimal("0.00")
    januari: Decimal = Decimal("0.00")
    februari: Decimal = Decimal("0.00")
    maret: Decimal = Decimal("0.00")
    april: Decimal = Decimal("0.00")
    mei: Decimal = Decimal("0.00")
    juni: Decimal = Decimal("0.00")
    juli: Decimal = Decimal("0.00")
    agustus: Decimal = Decimal("0.00")
    september: Decimal = Decimal("0.00")
    oktober: Decimal = Decimal("0.00")
    november: Decimal = Decimal("0.00")
    desember: Decimal = Decimal("0.00")
    total_realisasi: Decimal = Decimal("0.00")
    sisa_anggaran: Decimal = Decimal("0.00")
    persentase_realisasi: float = 0.0


class MonthlyReportTotal(BaseModel):
    pagu: Decimal = Decimal("0.00")
    januari: Decimal = Decimal("0.00")
    februari: Decimal = Decimal("0.00")
    maret: Decimal = Decimal("0.00")
    april: Decimal = Decimal("0.00")
    mei: Decimal = Decimal("0.00")
    juni: Decimal = Decimal("0.00")
    juli: Decimal = Decimal("0.00")
    agustus: Decimal = Decimal("0.00")
    september: Decimal = Decimal("0.00")
    oktober: Decimal = Decimal("0.00")
    november: Decimal = Decimal("0.00")
    desember: Decimal = Decimal("0.00")
    total_realisasi: Decimal = Decimal("0.00")
    sisa_anggaran: Decimal = Decimal("0.00")
    persentase_realisasi: float = 0.0


class MonthlyReportResponse(BaseModel):
    id_tahun_anggaran: Optional[int] = None
    tahun: Optional[int] = None
    status_tahun: Optional[str] = None
    rows: List[MonthlyReportRowItem] = Field(default_factory=list)
    total: MonthlyReportTotal = Field(default_factory=MonthlyReportTotal)
