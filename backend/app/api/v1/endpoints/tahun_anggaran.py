from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user, require_admin
from app.models.schema import Pegawai
from app.schemas.anggaran import (
    TahunAnggaranCreate,
    TahunAnggaranUpdate,
    TahunAnggaranResponse,
    TahunAnggaranListResponse,
)
from app.services.anggaran import tahun_anggaran

router = APIRouter()


@router.get(
    "/",
    response_model=TahunAnggaranListResponse,
    summary="List Tahun Anggaran",
    description="Mengambil daftar tahun anggaran dengan filter status, search, dan pagination.",
)
async def read_tahun_anggaran(
    response: Response,
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None, description="Pencarian deskripsi atau tahun"),
    status: Optional[str] = Query(None, pattern="^(draft|active|closed)$", description="Filter status tahun: draft, active, closed"),
    skip: int = Query(0, ge=0, description="Offset data"),
    limit: int = Query(50, ge=1, le=500, description="Limit data per halaman"),
) -> Any:
    items, total = await tahun_anggaran.get_filtered(
        db,
        search=search,
        status=status,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return {"total": total, "items": items}


@router.get(
    "/{id_tahun_anggaran}",
    response_model=TahunAnggaranResponse,
    summary="Detail Tahun Anggaran",
    description="Mengambil informasi detail tahun anggaran beserta statistik pagu dan realisasinya.",
)
async def read_tahun_anggaran_by_id(
    id_tahun_anggaran: int,
    db: AsyncSession = Depends(get_db),
) -> Any:
    db_obj = await tahun_anggaran.get(db, id_tahun_anggaran)
    if not db_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tahun anggaran dengan ID {id_tahun_anggaran} tidak ditemukan",
        )
    return await tahun_anggaran.enrich_tahun_response(db, db_obj)


@router.post(
    "/",
    response_model=TahunAnggaranResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tambah Tahun Anggaran",
    description="Membuka tahun anggaran baru. Membutuhkan role Administrator.",
)
async def create_tahun_anggaran(
    tahun_in: TahunAnggaranCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
) -> Any:
    db_obj = await tahun_anggaran.create_tahun(
        db,
        obj_in=tahun_in,
        current_user_id=current_user.id_pegawai,
    )
    return await tahun_anggaran.enrich_tahun_response(db, db_obj)


@router.put(
    "/{id_tahun_anggaran}",
    response_model=TahunAnggaranResponse,
    summary="Update Tahun Anggaran",
    description="Memperbarui informasi tahun anggaran. Membutuhkan role Administrator.",
)
async def update_tahun_anggaran(
    id_tahun_anggaran: int,
    tahun_in: TahunAnggaranUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
) -> Any:
    db_obj = await tahun_anggaran.update_tahun(
        db,
        id_tahun=id_tahun_anggaran,
        obj_in=tahun_in,
    )
    return await tahun_anggaran.enrich_tahun_response(db, db_obj)


@router.delete(
    "/{id_tahun_anggaran}",
    response_model=TahunAnggaranResponse,
    summary="Hapus Tahun Anggaran",
    description="Menghapus tahun anggaran jika belum memiliki alokasi pagu. Membutuhkan role Administrator.",
)
async def delete_tahun_anggaran(
    id_tahun_anggaran: int,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
) -> Any:
    db_obj = await tahun_anggaran.get(db, id_tahun_anggaran)
    if not db_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tahun anggaran dengan ID {id_tahun_anggaran} tidak ditemukan",
        )
    enriched = await tahun_anggaran.enrich_tahun_response(db, db_obj)
    await tahun_anggaran.delete_tahun(db, id_tahun=id_tahun_anggaran)
    return enriched
