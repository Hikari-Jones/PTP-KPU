from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.pegawai import PegawaiCreate, PegawaiUpdate, PegawaiResponse
from app.services.pegawai import pegawai

router = APIRouter()

@router.get("/", response_model=List[PegawaiResponse])
async def read_pegawai(
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Retrieve all pegawai.
    """
    return await pegawai.get_multi(db, skip=skip, limit=limit)

@router.post("/", response_model=PegawaiResponse, status_code=status.HTTP_201_CREATED)
async def create_pegawai(
    *,
    db: AsyncSession = Depends(get_db),
    pegawai_in: PegawaiCreate,
) -> Any:
    """
    Create new pegawai.
    """
    return await pegawai.create(db, obj_in=pegawai_in)

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

@router.put("/{id_pegawai}", response_model=PegawaiResponse)
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
    return await pegawai.update(db, db_obj=db_pegawai, obj_in=pegawai_in)

@router.delete("/{id_pegawai}", response_model=PegawaiResponse)
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
    return await pegawai.remove(db, id=id_pegawai)
