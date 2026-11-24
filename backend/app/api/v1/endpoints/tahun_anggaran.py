from typing import Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user, require_admin, require_rendatin_or_keuangan
from app.models.schema import Pegawai
from app.schemas.anggaran import (
    TahunAnggaranCreate,
    TahunAnggaranUpdate,
    TahunAnggaranResponse,
    TahunAnggaranListResponse,
    TahunAnggaranActivatePayload,
    AuditAktivasiTahunResponse,
)
from app.services.anggaran import tahun_anggaran

router = APIRouter()


@router.get(
    "/",
    response_model=TahunAnggaranListResponse,
    summary="List Tahun Anggaran",
    description="Mengambil daftar tahun anggaran dengan filter status, search, dan pagination. Hanya untuk Keuangan dan RENDATIN.",
)
async def read_tahun_anggaran(
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_rendatin_or_keuangan),
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
    description="Mengambil informasi detail tahun anggaran beserta statistik pagu dan realisasinya. Hanya untuk Keuangan dan RENDATIN.",
)
async def read_tahun_anggaran_by_id(
    id_tahun_anggaran: int,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_rendatin_or_keuangan),
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
    description="Membuka tahun anggaran baru. Membutuhkan role Administrator Keuangan/RENDATIN.",
)
async def create_tahun_anggaran(
    tahun_in: TahunAnggaranCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
) -> Any:
    require_rendatin_or_keuangan(current_user)
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
    description="Memperbarui informasi tahun anggaran. Membutuhkan role Administrator Keuangan/RENDATIN.",
)
async def update_tahun_anggaran(
    id_tahun_anggaran: int,
    tahun_in: TahunAnggaranUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
) -> Any:
    require_rendatin_or_keuangan(current_user)
    db_obj = await tahun_anggaran.update_tahun(
        db,
        id_tahun=id_tahun_anggaran,
        obj_in=tahun_in,
    )
    return await tahun_anggaran.enrich_tahun_response(db, db_obj)


@router.post(
    "/{id_tahun_anggaran}/activate",
    response_model=TahunAnggaranResponse,
    summary="Aktivasi Otomatis Tahun Anggaran",
    description="Mengaktifkan tahun anggaran yang dipilih (draft/closed). Tahun aktif sebelumnya otomatis berubah menjadi closed. Proses atomik dengan database lock & audit log. Membutuhkan role Administrator Keuangan/RENDATIN.",
)
async def activate_tahun_anggaran(
    id_tahun_anggaran: int,
    payload: Optional[TahunAnggaranActivatePayload] = None,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
) -> Any:
    require_rendatin_or_keuangan(current_user)
    target_year, _, _ = await tahun_anggaran.switch_active_fiscal_year(
        db,
        target_id=id_tahun_anggaran,
        current_user_id=current_user.id_pegawai,
        current_user_name=current_user.nama,
        alasan=payload.alasan if payload else None,
    )
    return await tahun_anggaran.enrich_tahun_response(db, target_year)


@router.get(
    "/audit-aktivasi/history",
    response_model=List[AuditAktivasiTahunResponse],
    summary="Riwayat Audit Aktivasi Tahun Anggaran",
    description="Mengambil jejak audit pergantian Tahun Anggaran (siapa, kapan, tahun sebelum, tahun aktif, alasan). Hanya untuk Keuangan dan RENDATIN.",
)
async def read_audit_aktivasi(
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_rendatin_or_keuangan),
) -> Any:
    from app.models.schema import AuditAktivasiTahunAnggaran
    from sqlalchemy import select, desc
    stmt = select(AuditAktivasiTahunAnggaran).order_by(desc(AuditAktivasiTahunAnggaran.waktu_aktivasi)).limit(100)
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.delete(
    "/{id_tahun_anggaran}",
    response_model=TahunAnggaranResponse,
    summary="Hapus Tahun Anggaran",
    description="Menghapus tahun anggaran jika belum memiliki alokasi pagu. Membutuhkan role Administrator Keuangan/RENDATIN.",
)
async def delete_tahun_anggaran(
    id_tahun_anggaran: int,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
) -> Any:
    require_rendatin_or_keuangan(current_user)
    db_obj = await tahun_anggaran.get(db, id_tahun_anggaran)
    if not db_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tahun anggaran dengan ID {id_tahun_anggaran} tidak ditemukan",
        )
    enriched = await tahun_anggaran.enrich_tahun_response(db, db_obj)
    await tahun_anggaran.delete_tahun(db, id_tahun=id_tahun_anggaran)
    return enriched
