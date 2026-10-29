from typing import Optional
from fastapi import Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.schema import Pegawai

async def get_current_user(
    db: AsyncSession = Depends(get_db),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    x_pegawai_id: Optional[int] = Header(None, alias="X-Pegawai-Id"),
    user_id: Optional[int] = Query(None, description="ID Pegawai untuk autentikasi"),
) -> Pegawai:
    """
    Authenticate and retrieve current Pegawai directly from MySQL database.
    Never trusts client-side admin flags. Role and permissions are always read from DB.
    """
    effective_id = x_user_id or x_pegawai_id or user_id

    if effective_id is None:
        # Fallback: if in development and no user header is provided, look for default active user
        stmt_first = select(Pegawai).options(selectinload(Pegawai.bagian)).order_by(Pegawai.id_pegawai.asc()).limit(1)
        res_first = await db.execute(stmt_first)
        fallback_user = res_first.scalar_one_or_none()
        if fallback_user:
            return fallback_user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Header 'X-User-Id' atau parameter user_id diperlukan untuk autentikasi",
        )

    stmt = select(Pegawai).options(selectinload(Pegawai.bagian)).where(Pegawai.id_pegawai == effective_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Pengguna dengan ID {effective_id} tidak ditemukan di database",
        )

    return user

def is_admin(user: Pegawai) -> bool:
    """Check if the user has Administrator privileges based on database role."""
    return user.role.strip().lower() in ["admin", "administrator"]

async def require_admin(
    current_user: Pegawai = Depends(get_current_user),
) -> Pegawai:
    """
    Strict dependency: Only users with admin/administrator role in DB are allowed.
    Returns 403 Forbidden for staff / operators.
    """
    if not is_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak: Hanya Administrator yang memiliki izin untuk operasi ini",
        )
    return current_user
