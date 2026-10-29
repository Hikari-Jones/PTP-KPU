from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from jose import jwt

from app.core.config import settings
from app.core.database import get_db
from app.models.schema import Pegawai, Bagian

router = APIRouter()

class LoginRequest(BaseModel):
    nip: str
    password: str

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
    
    # Check fallback demo accounts if DB not yet fully seeded
    if not user:
        if nip_clean == "198507182020031001" and payload.password in ["admin123", "admin"]:
            user_profile = UserProfileOut(
                id_pegawai=1,
                name="Admin KPU Sulut",
                nip=nip_clean,
                email="admin@kpu.go.id",
                role="Admin",
                jabatan="Administrator Sistem",
                subbagian="RENDATIN (Perencanaan, Data dan Informasi)",
                id_bagian=1
            )
            token = create_access_token({"sub": nip_clean, "role": "Admin", "id": 1})
            return LoginResponse(access_token=token, user=user_profile)
        elif nip_clean == "199208052021011002" and payload.password in ["123456", "operator"]:
            user_profile = UserProfileOut(
                id_pegawai=2,
                name="Ahmad Kurniawan",
                nip=nip_clean,
                email="ahmad.kurniawan@kpu.go.id",
                role="Operator",
                jabatan="Staf Bidang Teknis Penyelenggaraan",
                subbagian="Teknis Penyelenggaraan Pemilu",
                id_bagian=2
            )
            token = create_access_token({"sub": nip_clean, "role": "Operator", "id": 2})
            return LoginResponse(access_token=token, user=user_profile)
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="NIP atau Kata Sandi tidak valid"
            )

    # Validate password (support both plain text and standard comparison)
    if user.password != payload.password and user.password != f"hash_{payload.password}":
        # Allow default testing passwords
        if payload.password not in ["123456", "admin123", "password"]:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="NIP atau Kata Sandi tidak valid"
            )

    # Fetch Bagian name
    subbagian_nama = "Sekretariat KPU Sulut"
    if user.id_bagian:
        b_res = await db.execute(select(Bagian).where(Bagian.id_bagian == user.id_bagian))
        bagian = b_res.scalar_one_or_none()
        if bagian:
            subbagian_nama = bagian.nama_bagian

    norm_role = "Admin" if (user.role and user.role.lower() == "admin") else "Operator"
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

    token = create_access_token({"sub": user.nip, "role": norm_role, "id": user.id_pegawai})
    return LoginResponse(access_token=token, user=user_out)

@router.get("/me", response_model=UserProfileOut)
async def get_me(db: AsyncSession = Depends(get_db)):
    # Return default admin for office testing
    return UserProfileOut(
        id_pegawai=1,
        name="Admin KPU Sulut",
        nip="198507182020031001",
        email="admin@kpu.go.id",
        role="Admin",
        jabatan="Administrator Sistem",
        subbagian="RENDATIN (Perencanaan, Data dan Informasi)",
        id_bagian=1
    )
