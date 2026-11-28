from typing import Optional
from pydantic import BaseModel, Field

class BagianBase(BaseModel):
    nama_bagian: str = Field(..., min_length=1, max_length=150)

class BagianCreate(BagianBase):
    # Optional: generated from the name when omitted (must be unique).
    kode_bagian: Optional[str] = Field(None, min_length=1, max_length=20)

class BagianUpdate(BaseModel):
    nama_bagian: Optional[str] = Field(None, min_length=1, max_length=150)
    kode_bagian: Optional[str] = Field(None, min_length=1, max_length=20)

class BagianResponse(BagianBase):
    id_bagian: int
    kode_bagian: Optional[str] = None

    class Config:
        from_attributes = True
