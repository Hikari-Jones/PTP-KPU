from datetime import date, datetime
from typing import Dict, List, Optional, Literal
from pydantic import BaseModel, Field

class DokumenArsipBase(BaseModel):
    nama_dokumen: str = Field(..., max_length=255)
    nomor_dokumen: str = Field(..., max_length=100)
    id_pegawai: int
    id_klasifikasi: Optional[int] = None
    kategori: str = Field(..., max_length=100)
    event: Optional[str] = Field(None, max_length=150)
    tanggal_dokumen: date
    file_path: Optional[str] = Field(None, max_length=255)
    ukuran_file: Optional[int] = 0
    hak_akses: Literal["internal", "terbatas", "publik"] = "internal"

class DokumenArsipCreate(DokumenArsipBase):
    pass

class DokumenArsipUpdate(BaseModel):
    nama_dokumen: Optional[str] = Field(None, max_length=255)
    nomor_dokumen: Optional[str] = Field(None, max_length=100)
    id_pegawai: Optional[int] = None
    id_klasifikasi: Optional[int] = None
    kategori: Optional[str] = Field(None, max_length=100)
    event: Optional[str] = Field(None, max_length=150)
    tanggal_dokumen: Optional[date] = None
    file_path: Optional[str] = Field(None, max_length=255)
    ukuran_file: Optional[int] = None
    hak_akses: Optional[Literal["internal", "terbatas", "publik"]] = None
    status_hapus: Optional[bool] = None

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
    # Modul asal yang memiliki dokumen, dan sub-kategori per modul
    sumber_modul: List[str] = []
    sub_kategori: Dict[str, List[str]] = {}

class PermintaanHapusRequest(BaseModel):
    alasan: str = Field(..., min_length=5, max_length=255)

class TolakHapusRequest(BaseModel):
    catatan: str = Field(..., min_length=3, max_length=255)

class DokumenArsipListResponse(BaseModel):
    total: int
    skip: int
    limit: int
    items: List[DokumenArsipResponse]
