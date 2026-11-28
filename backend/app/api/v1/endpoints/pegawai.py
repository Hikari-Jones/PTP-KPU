from app.core.auth import get_current_user, require_admin
from datetime import datetime
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.schema import Pegawai, PermintaanAkun
from app.schemas.pegawai import PegawaiCreate, PegawaiUpdate, PegawaiResponse
from app.services.pegawai import pegawai
from app.services.account_requests import ensure_permintaan_akun_table, ensure_is_online_column, resolve_bagian_for_kabag

router = APIRouter(dependencies=[Depends(get_current_user)])


class AccountRequestOut(BaseModel):
    id_request: int
    nama: str
    nip: str
    jabatan: str
    unit_bagian: str
    id_bagian: Optional[int] = None
    nama_subbagian: Optional[str] = None
    status: str
    catatan_admin: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class RejectRequestIn(BaseModel):
    catatan: Optional[str] = None


@router.get("/requests", response_model=List[AccountRequestOut], dependencies=[Depends(require_admin)])
async def list_account_requests(
    db: AsyncSession = Depends(get_db),
    status_filter: str = Query("pending", alias="status"),
) -> Any:
    """Ambil daftar permintaan pendaftaran akun baru untuk diverifikasi admin."""
    await ensure_permintaan_akun_table(db)
    await ensure_is_online_column(db)
    stmt = select(PermintaanAkun).order_by(desc(PermintaanAkun.created_at), desc(PermintaanAkun.id_request))
    if status_filter and status_filter.lower() != "all":
        stmt = stmt.where(PermintaanAkun.status == status_filter.lower())
    return (await db.execute(stmt)).scalars().all()


@router.post("/requests/{id_request}/accept", response_model=PegawaiResponse, dependencies=[Depends(require_admin)])
async def accept_account_request(
    *,
    db: AsyncSession = Depends(get_db),
    id_request: int,
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    """Terima permintaan akun baru dan aktifkan sebagai Pegawai."""
    await ensure_permintaan_akun_table(db)
    req = await db.get(PermintaanAkun, id_request)
    if not req:
        raise HTTPException(status_code=404, detail="Permintaan verifikasi akun tidak ditemukan")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail=f"Permintaan akun ini sudah diproses ({req.status})")

    existing = (await db.execute(select(Pegawai).where(Pegawai.nip == req.nip))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="NIP sudah terdaftar pada akun pegawai aktif/nonaktif")

    target_bagian_id = req.id_bagian
    if target_bagian_id is None:
        target_bagian_id = await resolve_bagian_for_kabag(db, req.unit_bagian)

    jabatan_final = req.jabatan
    if req.jabatan.strip().lower() == "kepala bagian" and req.unit_bagian:
        jabatan_final = f"Kepala {req.unit_bagian}" if not req.unit_bagian.lower().startswith("bagian") else f"Kepala {req.unit_bagian}"

    new_user = Pegawai(
        nama=req.nama,
        nip=req.nip,
        password=req.password,
        jabatan=jabatan_final,
        id_bagian=target_bagian_id,
        role="Pegawai",
        is_active=True,
    )
    db.add(new_user)

    req.status = "approved"
    req.reviewed_at = datetime.utcnow()
    req.reviewed_by = current_user.id_pegawai

    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.post("/requests/{id_request}/reject", response_model=AccountRequestOut, dependencies=[Depends(require_admin)])
async def reject_account_request(
    *,
    db: AsyncSession = Depends(get_db),
    id_request: int,
    payload: Optional[RejectRequestIn] = None,
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    """Tolak permintaan pendaftaran akun baru."""
    await ensure_permintaan_akun_table(db)
    req = await db.get(PermintaanAkun, id_request)
    if not req:
        raise HTTPException(status_code=404, detail="Permintaan verifikasi akun tidak ditemukan")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail=f"Permintaan akun ini sudah diproses ({req.status})")

    req.status = "rejected"
    req.catatan_admin = (payload.catatan.strip() if payload and payload.catatan else None)
    req.reviewed_at = datetime.utcnow()
    req.reviewed_by = current_user.id_pegawai
    await db.commit()
    await db.refresh(req)
    return req

@router.get("/", response_model=List[PegawaiResponse])
async def read_pegawai(
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
) -> Any:
    """
    Retrieve all pegawai.
    """
    await ensure_is_online_column(db)
    return await pegawai.get_multi(db, skip=skip, limit=limit)

@router.post("/", response_model=PegawaiResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def create_pegawai(
    *,
    db: AsyncSession = Depends(get_db),
    pegawai_in: PegawaiCreate,
) -> Any:
    """
    Create new pegawai.
    """
    from sqlalchemy.exc import IntegrityError
    try:
        return await pegawai.create(db, obj_in=pegawai_in)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, 'NIP sudah digunakan atau bagian tidak valid')

@router.get("/{id_pegawai}", response_model=PegawaiResponse)
async def read_pegawai_by_id(
    *,
    db: AsyncSession = Depends(get_db),
    id_pegawai: int,
) -> Any:
    """
    Get a specific pegawai by id.
    """
    db_pegawai = await pegawai.get(db, id=id_pegawai)
    if not db_pegawai:
        raise HTTPException(status_code=404, detail="Pegawai not found")
    return db_pegawai

@router.put("/{id_pegawai}", response_model=PegawaiResponse, dependencies=[Depends(require_admin)])
async def update_pegawai(
    *,
    db: AsyncSession = Depends(get_db),
    id_pegawai: int,
    pegawai_in: PegawaiUpdate,
) -> Any:
    """
    Update a pegawai.
    """
    db_pegawai = await pegawai.get(db, id=id_pegawai)
    if not db_pegawai:
        raise HTTPException(status_code=404, detail="Pegawai not found")
    if pegawai_in.is_active is False or (pegawai_in.role is not None and pegawai_in.role.lower() not in ['admin', 'administrator']):
        from sqlalchemy import select
        from app.models.schema import Pegawai
        # Lock all admin rows so concurrent demotions cannot remove the last admin.
        admins = (await db.scalars(select(Pegawai).where(Pegawai.role.in_(['admin', 'Admin', 'administrator'])).with_for_update())).all()
        active = [u for u in admins if u.is_active]
        if db_pegawai in active and len(active) <= 1:
            raise HTTPException(409, 'Administrator aktif terakhir tidak dapat dinonaktifkan')
    return await pegawai.update(db, db_obj=db_pegawai, obj_in=pegawai_in)

@router.delete("/{id_pegawai}", response_model=PegawaiResponse, dependencies=[Depends(require_admin)])
async def delete_pegawai(
    *,
    db: AsyncSession = Depends(get_db),
    id_pegawai: int,
) -> Any:
    """
    Delete a pegawai.
    """
    db_pegawai = await pegawai.get(db, id=id_pegawai)
    if not db_pegawai:
        raise HTTPException(status_code=404, detail="Pegawai not found")
    raise HTTPException(409, 'Nonaktifkan akun melalui pembaruan pengguna agar riwayat tetap terjaga')
