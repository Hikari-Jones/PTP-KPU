from datetime import datetime
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user, require_admin, is_admin
from app.models.schema import Pegawai
from app.schemas.arsip import (
    DokumenArsipCreate,
    DokumenArsipUpdate,
    DokumenArsipResponse,
    FilterOptionsResponse,
    PermintaanHapusRequest,
    TolakHapusRequest,
)
from app.services.arsip import arsip

router = APIRouter()

@router.get("/filter-options", response_model=FilterOptionsResponse)
async def get_filter_options(
    user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Retrieve distinct filter options dynamically from database (Year, Month, Event, Kategori, Hak Akses, Sub Bagian).
    Zero hardcoded values.
    """
    return await arsip.get_filter_options(db, status_hapus=False)

@router.post("/sinkronkan")
async def sinkronkan_arsip(
    user: Pegawai = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """Copy every letter and budget evidence file into the archive (idempotent)."""
    from app.services.arsip_sync import sync_all
    counts = await sync_all(db)
    return {"status": "success", **counts}

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
    sumber_modul: Optional[str] = Query(None, pattern="^(arsip|surat|realisasi)$", description="Modul asal dokumen"),
    sub_kategori: Optional[str] = Query(None, description="Sub-kategori dalam modul asal"),
    hapus_status: Optional[str] = Query(None, pattern="^(diajukan|ditolak)$", description="Status permintaan hapus permanen"),
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
        sumber_modul=sumber_modul,
        sub_kategori=sub_kategori,
        hapus_status=hapus_status,
        status_hapus=True,
        viewer=current_user,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return items

@router.get("/", response_model=List[DokumenArsipResponse])
async def read_arsip(
    response: Response,
    current_user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None, description="Pencarian nama atau nomor dokumen"),
    year: Optional[int] = Query(None, ge=1900, le=2100, description="Filter tahun"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Filter bulan (1-12)"),
    event: Optional[str] = Query(None, description="Filter event"),
    kategori: Optional[str] = Query(None, description="Filter kategori"),
    hak_akses: Optional[str] = Query(None, description="Filter hak akses"),
    sub_bagian: Optional[str] = Query(None, description="Filter sub bagian"),
    sumber_modul: Optional[str] = Query(None, pattern="^(arsip|surat|realisasi)$", description="Modul asal dokumen"),
    sub_kategori: Optional[str] = Query(None, description="Sub-kategori dalam modul asal"),
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
        sumber_modul=sumber_modul,
        sub_kategori=sub_kategori,
        status_hapus=status_hapus,
        viewer=current_user,
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
    arsip_in.id_pegawai = current_user.id_pegawai

    # Ensure id_klasifikasi is set (default to first available classification if omitted)
    if not arsip_in.id_klasifikasi:
        from app.models.schema import KodeKlasifikasiArsip
        first_klas = await db.scalar(select(KodeKlasifikasiArsip.id_klasifikasi).order_by(KodeKlasifikasiArsip.id_klasifikasi))
        # Classification is optional for general uploads; leave it empty when none exist yet.
        arsip_in.id_klasifikasi = first_klas

    if arsip_in.file_path:
        from app.models.schema import FileRecord
        try:
            file_id = int(arsip_in.file_path)
        except ValueError:
            raise HTTPException(422, 'file_path harus berupa ID berkas upload')
        record = await db.get(FileRecord, file_id)
        if not record or record.uploaded_by != current_user.id_pegawai:
            raise HTTPException(403, 'Berkas bukan milik pengguna')
    if arsip_in.id_klasifikasi is not None:
        from app.models.schema import KodeKlasifikasiArsip
        if not await db.get(KodeKlasifikasiArsip, arsip_in.id_klasifikasi):
            raise HTTPException(422, 'Kode klasifikasi arsip tidak ditemukan')
    created_obj = await arsip.create(db, obj_in=arsip_in)
    return await arsip.get_by_id(db, created_obj.id_dokumen)

@router.get("/{id_dokumen}", response_model=DokumenArsipResponse)
async def read_arsip_by_id(
    *,
    current_user: Pegawai = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    id_dokumen: int,
) -> Any:
    """
    Get archive document by id.
    """
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Dokumen arsip tidak ditemukan")
    if db_obj.hak_akses not in ('internal', 'publik') and not is_admin(current_user) and db_obj.id_pegawai != current_user.id_pegawai and not (db_obj.hak_akses == 'terbatas' and current_user.id_bagian is not None and db_obj.pegawai and db_obj.pegawai.id_bagian == current_user.id_bagian):
        raise HTTPException(403, 'Dokumen terbatas')
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

    if any(k in arsip_in.model_fields_set for k in ['id_pegawai', 'status_hapus', 'file_path']):
        raise HTTPException(422, 'Pemilik, berkas dan status sampah harus dikelola melalui tindakan khusus')
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
            and db_obj.hak_akses in ("internal", "publik")
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

@router.delete("/{id_dokumen}/permanent")
async def permanent_delete_arsip(
    *,
    db: AsyncSession = Depends(get_db),
    id_dokumen: int,
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    """
    Permanently delete archive document from database (Hard Delete).
    Allowed if the document is already in trash.
    """
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Dokumen arsip tidak ditemukan")
    if not db_obj.status_hapus:
        raise HTTPException(409, "Pindahkan dokumen ke tempat sampah sebelum menghapus permanen")
    if not is_admin(current_user):
        raise HTTPException(403, "Hapus permanen memerlukan persetujuan administrator. Gunakan \"Ajukan Hapus Permanen\".")
    if db_obj.ref_tipe:
        # Synced documents would be re-created by the next sync; they stay in the trash instead.
        raise HTTPException(409, "Dokumen ini berasal dari modul Surat Menyurat/Realisasi Anggaran dan hanya dapat dipindahkan ke tempat sampah")

    deleted_obj = await arsip.permanent_delete(db, id_dokumen=id_dokumen)
    return {"status": "success", "message": f"Dokumen {id_dokumen} berhasil dihapus permanen"}


@router.post("/{id_dokumen}/ajukan-hapus", response_model=DokumenArsipResponse)
async def ajukan_hapus_permanen(
    *,
    db: AsyncSession = Depends(get_db),
    id_dokumen: int,
    payload: PermintaanHapusRequest,
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    """Request permanent deletion of a trashed document; an administrator must approve it."""
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Dokumen arsip tidak ditemukan")
    if not db_obj.status_hapus:
        raise HTTPException(409, "Pindahkan dokumen ke tempat sampah sebelum mengajukan hapus permanen")
    if db_obj.ref_tipe:
        raise HTTPException(409, "Dokumen ini berasal dari modul Surat Menyurat/Realisasi Anggaran dan tidak dapat dihapus permanen")
    if not is_admin(current_user) and current_user.id_pegawai not in (db_obj.id_pegawai, db_obj.dihapus_oleh):
        raise HTTPException(403, "Hanya pemilik dokumen atau yang memindahkannya ke tempat sampah yang dapat mengajukan")
    if db_obj.hapus_status == "diajukan":
        raise HTTPException(409, "Permintaan hapus permanen sudah diajukan dan menunggu persetujuan administrator")
    db_obj.hapus_status = "diajukan"
    db_obj.pengaju_hapus = current_user  # sets hapus_diajukan_oleh and the name shown to admins
    db_obj.hapus_diajukan_pada = datetime.now()
    db_obj.hapus_alasan = payload.alasan.strip()
    db_obj.hapus_catatan_admin = None
    await db.commit()
    return await arsip.get_by_id(db, id_dokumen=id_dokumen)


@router.post("/{id_dokumen}/tolak-hapus", response_model=DokumenArsipResponse)
async def tolak_hapus_permanen(
    *,
    db: AsyncSession = Depends(get_db),
    id_dokumen: int,
    payload: TolakHapusRequest,
    current_user: Pegawai = Depends(require_admin),
) -> Any:
    """Administrator rejects a permanent-deletion request; the document stays in the trash."""
    db_obj = await arsip.get_by_id(db, id_dokumen=id_dokumen)
    if not db_obj:
        raise HTTPException(status_code=404, detail="Dokumen arsip tidak ditemukan")
    if db_obj.hapus_status != "diajukan":
        raise HTTPException(409, "Tidak ada permintaan hapus permanen yang menunggu untuk dokumen ini")
    db_obj.hapus_status = "ditolak"
    db_obj.hapus_catatan_admin = payload.catatan.strip()
    await db.commit()
    return await arsip.get_by_id(db, id_dokumen=id_dokumen)
