from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.core.auth import require_admin
from app.models.schema import Pegawai

router = APIRouter()

class SatkerItem(BaseModel):
    id_satker: int
    kode_satker: str
    nama_satker: str
    tingkat: str  # "Provinsi" atau "Kabupaten/Kota"
    alamat: str
    pagu: int
    realisasi: int
    persentase: float
    status_dipa: str

class SatkerCreate(BaseModel):
    kode_satker: str = Field(..., max_length=20)
    nama_satker: str = Field(..., max_length=200)
    tingkat: str = Field("Kabupaten/Kota")
    alamat: str = Field(..., max_length=255)
    pagu: int = Field(0, ge=0)
    realisasi: int = Field(0, ge=0)
    status_dipa: str = Field("Aktif")

KPU_SULUT_SATKER: List[SatkerItem] = [
    SatkerItem(id_satker=1, kode_satker="652801", nama_satker="KPU Provinsi Sulawesi Utara", tingkat="Provinsi", alamat="Jl. Diponegoro No. 12, Manado", pagu=45780000000, realisasi=31950000000, persentase=69.8, status_dipa="Aktif"),
    SatkerItem(id_satker=2, kode_satker="652802", nama_satker="KPU Kota Manado", tingkat="Kabupaten/Kota", alamat="Jl. Balai Kota No. 1, Manado", pagu=14200000000, realisasi=10224000000, persentase=72.0, status_dipa="Aktif"),
    SatkerItem(id_satker=3, kode_satker="652803", nama_satker="KPU Kota Bitung", tingkat="Kabupaten/Kota", alamat="Jl. Dr. Sam Ratulangi, Bitung", pagu=9800000000, realisasi=6860000000, persentase=70.0, status_dipa="Aktif"),
    SatkerItem(id_satker=4, kode_satker="652804", nama_satker="KPU Kota Tomohon", tingkat="Kabupaten/Kota", alamat="Kakaskasen Tiga, Tomohon", pagu=7500000000, realisasi=5400000000, persentase=72.0, status_dipa="Aktif"),
    SatkerItem(id_satker=5, kode_satker="652805", nama_satker="KPU Kota Kotamobagu", tingkat="Kabupaten/Kota", alamat="Jl. Paloko Kinalang, Kotamobagu", pagu=8100000000, realisasi=5508000000, persentase=68.0, status_dipa="Aktif"),
    SatkerItem(id_satker=6, kode_satker="652806", nama_satker="KPU Kabupaten Minahasa", tingkat="Kabupaten/Kota", alamat="Jl. Tuur In Tana, Tondano", pagu=12500000000, realisasi=8875000000, persentase=71.0, status_dipa="Aktif"),
    SatkerItem(id_satker=7, kode_satker="652807", nama_satker="KPU Kabupaten Minahasa Utara", tingkat="Kabupaten/Kota", alamat="Airmadidi, Minahasa Utara", pagu=9600000000, realisasi=6912000000, persentase=72.0, status_dipa="Aktif"),
    SatkerItem(id_satker=8, kode_satker="652808", nama_satker="KPU Kabupaten Minahasa Selatan", tingkat="Kabupaten/Kota", alamat="Amurang, Minahasa Selatan", pagu=9200000000, realisasi=6256000000, persentase=68.0, status_dipa="Aktif"),
    SatkerItem(id_satker=9, kode_satker="652809", nama_satker="KPU Kabupaten Minahasa Tenggara", tingkat="Kabupaten/Kota", alamat="Ratahan, Minahasa Tenggara", pagu=7800000000, realisasi=5226000000, persentase=67.0, status_dipa="Aktif"),
    SatkerItem(id_satker=10, kode_satker="652810", nama_satker="KPU Kabupaten Bolaang Mongondow", tingkat="Kabupaten/Kota", alamat="Lolak, Bolaang Mongondow", pagu=11000000000, realisasi=7480000000, persentase=68.0, status_dipa="Aktif"),
    SatkerItem(id_satker=11, kode_satker="652811", nama_satker="KPU Kabupaten Bolmong Utara", tingkat="Kabupaten/Kota", alamat="Boroko, Bolmong Utara", pagu=7200000000, realisasi=4896000000, persentase=68.0, status_dipa="Aktif"),
    SatkerItem(id_satker=12, kode_satker="652812", nama_satker="KPU Kabupaten Bolmong Selatan", tingkat="Kabupaten/Kota", alamat="Molibagu, Bolmong Selatan", pagu=6900000000, realisasi=4623000000, persentase=67.0, status_dipa="Aktif"),
    SatkerItem(id_satker=13, kode_satker="652813", nama_satker="KPU Kabupaten Bolmong Timur", tingkat="Kabupaten/Kota", alamat="Tutuyan, Bolmong Timur", pagu=6800000000, realisasi=4556000000, persentase=67.0, status_dipa="Aktif"),
    SatkerItem(id_satker=14, kode_satker="652814", nama_satker="KPU Kabupaten Kepulauan Sangihe", tingkat="Kabupaten/Kota", alamat="Tahuna, Kepulauan Sangihe", pagu=8900000000, realisasi=6141000000, persentase=69.0, status_dipa="Aktif"),
    SatkerItem(id_satker=15, kode_satker="652815", nama_satker="KPU Kabupaten Kepulauan Talaud", tingkat="Kabupaten/Kota", alamat="Melonguane, Kepulauan Talaud", pagu=8700000000, realisasi=5916000000, persentase=68.0, status_dipa="Aktif"),
    SatkerItem(id_satker=16, kode_satker="652816", nama_satker="KPU Kabupaten Kepulauan Siau Tagulandang Biaro (Sitaro)", tingkat="Kabupaten/Kota", alamat="Ondong Siau, Kepulauan Sitaro", pagu=7100000000, realisasi=4828000000, persentase=68.0, status_dipa="Aktif"),
]

@router.get("/", response_model=List[SatkerItem])
async def list_satker():
    """Retrieve all KPU Satker within Sulawesi Utara province."""
    return KPU_SULUT_SATKER

@router.post("/", response_model=SatkerItem)
async def create_satker(payload: SatkerCreate, current_user: Pegawai = Depends(require_admin)):
    """Create a new Satker (Admin only)."""
    # Check duplicate kode
    if any(s.kode_satker == payload.kode_satker for s in KPU_SULUT_SATKER):
        raise HTTPException(400, f"Kode Satker '{payload.kode_satker}' sudah terdaftar.")
    new_id = max((s.id_satker for s in KPU_SULUT_SATKER), default=0) + 1
    pct = round((payload.realisasi / payload.pagu * 100), 1) if payload.pagu > 0 else 0.0
    item = SatkerItem(
        id_satker=new_id,
        kode_satker=payload.kode_satker,
        nama_satker=payload.nama_satker,
        tingkat=payload.tingkat,
        alamat=payload.alamat,
        pagu=payload.pagu,
        realisasi=payload.realisasi,
        persentase=pct,
        status_dipa=payload.status_dipa,
    )
    KPU_SULUT_SATKER.append(item)
    return item
