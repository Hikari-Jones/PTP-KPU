from typing import Optional
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
            options={"require_exp": True, "require_sub": True},
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token tidak valid atau sudah kedaluwarsa",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    token_id = payload.get("id")
    token_nip = payload.get("sub")
    if type(token_id) is not int or not isinstance(token_nip, str):
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

    if not user or not user.is_active or user.nip != token_nip or payload.get("sv") != user.session_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Pengguna token tidak ditemukan di database",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user

def is_admin(user: Pegawai) -> bool:
    """Check if the user has Administrator privileges based on database role."""
    return user.role.strip().lower() in ["admin", "administrator"]


def is_letter_manager(user: Pegawai) -> bool:
    """
    Check if user has tata persuratan management privileges (Administrator or Subbagian Umum/Logistik).
    Regular staff can still draft letters for their own section and view their own/assigned records.
    """
    if not user:
        return False
    if is_admin(user):
        return True
    bagian = getattr(user, "bagian", None)
    if bagian:
        kode = (bagian.kode_bagian or "").strip().upper()
        nama = (bagian.nama_bagian or "").strip().lower()
        if kode in ("BAG-05", "ADMIN"):
            return True
        if "umlog" in nama or "umum" in nama or "tata usaha" in nama:
            return True
    jabatan = (getattr(user, "jabatan", None) or "").strip().lower()
    if "kasubbag umum" in jabatan or "sekretaris" in jabatan:
        return True
    return False

def is_rendatin_or_keuangan(user: Pegawai) -> bool:
    """
    Check if user belongs to RENDATIN or Keuangan subsection.
    System Administrators (id_bagian == 1 or ADMIN) also qualify.
    """
    if not user:
        return False
    bagian = getattr(user, "bagian", None)
    if is_admin(user) and (not bagian or (bagian.kode_bagian or "").strip().upper() == "ADMIN"):
        return True
    if not bagian:
        return False
    kode = (bagian.kode_bagian or "").strip().upper()
    nama = (bagian.nama_bagian or "").strip().lower()
    if kode in ["BAG-02", "BAG-06", "ADMIN"]:
        return True
    if "rendatin" in nama or "perencanaan" in nama:
        return True
    if "keuangan" in nama and "umlog" not in nama and "umum dan logistik" not in nama:
        return True
    return False

def get_effective_subbagian_id(user: Pegawai, requested_subbagian_id: Optional[int] = None) -> Optional[int]:
    """
    Enforces subsection data isolation:
    - RENDATIN and Keuangan (and system admin) can view all or filter by requested_subbagian_id.
    - All other subsections (Teknis, Hukum, SDM, UMLOG, etc.) are strictly locked to their OWN id_bagian.
      If a non-finance account has no id_bagian (e.g. unmapped Kepala Bagian), returns -1 so queries
      return empty rather than leaking all departments' financial records.
    """
    if is_rendatin_or_keuangan(user):
        return requested_subbagian_id
    return user.id_bagian if user.id_bagian is not None else -1

async def require_rendatin_or_keuangan(
    current_user: Pegawai = Depends(get_current_user),
) -> Pegawai:
    """
    Strict dependency: Only RENDATIN and Keuangan personnel (or system admin) are allowed.
    Other subsections (Teknis, Hukum, SDM, UMLOG, etc.) are rejected with HTTP 403.
    """
    if not is_rendatin_or_keuangan(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak: Operasi administrasi keuangan hanya diizinkan untuk Subbagian Keuangan dan RENDATIN",
        )
    return current_user

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
