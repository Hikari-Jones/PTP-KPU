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
    email: str
    role: str
    jabatan: str
    subbagian: str
    id_bagian: Optional[int] = None

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfileOut

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
    subbagian_nama = "Sekretariat KPU Sulut"
    if user.id_bagian:
        b_res = await db.execute(select(Bagian).where(Bagian.id_bagian == user.id_bagian))
        bagian = b_res.scalar_one_or_none()
        if bagian:
            subbagian_nama = bagian.nama_bagian

    norm_role = "Admin" if (user.role and user.role.lower() in ["admin", "administrator"]) else "Pegawai"
    user_out = UserProfileOut(
        id_pegawai=user.id_pegawai,
        name=user.nama,
        nip=user.nip or nip_clean,
        email=f"{nip_clean.lower()}@kpu.go.id",
        role=norm_role,
        jabatan=user.jabatan or "Staf KPU",
        subbagian=subbagian_nama,
        id_bagian=user.id_bagian
    )

    token = create_access_token({"sub": user.nip, "role": norm_role, "id": user.id_pegawai, "sv": user.session_version})
    return LoginResponse(access_token=token, user=user_out)

@router.get("/me", response_model=UserProfileOut)
async def get_me(current_user: Pegawai = Depends(get_current_user)):
    return UserProfileOut(
        id_pegawai=current_user.id_pegawai,
        name=current_user.nama,
        nip=current_user.nip or "",
        email=f"{(current_user.nip or '').lower()}@kpu.go.id",
        role="Admin" if current_user.role.lower() in ["admin", "administrator"] else "Pegawai",
        jabatan=current_user.jabatan or "",
        subbagian=current_user.bagian.nama_bagian if current_user.bagian else "",
        id_bagian=current_user.id_bagian,
    )


@router.post("/logout")
async def logout(db: AsyncSession = Depends(get_db), user: Pegawai = Depends(get_current_user)):
    from sqlalchemy import update
    await db.execute(update(Pegawai).where(Pegawai.id_pegawai == user.id_pegawai).values(session_version=Pegawai.session_version + 1))
    await db.commit()
    return {"message": "Semua sesi pengguna telah diakhiri"}
