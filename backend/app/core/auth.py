from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.config import settings
from app.models.schema import Pegawai

bearer_scheme = HTTPBearer(auto_error=False)

async def get_current_user(
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> Pegawai:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer token diperlukan",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=["HS256"],
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token tidak valid atau sudah kedaluwarsa",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    token_id = payload.get("id")
    token_nip = payload.get("sub")
    if not isinstance(token_id, int) and not isinstance(token_nip, str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Klaim identitas token tidak valid",
            headers={"WWW-Authenticate": "Bearer"},
        )

    identity_filter = (
        Pegawai.id_pegawai == token_id
        if isinstance(token_id, int)
        else Pegawai.nip == token_nip
    )
    stmt = select(Pegawai).options(selectinload(Pegawai.bagian)).where(identity_filter)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Pengguna token tidak ditemukan di database",
            headers={"WWW-Authenticate": "Bearer"},
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
