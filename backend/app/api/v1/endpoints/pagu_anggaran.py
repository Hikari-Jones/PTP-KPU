from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user, require_admin
from app.models.schema import Pegawai
from app.schemas.anggaran import (
    PaguAnggaranCreate,
    PaguAnggaranUpdate,
    PaguAnggaranResponse,
    PaguAnggaranListResponse,
    BudgetSummaryResponse,
)
from app.services.anggaran import pagu_anggaran, calculate_budget_summary

router = APIRouter()


@router.get(
    "/",
    response_model=PaguAnggaranListResponse,
    summary="List Alokasi Pagu Anggaran",
    description="Mengambil daftar pagu anggaran dengan filter tahun anggaran, akun, bagian, status tahun, search kode/nama akun, dan pagination.",
)
async def read_pagu_anggaran(
    response: Response,
    db: AsyncSession = Depends(get_db),
    id_tahun_anggaran: Optional[int] = Query(None, description="Filter tahun anggaran"),
    id_akun_anggaran: Optional[int] = Query(None, description="Filter akun MAK"),
    id_bagian: Optional[int] = Query(None, description="Filter bagian / divisi KPU"),
    status_tahun: Optional[str] = Query(None, pattern="^(draft|active|closed)$", description="Filter status tahun anggaran"),
    search: Optional[str] = Query(None, description="Search kode atau nama akun"),
    skip: int = Query(0, ge=0, description="Offset"),
    limit: int = Query(50, ge=1, le=500, description="Limit"),
) -> Any:
    items, total = await pagu_anggaran.get_filtered(
        db,
        id_tahun_anggaran=id_tahun_anggaran,
        id_akun_anggaran=id_akun_anggaran,
        id_bagian=id_bagian,
        status_tahun=status_tahun,
        search=search,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return {"total": total, "items": items}


@router.get(
    "/{id_pagu}",
    response_model=PaguAnggaranResponse,
    summary="Detail Pagu Anggaran",
    description="Mengambil detail alokasi pagu beserta metrik realisasi terverifikasi dan sisa anggarannya.",
)
async def read_pagu_anggaran_by_id(
    id_pagu: int,
    db: AsyncSession = Depends(get_db),
) -> Any:
    db_obj = await pagu_anggaran.get_detail(db, id_pagu)
    if not db_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pagu anggaran dengan ID {id_pagu} tidak ditemukan",
        )
    return await pagu_anggaran.enrich_pagu_response(db, db_obj)


@router.get(
    "/{id_pagu}/summary",
    response_model=BudgetSummaryResponse,
    summary="Summary Realisasi Pagu Anggaran",
    description="Mengambil perhitungan real-time pagu, verified realization, sisa anggaran, dan persentase serapan melalui service.",
)
async def read_pagu_summary(
    id_pagu: int,
    db: AsyncSession = Depends(get_db),
) -> Any:
    return await calculate_budget_summary(db, id_pagu)


@router.post(
    "/",
    response_model=PaguAnggaranResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tambah Alokasi Pagu Anggaran",
    description="Menetapkan pagu anggaran awal (DIPA) untuk suatu akun pada tahun tertentu. Membutuhkan role Administrator.",
)
async def create_pagu_anggaran(
    pagu_in: PaguAnggaranCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
) -> Any:
    db_obj = await pagu_anggaran.create_pagu(db, obj_in=pagu_in)
    return await pagu_anggaran.enrich_pagu_response(db, db_obj)


@router.put(
    "/{id_pagu}",
    response_model=PaguAnggaranResponse,
    summary="Update Metadata Pagu Anggaran",
    description="Memperbarui metadata SK atau keterangan pagu. Nilai pagu aktif TIDAK diubah melalui endpoint ini, melainkan via Revisi Anggaran. Membutuhkan role Administrator.",
)
async def update_pagu_anggaran(
    id_pagu: int,
    pagu_in: PaguAnggaranUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
) -> Any:
    db_obj = await pagu_anggaran.update_pagu(
        db,
        id_pagu=id_pagu,
        obj_in=pagu_in,
    )
    return await pagu_anggaran.enrich_pagu_response(db, db_obj)


@router.delete(
    "/{id_pagu}",
    response_model=PaguAnggaranResponse,
    summary="Hapus Alokasi Pagu Anggaran",
    description="Menghapus alokasi pagu jika belum memiliki transaksi realisasi atau revisi anggaran. Membutuhkan role Administrator.",
)
async def delete_pagu_anggaran(
    id_pagu: int,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
) -> Any:
    db_obj = await pagu_anggaran.get_detail(db, id_pagu)
    if not db_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pagu anggaran dengan ID {id_pagu} tidak ditemukan",
        )
    enriched = await pagu_anggaran.enrich_pagu_response(db, db_obj)
    await pagu_anggaran.delete_pagu(db, id_pagu=id_pagu)
    return enriched
