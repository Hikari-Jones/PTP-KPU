from typing import Optional, Literal
from pydantic import BaseModel, Field

class PegawaiBase(BaseModel):
    is_active: bool = True
    jabatan: Optional[str] = Field(None, max_length=100)
    id_bagian: Optional[int] = None
    nama: str = Field(..., max_length=150)
    role: Literal["Admin", "Pegawai", "Operator", "admin", "pegawai", "operator", "administrator"]

class PegawaiCreate(PegawaiBase):
    nip: str = Field(..., min_length=1, max_length=30)
    password: str = Field(..., min_length=8, max_length=255)

class PegawaiUpdate(BaseModel):
    is_active: Optional[bool] = None
    jabatan: Optional[str] = Field(None, max_length=100)
    id_bagian: Optional[int] = None
    nama: Optional[str] = Field(None, max_length=150)
    role: Optional[Literal["Admin", "Pegawai", "Operator", "admin", "pegawai", "operator", "administrator"]] = None
    password: Optional[str] = Field(None, min_length=8, max_length=255)

class PegawaiResponse(PegawaiBase):
    nip: Optional[str] = None
    id_pegawai: int
    is_online: bool = False

    class Config:
        from_attributes = True
