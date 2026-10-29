from typing import Optional
from pydantic import BaseModel, Field

class PegawaiBase(BaseModel):
    id_bagian: Optional[int] = None
    nama: str = Field(..., max_length=150)
    role: str = Field(..., max_length=50)

class PegawaiCreate(PegawaiBase):
    password: str = Field(..., max_length=255)

class PegawaiUpdate(BaseModel):
    id_bagian: Optional[int] = None
    nama: Optional[str] = Field(None, max_length=150)
    role: Optional[str] = Field(None, max_length=50)
    password: Optional[str] = Field(None, max_length=255)

class PegawaiResponse(PegawaiBase):
    id_pegawai: int

    class Config:
        from_attributes = True
