from decimal import Decimal
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_admin
from app.core.database import get_db
from app.models.schema import Pegawai, Satker

router = APIRouter()


class SatkerItem(BaseModel):
    id_satker: int
    kode_satker: str
    nama_satker: str
    tingkat: str  # "Provinsi" atau "Kabupaten/Kota"
    alamat: str
    pagu: float
    realisasi: float
    persentase: float
    status_dipa: str


class SatkerCreate(BaseModel):
    kode_satker: str = Field(..., min_length=1, max_length=20)
    nama_satker: str = Field(..., min_length=1, max_length=200)
    tingkat: Literal["Provinsi", "Kabupaten/Kota"] = "Kabupaten/Kota"
    alamat: str = Field(..., min_length=1, max_length=255)
    pagu: Decimal = Field(Decimal("0"), ge=0)
    realisasi: Decimal = Field(Decimal("0"), ge=0)
    status_dipa: str = Field("Aktif", max_length=30)

    @field_validator("kode_satker", "nama_satker", "alamat")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("wajib diisi")
        return value


def _output(item: Satker) -> SatkerItem:
    pagu = float(item.pagu or 0)
    realisasi = float(item.realisasi or 0)
    return SatkerItem(
        id_satker=item.id_satker,
        kode_satker=item.kode_satker,
        nama_satker=item.nama_satker,
        tingkat=item.tingkat,
        alamat=item.alamat,
        pagu=pagu,
        realisasi=realisasi,
        persentase=round(realisasi / pagu * 100, 1) if pagu > 0 else 0.0,
        status_dipa=item.status_dipa,
    )


@router.get("/", response_model=List[SatkerItem])
async def list_satker(
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    """Satker yang tercatat di database (diisi administrator)."""
    rows = await db.scalars(select(Satker).order_by(Satker.tingkat.desc(), Satker.kode_satker))
    return [_output(item) for item in rows.all()]


@router.post("/", response_model=SatkerItem, status_code=201)
async def create_satker(
    payload: SatkerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
):
    """Tambah Satker baru (khusus administrator)."""
    if await db.scalar(select(Satker.id_satker).where(Satker.kode_satker == payload.kode_satker)):
        raise HTTPException(400, f"Kode Satker '{payload.kode_satker}' sudah terdaftar.")
    if payload.realisasi > payload.pagu:
        raise HTTPException(422, "Realisasi tidak boleh melebihi pagu.")
    item = Satker(**payload.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _output(item)
