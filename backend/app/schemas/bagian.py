from typing import Optional
from pydantic import BaseModel, Field

class BagianBase(BaseModel):
    nama_bagian: str = Field(..., max_length=150)

class BagianCreate(BagianBase):
    pass

class BagianUpdate(BagianBase):
    nama_bagian: Optional[str] = Field(None, max_length=150)

class BagianResponse(BagianBase):
    id_bagian: int

    class Config:
        from_attributes = True
