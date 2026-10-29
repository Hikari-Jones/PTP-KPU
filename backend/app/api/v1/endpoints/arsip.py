from datetime import datetime
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user, require_admin, is_admin
from app.models.schema import Pegawai
from app.schemas.arsip import (
    DokumenArsipCreate,
    DokumenArsipUpdate,
    DokumenArsipResponse,
    FilterOptionsResponse,
)
from app.services.arsip import arsip

router = APIRouter()

@router.get("/filter-options", response_model=FilterOptionsResponse)
async def get_filter_options(
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Retrieve distinct filter options dynamically from database (Year, Month, Event, Kategori, Hak Akses, Sub Bagian).
    Zero hardcoded values.
    """
    return await arsip.get_filter_options(db, status_hapus=False)

@router.get("/trash", response_model=List[DokumenArsipResponse])
async def read_trash_arsip(
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
    search: Optional[str] = Query(None, description="Pencarian nama atau nomor dokumen"),
    year: Optional[int] = Query(None, ge=1900, le=2100, description="Filter tahun"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Filter bulan (1-12)"),
    event: Optional[str] = Query(None, description="Filter event"),
    kategori: Optional[str] = Query(None, description="Filter kategori"),
    hak_akses: Optional[str] = Query(None, description="Filter hak akses"),
    sub_bagian: Optional[str] = Query(None, description="Filter sub bagian"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> Any:
    """
    Retrieve documents in trash bin (status_hapus=true).
    """
    items, total = await arsip.get_filtered(
        db,
        search=search,
        year=year,
        month=month,
        event=event,
        kategori=kategori,
        hak_akses=hak_akses,
        sub_bagian=sub_bagian,
        status_hapus=True,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return items

@router.get("/", response_model=List[DokumenArsipResponse])
async def read_arsip(
    response: Response,
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None, description="Pencarian nama atau nomor dokumen"),
    year: Optional[int] = Query(None, ge=1900, le=2100, description="Filter tahun"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Filter bulan (1-12)"),
    event: Optional[str] = Query(None, description="Filter event"),
    kategori: Optional[str] = Query(None, description="Filter kategori"),
    hak_akses: Optional[str] = Query(None, description="Filter hak akses"),
    sub_bagian: Optional[str] = Query(None, description="Filter sub bagian"),
    status_hapus: bool = Query(False, description="Status hapus (default false untuk arsip aktif)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> Any:
    """
    Retrieve archive documents with dynamic database-level query parameters.
    """
    items, total = await arsip.get_filtered(
        db,
        search=search,
        year=year,
        month=month,
        event=event,
        kategori=kategori,
        hak_akses=hak_akses,
        sub_bagian=sub_bagian,
        status_hapus=status_hapus,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return items

@router.post("/", response_model=DokumenArsipResponse, status_code=status.HTTP_201_CREATED)
async def create_arsip(
    *,
    db: AsyncSession = Depends(get_db),
    arsip_in: DokumenArsipCreate,
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    """
    Create a new archive document. Automatically sets uploader if needed.
    """
    # Override id_pegawai to authenticated user if not set or non-admin
    if not is_admin(current_user) or arsip_in.id_pegawai == 0:
        arsip_in.id_pegawai = current_user.id_pegawai

    created_obj = await arsip.create(db, obj_in=arsip_in)
    return await arsip.get_by_id(db, created_obj.id_dokumen)

@router.get("/{id_dokumen}", response_model=DokumenArsipResponse)
async def read_arsip_by_id(
    *,
    db: AsyncSession = Depends(get_db),
    id_dokumen: int,
) -> Any:
    """
    Get archive document by id.
    """
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Dokumen arsip tidak ditemukan")
    return db_obj

@router.put("/{id_dokumen}", response_model=DokumenArsipResponse)
async def update_arsip(
    *,
    db: AsyncSession = Depends(get_db),
    id_dokumen: int,
    arsip_in: DokumenArsipUpdate,
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    """
    Update archive document metadata with authorization check.
    """
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Dokumen arsip tidak ditemukan")

    # Authorization: Admin or Owner
    if not is_admin(current_user) and db_obj.id_pegawai != current_user.id_pegawai:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak: Anda tidak memiliki izin untuk mengedit dokumen ini",
        )

    await arsip.update(db, db_obj=db_obj, obj_in=arsip_in)
    return await arsip.get_by_id(db, id_dokumen=id_dokumen)

@router.delete("/{id_dokumen}", response_model=DokumenArsipResponse)
@router.patch("/{id_dokumen}/delete", response_model=DokumenArsipResponse)
async def delete_arsip(
    *,
    db: AsyncSession = Depends(get_db),
    id_dokumen: int,
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    """
    Soft delete archive document (move to trash).
    Enforces server-side authorization:
    - Administrator can delete any document.
    - Regular user/staff can only delete their own uploaded documents or documents from their section.
    """
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Dokumen arsip tidak ditemukan")

    # Authorization check against database role
    if not is_admin(current_user):
        is_owner = db_obj.id_pegawai == current_user.id_pegawai
        is_same_section = (
            current_user.id_bagian is not None
            and db_obj.pegawai
            and db_obj.pegawai.id_bagian == current_user.id_bagian
            and db_obj.hak_akses != "terbatas"
        )
        if not (is_owner or is_same_section):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Akses ditolak: Anda tidak memiliki hak untuk menghapus dokumen ini",
            )

    # Perform persistent soft delete
    updated_obj = await arsip.soft_delete(
        db, id_dokumen=id_dokumen, deleted_by=current_user.id_pegawai
    )
    return updated_obj

@router.patch("/{id_dokumen}/restore", response_model=DokumenArsipResponse)
async def restore_arsip(
    *,
    db: AsyncSession = Depends(get_db),
    id_dokumen: int,
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    """
    Restore archive document from trash back to active status.
    Enforces server-side authorization:
    - Administrator can restore any document.
    - Regular user can restore documents they uploaded or deleted.
    """
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Dokumen arsip tidak ditemukan")

    if not db_obj.status_hapus:
        return db_obj

    # Authorization check
    if not is_admin(current_user):
        is_owner = db_obj.id_pegawai == current_user.id_pegawai
        is_deleter = db_obj.dihapus_oleh == current_user.id_pegawai
        if not (is_owner or is_deleter):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Akses ditolak: Anda tidak memiliki hak untuk memulihkan dokumen ini",
            )

    # Perform persistent restore
    updated_obj = await arsip.restore(db, id_dokumen=id_dokumen)
    return updated_obj

@router.delete("/{id_dokumen}/permanent", response_model=DokumenArsipResponse)
async def permanent_delete_arsip(
    *,
    db: AsyncSession = Depends(get_db),
    id_dokumen: int,
    admin_user: Pegawai = Depends(require_admin),
) -> Any:
    """
    Permanently delete archive document from database (Hard Delete).
    STRICTLY FORBIDDEN FOR NON-ADMINISTRATORS (Staff/Operators).
    """
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Dokumen arsip tidak ditemukan")

    return await arsip.permanent_delete(db, id_dokumen=id_dokumen)
