from app.core.passwords import PREFIX, hash_password, verify_password
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
from jose import jwt

from app.core.config import settings
from app.core.database import get_db
from app.models.schema import Pegawai, Bagian
from app.core.auth import get_current_user

router = APIRouter()

class LoginRequest(BaseModel):
    nip: str = Field(min_length=1, max_length=30)
    password: str = Field(min_length=1, max_length=255)

class UserProfileOut(BaseModel):
    id_pegawai: int
    name: str
    nip: str
    # No e-mail is stored for employees; never invent one.
    email: Optional[str] = None
    role: str
    jabatan: str
    subbagian: str
    id_bagian: Optional[int] = None

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfileOut

def _profile(user: Pegawai, bagian_name: str) -> UserProfileOut:
    """The user's profile exactly as stored; empty values stay empty."""
    return UserProfileOut(
        id_pegawai=user.id_pegawai,
        name=user.nama,
        nip=user.nip or "",
        role="Admin" if (user.role or "").lower() in ["admin", "administrator"] else "Pegawai",
        jabatan=user.jabatan or "",
        subbagian=bagian_name,
        id_bagian=user.id_bagian,
    )

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")

@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    nip_clean = payload.nip.strip()
    
    # Query pegawai
    res = await db.execute(select(Pegawai).where(Pegawai.nip == nip_clean))
    user = res.scalar_one_or_none()
    
    if not user or not user.is_active or not verify_password(payload.password, user.password):
        raise HTTPException(status_code=401, detail="NIP atau Kata Sandi tidak valid")
    if not user.password.startswith(PREFIX + "$"):
        user.password = hash_password(payload.password)
        await db.commit()

    # Fetch Bagian name
    subbagian_nama = ""
    if user.id_bagian:
        b_res = await db.execute(select(Bagian).where(Bagian.id_bagian == user.id_bagian))
        bagian = b_res.scalar_one_or_none()
        if bagian:
            subbagian_nama = bagian.nama_bagian

    norm_role = "Admin" if (user.role and user.role.lower() in ["admin", "administrator"]) else "Pegawai"
    user_out = _profile(user, subbagian_nama)

    token = create_access_token({"sub": user.nip, "role": norm_role, "id": user.id_pegawai, "sv": user.session_version})
    return LoginResponse(access_token=token, user=user_out)

@router.get("/me", response_model=UserProfileOut)
async def get_me(current_user: Pegawai = Depends(get_current_user)):
    return _profile(current_user, current_user.bagian.nama_bagian if current_user.bagian else "")


@router.post("/logout")
async def logout(db: AsyncSession = Depends(get_db), user: Pegawai = Depends(get_current_user)):
    from sqlalchemy import update
    await db.execute(update(Pegawai).where(Pegawai.id_pegawai == user.id_pegawai).values(session_version=Pegawai.session_version + 1))
    await db.commit()
    return {"message": "Semua sesi pengguna telah diakhiri"}
