from app.core.auth import get_current_user, require_admin
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.bagian import BagianCreate, BagianUpdate, BagianResponse
from app.services.bagian import bagian

router = APIRouter(dependencies=[Depends(get_current_user)])

@router.get("/", response_model=List[BagianResponse])
async def read_bagian(
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
) -> Any:
    """
    Retrieve all bagian.
    """
    return await bagian.get_multi(db, skip=skip, limit=limit)

@router.post("/", response_model=BagianResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def create_bagian(
    *,
    db: AsyncSession = Depends(get_db),
    bagian_in: BagianCreate,
) -> Any:
    """
    Create new bagian.
    """
    return await bagian.create(db, obj_in=bagian_in)

@router.get("/{id_bagian}", response_model=BagianResponse)
async def read_bagian_by_id(
    *,
    db: AsyncSession = Depends(get_db),
    id_bagian: int,
) -> Any:
    """
    Get a specific bagian by id.
    """
    db_bagian = await bagian.get(db, id=id_bagian)
    if not db_bagian:
        raise HTTPException(status_code=404, detail="Bagian not found")
    return db_bagian

@router.put("/{id_bagian}", response_model=BagianResponse, dependencies=[Depends(require_admin)])
async def update_bagian(
    *,
    db: AsyncSession = Depends(get_db),
    id_bagian: int,
    bagian_in: BagianUpdate,
) -> Any:
    """
    Update a bagian.
    """
    db_bagian = await bagian.get(db, id=id_bagian)
    if not db_bagian:
        raise HTTPException(status_code=404, detail="Bagian not found")
    return await bagian.update(db, db_obj=db_bagian, obj_in=bagian_in)

@router.delete("/{id_bagian}", response_model=BagianResponse, dependencies=[Depends(require_admin)])
async def delete_bagian(
    *,
    db: AsyncSession = Depends(get_db),
    id_bagian: int,
) -> Any:
    """
    Delete a bagian.
    """
    db_bagian = await bagian.get(db, id=id_bagian)
    if not db_bagian:
        raise HTTPException(status_code=404, detail="Bagian not found")
    return await bagian.remove(db, id=id_bagian)
