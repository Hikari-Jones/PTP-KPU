from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user, require_admin
from app.models.schema import Pegawai
from app.schemas.anggaran import (
    AkunAnggaranCreate,
    AkunAnggaranUpdate,
    AkunAnggaranResponse,
    AkunAnggaranListResponse,
)
from app.services.anggaran import akun_anggaran

router = APIRouter()


@router.get(
    "/",
    response_model=AkunAnggaranListResponse,
    summary="List Akun Anggaran (MAK)",
    description="Mengambil daftar akun anggaran dengan filter kode_akun, nama_akun, id_bagian, jenis_belanja, program, sub_program, status, dan pagination.",
)
async def read_akun_anggaran(
    response: Response,
    db: AsyncSession = Depends(get_db),
    kode_akun: Optional[str] = Query(None, description="Filter kode akun MAK"),
    nama_akun: Optional[str] = Query(None, description="Filter nama akun"),
    id_bagian: Optional[int] = Query(None, description="Filter divisi / bagian KPU"),
    jenis_belanja: Optional[str] = Query(None, description="Filter jenis belanja"),
    program: Optional[str] = Query(None, description="Filter program"),
    sub_program: Optional[str] = Query(None, description="Filter sub program"),
    status: Optional[str] = Query(None, pattern="^(active|inactive)$", description="Filter status"),
    search: Optional[str] = Query(None, description="Search kode atau nama akun"),
    skip: int = Query(0, ge=0, description="Offset data"),
    limit: int = Query(50, ge=1, le=500, description="Limit data"),
) -> Any:
    items, total = await akun_anggaran.get_filtered(
        db,
        kode_akun=kode_akun,
        nama_akun=nama_akun,
        id_bagian=id_bagian,
        jenis_belanja=jenis_belanja,
        program=program,
        sub_program=sub_program,
        status=status,
        search=search,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return {"total": total, "items": items}


@router.get(
    "/{id_akun_anggaran}",
    response_model=AkunAnggaranResponse,
    summary="Detail Akun Anggaran",
    description="Mengambil detail akun anggaran berdasarkan ID beserta informasi bagian.",
)
async def read_akun_anggaran_by_id(
    id_akun_anggaran: int,
    db: AsyncSession = Depends(get_db),
) -> Any:
    db_obj = await akun_anggaran.get_detail(db, id_akun_anggaran)
    if not db_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Akun anggaran dengan ID {id_akun_anggaran} tidak ditemukan",
        )
    return akun_anggaran.enrich_akun_response(db_obj)


@router.post(
    "/",
    response_model=AkunAnggaranResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Tambah Akun Anggaran (MAK)",
    description="Mendaftarkan akun anggaran baru. Membutuhkan role Administrator.",
)
async def create_akun_anggaran(
    akun_in: AkunAnggaranCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
) -> Any:
    db_obj = await akun_anggaran.create_akun(db, obj_in=akun_in)
    return akun_anggaran.enrich_akun_response(db_obj)


@router.put(
    "/{id_akun_anggaran}",
    response_model=AkunAnggaranResponse,
    summary="Update Akun Anggaran",
    description="Memperbarui data akun anggaran. Membutuhkan role Administrator.",
)
async def update_akun_anggaran(
    id_akun_anggaran: int,
    akun_in: AkunAnggaranUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
) -> Any:
    db_obj = await akun_anggaran.update_akun(
        db,
        id_akun=id_akun_anggaran,
        obj_in=akun_in,
    )
    return akun_anggaran.enrich_akun_response(db_obj)


@router.delete(
    "/{id_akun_anggaran}",
    response_model=AkunAnggaranResponse,
    summary="Hapus Akun Anggaran",
    description="Menghapus akun anggaran jika belum memiliki alokasi pagu tahunan. Membutuhkan role Administrator.",
)
async def delete_akun_anggaran(
    id_akun_anggaran: int,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
) -> Any:
    db_obj = await akun_anggaran.get_detail(db, id_akun_anggaran)
    if not db_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Akun anggaran dengan ID {id_akun_anggaran} tidak ditemukan",
        )
    enriched = akun_anggaran.enrich_akun_response(db_obj)
    await akun_anggaran.delete_akun(db, id_akun=id_akun_anggaran)
    return enriched
