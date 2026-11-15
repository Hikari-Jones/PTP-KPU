from app.core.auth import get_current_user, require_admin
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.pegawai import PegawaiCreate, PegawaiUpdate, PegawaiResponse
from app.services.pegawai import pegawai

router = APIRouter(dependencies=[Depends(get_current_user)])

@router.get("/", response_model=List[PegawaiResponse])
async def read_pegawai(
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
) -> Any:
    """
    Retrieve all pegawai.
    """
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
