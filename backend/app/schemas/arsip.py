from datetime import date, datetime
from typing import Any, Dict, List, Optional, Literal
from pydantic import BaseModel, Field, field_validator

HAK_AKSES_LITERAL = Literal["biasa", "publik", "internal", "terbatas", "rahasia", "sangat_rahasia"]
STATUS_RETENSI_LITERAL = Literal["aktif", "inaktif", "siap_susut", "disusutkan"]
NASIB_AKHIR_LITERAL = Literal["musnah", "permanen", "dinilai_kembali"]


def _normalize_hak_akses(v):
    if v is None:
        return None
    if isinstance(v, str):
        return v.strip().lower().replace(" ", "_")
    return v


class DokumenArsipBase(BaseModel):
    nama_dokumen: str = Field(..., max_length=255)
    nomor_dokumen: str = Field(..., max_length=150)
    id_pegawai: int
    id_klasifikasi: Optional[int] = None
    kategori: str = Field(..., max_length=100)
    event: Optional[str] = Field(None, max_length=150)
    tanggal_dokumen: date
    file_path: Optional[str] = Field(None, max_length=255)
    ukuran_file: Optional[int] = Field(0, ge=0)
    hak_akses: HAK_AKSES_LITERAL = "internal"
    # JRA & Tata Kelola Fisik/Digital (PKPU 17/2023)
    nasib_akhir: Optional[NASIB_AKHIR_LITERAL] = None
    arsip_vital: bool = False
    legal_hold: bool = False
    legal_hold_alasan: Optional[str] = Field(None, max_length=255)
    lokasi_fisik: Optional[str] = Field(None, max_length=150)
    nomor_berkas: Optional[str] = Field(None, max_length=80)

    @field_validator("hak_akses", mode="before")
    @classmethod
    def normalize_hak_akses(cls, v):
        return _normalize_hak_akses(v)


class DokumenArsipCreate(DokumenArsipBase):
    pass


class DokumenArsipUpdate(BaseModel):
    nama_dokumen: Optional[str] = Field(None, max_length=255)
    nomor_dokumen: Optional[str] = Field(None, max_length=150)
    id_pegawai: Optional[int] = None
    id_klasifikasi: Optional[int] = None
    kategori: Optional[str] = Field(None, max_length=100)
    event: Optional[str] = Field(None, max_length=150)
    tanggal_dokumen: Optional[date] = None
    file_path: Optional[str] = Field(None, max_length=255)
    ukuran_file: Optional[int] = Field(None, ge=0)
    hak_akses: Optional[HAK_AKSES_LITERAL] = None
    status_hapus: Optional[bool] = None
    nasib_akhir: Optional[NASIB_AKHIR_LITERAL] = None
    arsip_vital: Optional[bool] = None
    legal_hold: Optional[bool] = None
    legal_hold_alasan: Optional[str] = Field(None, max_length=255)
    lokasi_fisik: Optional[str] = Field(None, max_length=150)
    nomor_berkas: Optional[str] = Field(None, max_length=80)

    @field_validator("hak_akses", mode="before")
    @classmethod
    def normalize_hak_akses(cls, v):
        return _normalize_hak_akses(v)


class DokumenArsipResponse(DokumenArsipBase):
    id_dokumen: int
    status_hapus: bool
    dihapus_oleh: Optional[int] = None
    dihapus_pada: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    # Populated from relationships
    nama_pengunggah: Optional[str] = None
    nama_penghapus: Optional[str] = None
    nama_bagian: Optional[str] = None
    kode_klasifikasi: Optional[str] = None
    nama_klasifikasi: Optional[str] = None

    # JRA & Fixity & Versioning
    status_retensi: str = "aktif"
    tanggal_retensi_aktif: Optional[date] = None
    tanggal_retensi_inaktif: Optional[date] = None
    sha256_hash: Optional[str] = None
    versi_dokumen: int = 1
    parent_dokumen_id: Optional[int] = None

    # Asal dokumen (arsip/surat/realisasi) dan sub-kategorinya
    sumber_modul: str = "arsip"
    sub_kategori: Optional[str] = None
    ref_tipe: Optional[str] = None
    ref_id: Optional[int] = None

    # Permintaan hapus permanen (diajukan pengguna, diputuskan administrator)
    hapus_status: Optional[str] = None
    hapus_diajukan_oleh: Optional[int] = None
    hapus_diajukan_pada: Optional[datetime] = None
    hapus_alasan: Optional[str] = None
    hapus_catatan_admin: Optional[str] = None
    nama_pengaju_hapus: Optional[str] = None

    class Config:
        from_attributes = True


class FilterOptionsResponse(BaseModel):
    years: List[int] = []
    months: List[int] = []
    events: List[str] = []
    kategori: List[str] = []
    hak_akses: List[str] = []
    sub_bagian: List[str] = []
    sumber_modul: List[str] = []
    sub_kategori: Dict[str, List[str]] = {}
    status_retensi: List[str] = []


class PermintaanHapusRequest(BaseModel):
    alasan: str = Field(..., min_length=5, max_length=255)


class TolakHapusRequest(BaseModel):
    catatan: str = Field(..., min_length=3, max_length=255)


class DokumenArsipListResponse(BaseModel):
    total: int
    skip: int
    limit: int
    items: List[DokumenArsipResponse]


class ArsipAccessGrantCreate(BaseModel):
    id_pegawai: int
    alasan: Optional[str] = Field(None, max_length=255)
    valid_until: Optional[date] = None


class ArsipAccessGrantResponse(BaseModel):
    id: int
    id_dokumen: int
    id_pegawai: int
    nama_pegawai: Optional[str] = None
    granted_by: int
    nama_pemberi: Optional[str] = None
    alasan: Optional[str] = None
    valid_until: Optional[date] = None
    created_at: datetime


class ArsipAuditLogResponse(BaseModel):
    id: int
    id_dokumen: Optional[int] = None
    nomor_dokumen: Optional[str] = None
    nama_dokumen: Optional[str] = None
    aksi: str
    actor_id: Optional[int] = None
    actor_nama: Optional[str] = None
    detail: Optional[str] = None
    created_at: datetime


class ArsipNewVersionCreate(BaseModel):
    file_path: str = Field(..., max_length=255)
    catatan_versi: Optional[str] = Field(None, max_length=255)
    tanggal_dokumen: Optional[date] = None


class ArsipPenyusutanCreate(BaseModel):
    jenis_penyusutan: Literal["musnah", "serah", "pindah"] = "musnah"
    alasan: str = Field(..., min_length=5, max_length=1000)
    dokumen_ids: List[int] = Field(..., min_length=1)


class ArsipPenyusutanExecute(BaseModel):
    catatan_persetujuan: Optional[str] = Field(None, max_length=500)


class ArsipPenyusutanResponse(BaseModel):
    id: int
    nomor_ba: str
    jenis_penyusutan: str
    status: str
    alasan: str
    dokumen_ids: List[int]
    dokumen_snapshot: Optional[List[Dict[str, Any]]] = None
    diajukan_oleh: int
    nama_pengaju: Optional[str] = None
    disetujui_oleh: Optional[int] = None
    nama_penyetuju: Optional[str] = None
    catatan_persetujuan: Optional[str] = None
    tanggal_eksekusi: Optional[datetime] = None
    created_at: datetime
