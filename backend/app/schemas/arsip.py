from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, Field

class DokumenArsipBase(BaseModel):
    nama_dokumen: str = Field(..., max_length=255)
    nomor_dokumen: str = Field(..., max_length=100)
    id_pegawai: int
    kategori: str = Field(..., max_length=100)
    event: Optional[str] = Field(None, max_length=150)
    tanggal_dokumen: date
    file_path: Optional[str] = Field(None, max_length=255)
    ukuran_file: Optional[int] = 0
    hak_akses: str = Field("internal", max_length=50)

class DokumenArsipCreate(DokumenArsipBase):
    pass

class DokumenArsipUpdate(BaseModel):
    nama_dokumen: Optional[str] = Field(None, max_length=255)
    nomor_dokumen: Optional[str] = Field(None, max_length=100)
    id_pegawai: Optional[int] = None
    kategori: Optional[str] = Field(None, max_length=100)
    event: Optional[str] = Field(None, max_length=150)
    tanggal_dokumen: Optional[date] = None
    file_path: Optional[str] = Field(None, max_length=255)
    ukuran_file: Optional[int] = None
    hak_akses: Optional[str] = Field(None, max_length=50)
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

    class Config:
        from_attributes = True

class FilterOptionsResponse(BaseModel):
    years: List[int] = []
    months: List[int] = []
    events: List[str] = []
    kategori: List[str] = []
    hak_akses: List[str] = []
    sub_bagian: List[str] = []

class DokumenArsipListResponse(BaseModel):
    total: int
    skip: int
    limit: int
    items: List[DokumenArsipResponse]
