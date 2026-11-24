from app.core.passwords import PREFIX, hash_password, verify_password
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel, Field
from jose import jwt

from app.core.config import settings
from app.core.database import get_db
from app.models.schema import Pegawai, Bagian, PermintaanAkun
from app.core.auth import get_current_user
from app.services.account_requests import ensure_permintaan_akun_table, ensure_is_online_column, get_unit_bagian_options

router = APIRouter()

class LoginRequest(BaseModel):
    nip: str = Field(min_length=1, max_length=30)
    password: str = Field(min_length=1, max_length=255)


class RegisterRequest(BaseModel):
    nama: str = Field(min_length=2, max_length=150)
    nip: str = Field(min_length=18, max_length=18, pattern=r"^\d{18}$")
    password: str = Field(min_length=8, max_length=255)
    jabatan: str = Field(min_length=2, max_length=100)
    unit_bagian: str = Field(min_length=2, max_length=150)
    id_bagian: Optional[int] = None


class RegisterResponse(BaseModel):
    id_request: int
    nama: str
    nip: str
    jabatan: str
    unit_bagian: str
    nama_subbagian: Optional[str] = None
    status: str
    message: str


class SubbagianOptionOut(BaseModel):
    id_bagian: int
    kode_bagian: str
    nama_bagian: str


class UnitBagianOptionOut(BaseModel):
    kode: str
    nama: str
    subbagian: List[SubbagianOptionOut]

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

@router.get("/unit-options", response_model=List[UnitBagianOptionOut])
async def get_unit_options(db: AsyncSession = Depends(get_db)):
    """Daftar 3 Unit Bagian dan masing-masing 2 Subbagian untuk form pendaftaran."""
    return await get_unit_bagian_options(db)


@router.get("/register-status", response_model=RegisterResponse)
async def get_register_status(nip: str, db: AsyncSession = Depends(get_db)):
    """Cek status verifikasi pengajuan akun berdasarkan NIP."""
    await ensure_permintaan_akun_table(db)
    nip_clean = nip.strip()
    req = (
        await db.execute(
            select(PermintaanAkun)
            .where(PermintaanAkun.nip == nip_clean)
            .order_by(desc(PermintaanAkun.id_request))
        )
    ).scalars().first()
    if not req:
        raise HTTPException(status_code=404, detail="Pengajuan akun tidak ditemukan.")

    msg = "Akun Anda sedang menunggu verifikasi Administrator."
    if req.status == "approved":
        msg = "Akun Anda telah disetujui oleh Administrator. Silakan masuk ke portal."
    elif req.status == "rejected":
        msg = "Pengajuan akun Anda ditolak oleh Administrator."

    return RegisterResponse(
        id_request=req.id_request,
        nama=req.nama,
        nip=req.nip,
        jabatan=req.jabatan,
        unit_bagian=req.unit_bagian,
        nama_subbagian=req.nama_subbagian,
        status=req.status,
        message=msg,
    )


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Ajukan pendaftaran akun baru (menunggu verifikasi administrator)."""
    await ensure_permintaan_akun_table(db)
    nip_clean = payload.nip.strip()
    nama_clean = payload.nama.strip()
    jabatan_clean = payload.jabatan.strip()
    unit_clean = payload.unit_bagian.strip()

    existing_user = (await db.execute(select(Pegawai).where(Pegawai.nip == nip_clean))).scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="NIP sudah terdaftar dalam sistem. Silakan masuk atau hubungi administrator.",
        )

    existing_pending = (
        await db.execute(
            select(PermintaanAkun).where(
                PermintaanAkun.nip == nip_clean,
                PermintaanAkun.status == "pending",
            )
        )
    ).scalar_one_or_none()
    if existing_pending:
        raise HTTPException(
            status_code=409,
            detail="Pengajuan akun untuk NIP ini sudah dikirim dan sedang menunggu verifikasi administrator.",
        )

    is_kabag = jabatan_clean.lower() == "kepala bagian"
    nama_subbagian: Optional[str] = None
    target_id_bagian: Optional[int] = None

    if not is_kabag:
        if payload.id_bagian is None:
            raise HTTPException(
                status_code=422,
                detail="Pilih subbagian sesuai unit bagian yang dipilih.",
            )
        b_res = await db.execute(select(Bagian).where(Bagian.id_bagian == payload.id_bagian))
        bagian_obj = b_res.scalar_one_or_none()
        if not bagian_obj:
            raise HTTPException(status_code=422, detail="Subbagian tidak ditemukan.")
        target_id_bagian = bagian_obj.id_bagian
        nama_subbagian = bagian_obj.nama_bagian

    req = PermintaanAkun(
        nama=nama_clean,
        nip=nip_clean,
        password=hash_password(payload.password),
        jabatan=jabatan_clean,
        unit_bagian=unit_clean,
        id_bagian=target_id_bagian,
        nama_subbagian=nama_subbagian,
        status="pending",
    )
    db.add(req)
    await db.commit()
    await db.refresh(req)

    return RegisterResponse(
        id_request=req.id_request,
        nama=req.nama,
        nip=req.nip,
        jabatan=req.jabatan,
        unit_bagian=req.unit_bagian,
        nama_subbagian=req.nama_subbagian,
        status=req.status,
        message="Pendaftaran berhasil dikirim dan sedang menunggu verifikasi Administrator.",
    )


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    await ensure_is_online_column(db)
    nip_clean = payload.nip.strip()
    
    # Query pegawai
    res = await db.execute(select(Pegawai).where(Pegawai.nip == nip_clean))
    user = res.scalar_one_or_none()
    
    if not user:
        await ensure_permintaan_akun_table(db)
        req_res = await db.execute(
            select(PermintaanAkun)
            .where(PermintaanAkun.nip == nip_clean)
            .order_by(desc(PermintaanAkun.id_request))
        )
        req = req_res.scalars().first()
        if req and verify_password(payload.password, req.password):
            if req.status == "pending":
                raise HTTPException(
                    status_code=403,
                    detail="Akun Anda sedang menunggu verifikasi Administrator. Silakan tunggu persetujuan Admin.",
                )
            if req.status == "rejected":
                raise HTTPException(
                    status_code=403,
                    detail="Pengajuan akun Anda ditolak oleh Administrator. Silakan hubungi Admin atau daftar ulang.",
                )
        raise HTTPException(status_code=401, detail="NIP atau Kata Sandi tidak valid")

    if not user.is_active or not verify_password(payload.password, user.password):
        raise HTTPException(status_code=401, detail="NIP atau Kata Sandi tidak valid")
    if not user.password.startswith(PREFIX + "$"):
        user.password = hash_password(payload.password)
    user.is_online = True
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
async def get_me(db: AsyncSession = Depends(get_db), current_user: Pegawai = Depends(get_current_user)):
    await ensure_is_online_column(db)
    if not current_user.is_online:
        current_user.is_online = True
        await db.commit()
    return _profile(current_user, current_user.bagian.nama_bagian if current_user.bagian else "")


@router.post("/logout")
async def logout(db: AsyncSession = Depends(get_db), user: Pegawai = Depends(get_current_user)):
    from sqlalchemy import update
    await ensure_is_online_column(db)
    await db.execute(
        update(Pegawai)
        .where(Pegawai.id_pegawai == user.id_pegawai)
        .values(session_version=Pegawai.session_version + 1, is_online=False)
    )
    await db.commit()
    return {"message": "Semua sesi pengguna telah diakhiri"}
