from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user, require_admin
from app.models.schema import Pegawai
from app.schemas.anggaran import (
    RevisiAnggaranCreate,
    RevisiAnggaranResponse,
    RevisiAnggaranListResponse,
)
from app.services.anggaran import revisi_anggaran

router = APIRouter()


@router.get(
    "/",
    response_model=RevisiAnggaranListResponse,
    summary="List Histori Revisi Anggaran",
    description="Mengambil riwayat revisi anggaran. Histori revisi bersifat immutable.",
)
async def read_revisi_anggaran(
    response: Response,
    db: AsyncSession = Depends(get_db),
    id_pagu: Optional[int] = Query(None, description="Filter berdasarkan ID pagu"),
    id_tahun_anggaran: Optional[int] = Query(None, description="Filter berdasarkan ID tahun anggaran"),
    skip: int = Query(0, ge=0, description="Offset"),
    limit: int = Query(50, ge=1, le=500, description="Limit"),
) -> Any:
    items, total = await revisi_anggaran.get_filtered(
        db,
        id_pagu=id_pagu,
        id_tahun_anggaran=id_tahun_anggaran,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return {"total": total, "items": items}


@router.get(
    "/{id_revisi}",
    response_model=RevisiAnggaranResponse,
    summary="Detail Histori Revisi",
    description="Mengambil informasi detail catatan pergeseran / revisi anggaran tertentu.",
)
async def read_revisi_anggaran_by_id(
    id_revisi: int,
    db: AsyncSession = Depends(get_db),
) -> Any:
    db_obj = await revisi_anggaran.get_detail(db, id_revisi)
    if not db_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Histori revisi anggaran dengan ID {id_revisi} tidak ditemukan",
        )
    return revisi_anggaran.enrich_revisi_response(db_obj)


@router.post(
    "/",
    response_model=RevisiAnggaranResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Eksekusi Revisi Anggaran",
    description="Melakukan pergeseran/perubahan pagu anggaran secara atomik. Otomatis mencatat pagu sebelumnya, mengunci pagu_anggaran, memvalidasi terhadap realisasi verified, dan mengupdate pagu_aktif. Membutuhkan role Administrator.",
)
async def create_revisi_anggaran(
    revisi_in: RevisiAnggaranCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
) -> Any:
    db_obj = await revisi_anggaran.create_revisi(
        db,
        obj_in=revisi_in,
        id_pegawai=current_user.id_pegawai,
    )
    return revisi_anggaran.enrich_revisi_response(db_obj)

# CATATAN ARSITEKTUR KEAMANAN FINANSIAL:
# Sesuai requirement, JANGAN menambahkan endpoint PUT atau DELETE pada /revisi-anggaran.
# Seluruh catatan revisi DIPA/anggaran bersifat immutable untuk keperluan jejak audit finansial BPK/KPU.
