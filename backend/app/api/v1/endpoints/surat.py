from datetime import datetime, date
import base64
import binascii
import hashlib
import hmac
import io
from pathlib import Path
from typing import List, Optional
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from docx import Document
from docx.shared import Pt
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.auth import get_current_user, is_admin, is_letter_manager, require_admin
from app.core.authority import has_authority_async
from app.core.config import settings
from app.core.database import get_db
from app.models.schema import (
    Bagian,
    Disposisi,
    DokumenArsip,
    FileRecord,
    JenisSurat,
    KodeKlasifikasiArsip,
    PaguAnggaran,
    Pegawai,
    PenomoranSequence,
    RiwayatStatusSurat,
    SuratKeluar,
    SuratTugas,
    SuratTugasPelaksana,
)
from app.services.arsip_sync import safe_sync

router = APIRouter()
BASE_DIR = Path(__file__).resolve().parents[4]

# ----------------- Pydantic Schemas -----------------


class KlasifikasiOut(BaseModel):
    id_klasifikasi: int
    kode_klasifikasi: str
    nama_klasifikasi: str
    kategori_utama: str
    deskripsi: Optional[str] = None
    retensi_aktif_tahun: int
    retensi_inaktif_tahun: int
    hak_akses: str

    class Config:
        from_attributes = True


class KlasifikasiCreate(BaseModel):
    kode_klasifikasi: str = Field(..., max_length=20)
    nama_klasifikasi: str = Field(..., max_length=200)
    kategori_utama: str = Field(..., max_length=100)
    deskripsi: Optional[str] = Field(None, max_length=255)
    retensi_aktif_tahun: int = Field(2, ge=0)
    retensi_inaktif_tahun: int = Field(5, ge=0)
    hak_akses: str = Field("Terbatas", max_length=50)


class KlasifikasiUpdate(BaseModel):
    nama_klasifikasi: Optional[str] = Field(None, max_length=200)
    kategori_utama: Optional[str] = Field(None, max_length=100)
    deskripsi: Optional[str] = Field(None, max_length=255)
    retensi_aktif_tahun: Optional[int] = Field(None, ge=0)
    retensi_inaktif_tahun: Optional[int] = Field(None, ge=0)
    hak_akses: Optional[str] = Field(None, max_length=50)


class JenisSuratOut(BaseModel):
    id_jenis_surat: int
    kode_jenis: str
    nama_jenis: str
    format_nomor: str

    class Config:
        from_attributes = True


class SuratKeluarCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    id_pegawai: int = 1
    id_bagian: int = 1
    id_klasifikasi: int = 1
    id_jenis_surat: int = 1
    tahun: Optional[int] = None
    bulan_romawi: Optional[str] = None
    sifat_surat: str = "Biasa"
    perihal: str = Field(min_length=1, max_length=255)
    tujuan_surat: str = Field(min_length=1, max_length=255)
    isi_surat: Optional[str] = None
    lampiran: Optional[str] = None
    tembusan: Optional[str] = None
    penandatangan_nama: Optional[str] = Field(None, max_length=150)
    penandatangan_jabatan: Optional[str] = Field(None, max_length=150)
    atas_nama: Optional[str] = Field(None, max_length=30)
    file_id: Optional[int] = None
    tanggal_surat: Optional[date] = None


class SuratKeluarUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    id_klasifikasi: Optional[int] = None
    id_jenis_surat: Optional[int] = None
    sifat_surat: Optional[str] = None
    perihal: Optional[str] = Field(None, min_length=1, max_length=255)
    tujuan_surat: Optional[str] = Field(None, min_length=1, max_length=255)
    isi_surat: Optional[str] = None
    lampiran: Optional[str] = None
    tembusan: Optional[str] = None
    penandatangan_nama: Optional[str] = Field(None, max_length=150)
    penandatangan_jabatan: Optional[str] = Field(None, max_length=150)
    atas_nama: Optional[str] = Field(None, max_length=30)
    file_id: Optional[int] = None
    tanggal_surat: Optional[date] = None


class FinalisasiRequest(BaseModel):
    catatan: Optional[str] = "Penerbitan nomor surat resmi"


class StatusTransitionRequest(BaseModel):
    catatan: Optional[str] = None


class DisposisiCreate(BaseModel):
    id_penerima: int
    instruksi: str
    id_parent: Optional[int] = None


class PelaksanaDetail(BaseModel):
    id_pegawai: int
    peran_tugas: str = Field("Pelaksana", min_length=1, max_length=100)


class SuratTugasCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    maksud_tugas: str = Field(min_length=3)
    dasar_tugas: Optional[str] = None
    tempat_tugas: str = Field(min_length=1, max_length=255)
    tanggal_mulai: date
    tanggal_selesai: date
    beban_anggaran: str = Field("DIPA KPU Provinsi Sulawesi Utara", max_length=255)
    id_pagu: Optional[int] = None
    id_klasifikasi: int
    id_bagian: Optional[int] = None
    pelaksana: Optional[List[int]] = None
    pelaksana_detail: Optional[List[PelaksanaDetail]] = None


class SuratTugasLaporanUpdate(BaseModel):
    file_id: int


# ----------------- Helpers -----------------


def _is_letter_manager(user: Pegawai) -> bool:
    return is_letter_manager(user)


def _compute_content_sha256(surat: SuratKeluar) -> str:
    canonical = "|".join([
        str(surat.id_surat_keluar),
        surat.nomor_surat or "",
        str(surat.tanggal_surat),
        surat.sifat_surat or "",
        surat.perihal or "",
        surat.tujuan_surat or "",
        surat.isi_surat or "",
        surat.tembusan or "",
        surat.atas_nama or "",
        surat.penandatangan_jabatan or "",
        surat.penandatangan_nama or "",
    ])
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _verification_code(surat: SuratKeluar) -> str:
    if not surat.nomor_surat:
        raise HTTPException(status_code=409, detail="Surat belum memiliki nomor resmi")
    payload = f"{surat.id_surat_keluar}:{surat.nomor_surat}"
    digest = hmac.new(
        settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256
    ).digest()
    return base64.urlsafe_b64encode(
        f"{payload}:{digest.hex()}".encode()
    ).decode().rstrip("=")


def _decode_verification_code(code: str) -> tuple[int, str] | None:
    try:
        raw = base64.urlsafe_b64decode(code + "=" * (-len(code) % 4)).decode()
        id_value, nomor, signature = raw.split(":", 2)
        payload = f"{id_value}:{nomor}"
        expected = hmac.new(
            settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        return int(id_value), nomor
    except (ValueError, UnicodeDecodeError, binascii.Error):
        return None


def _surat_keluar_out(item: SuratKeluar, *, include_verification: bool = False) -> dict:
    data = {
        "id_surat_keluar": item.id_surat_keluar,
        "id_pegawai": item.id_pegawai,
        "id_bagian": item.id_bagian,
        "id_klasifikasi": item.id_klasifikasi,
        "id_jenis_surat": item.id_jenis_surat,
        "nomor_surat": item.nomor_surat,
        "nomor_urut": item.nomor_urut,
        "tahun": item.tahun,
        "bulan_romawi": item.bulan_romawi,
        "sifat_surat": item.sifat_surat,
        "lampiran": item.lampiran,
        "perihal": item.perihal,
        "tujuan_surat": item.tujuan_surat,
        "isi_surat": item.isi_surat,
        "tembusan": item.tembusan,
        "penandatangan_nama": item.penandatangan_nama,
        "penandatangan_jabatan": item.penandatangan_jabatan,
        "atas_nama": item.atas_nama,
        "file_id": item.file_id,
        "content_sha256": item.content_sha256,
        "status": item.status,
        "tanggal_surat": str(item.tanggal_surat),
        "tanggal_terbit": str(item.tanggal_terbit) if item.tanggal_terbit else None,
        "created_at": str(item.created_at) if item.created_at else None,
    }
    if include_verification and item.nomor_surat:
        data["verification_code"] = _verification_code(item)
    return data


async def require_letter_access(db: AsyncSession, surat: SuratKeluar, user: Pegawai):
    if _is_letter_manager(user) or surat.id_pegawai == user.id_pegawai:
        return
    assigned = await db.scalar(
        select(Disposisi.id_disposisi)
        .where(
            Disposisi.id_surat_keluar == surat.id_surat_keluar,
            Disposisi.id_pegawai == user.id_pegawai,
        )
        .limit(1)
    )
    if assigned is not None:
        return
    # Also allow pelaksana of an attached SuratTugas to read/export it
    pelaksana = await db.scalar(
        select(SuratTugasPelaksana.id_pelaksana)
        .join(SuratTugas, SuratTugas.id_surat_tugas == SuratTugasPelaksana.id_surat_tugas)
        .where(
            SuratTugas.id_surat_keluar == surat.id_surat_keluar,
            SuratTugasPelaksana.id_pegawai == user.id_pegawai,
        )
        .limit(1)
    )
    if pelaksana is not None:
        return
    raise HTTPException(403, "Surat bukan milik atau disposisi pengguna")


async def _can_review_letter(db: AsyncSession, user: Pegawai) -> bool:
    if _is_letter_manager(user):
        return True
    if await has_authority_async(db, settings.AUTHORITY_GRANTS, user.id_pegawai, "sign_official_letter"):
        return True
    if await has_authority_async(db, settings.AUTHORITY_GRANTS, user.id_pegawai, "number_official_letter"):
        return True
    return False


# ----------------- Klasifikasi & Jenis Surat Endpoints -----------------


@router.get("/klasifikasi", response_model=List[KlasifikasiOut])
async def list_klasifikasi(
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    result = await db.execute(select(KodeKlasifikasiArsip).order_by(KodeKlasifikasiArsip.kode_klasifikasi))
    return result.scalars().all()


@router.post("/klasifikasi", response_model=KlasifikasiOut)
async def create_klasifikasi(
    payload: KlasifikasiCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
):
    normalized_kode = payload.kode_klasifikasi.strip().upper()
    existing = await db.scalar(
        select(KodeKlasifikasiArsip).where(KodeKlasifikasiArsip.kode_klasifikasi == normalized_kode)
    )
    if existing:
        raise HTTPException(400, f"Kode Klasifikasi '{normalized_kode}' sudah terdaftar")

    item = KodeKlasifikasiArsip(
        kode_klasifikasi=normalized_kode,
        nama_klasifikasi=payload.nama_klasifikasi.strip(),
        kategori_utama=payload.kategori_utama.strip(),
        deskripsi=payload.deskripsi,
        retensi_aktif_tahun=payload.retensi_aktif_tahun,
        retensi_inaktif_tahun=payload.retensi_inaktif_tahun,
        hak_akses=payload.hak_akses.strip(),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.put("/klasifikasi/{id_klasifikasi}", response_model=KlasifikasiOut)
async def update_klasifikasi(
    id_klasifikasi: int,
    payload: KlasifikasiUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
):
    item = await db.get(KodeKlasifikasiArsip, id_klasifikasi)
    if not item:
        raise HTTPException(404, "Kode klasifikasi tidak ditemukan")
    updates = payload.model_dump(exclude_unset=True)
    for key, val in updates.items():
        if isinstance(val, str):
            val = val.strip()
        setattr(item, key, val)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/klasifikasi/{id_klasifikasi}")
async def delete_klasifikasi(
    id_klasifikasi: int,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
):
    item = await db.get(KodeKlasifikasiArsip, id_klasifikasi)
    if not item:
        raise HTTPException(404, "Kode klasifikasi tidak ditemukan")
    used_surat = await db.scalar(
        select(SuratKeluar.id_surat_keluar).where(SuratKeluar.id_klasifikasi == id_klasifikasi).limit(1)
    )
    used_arsip = await db.scalar(
        select(DokumenArsip.id_dokumen).where(DokumenArsip.id_klasifikasi == id_klasifikasi).limit(1)
    )
    if used_surat or used_arsip:
        raise HTTPException(409, "Kode klasifikasi masih digunakan oleh surat atau arsip dan tidak dapat dihapus")
    await db.delete(item)
    await db.commit()
    return {"message": f"Kode klasifikasi '{item.kode_klasifikasi}' berhasil dihapus", "id_klasifikasi": id_klasifikasi}


@router.get("/jenis-surat", response_model=List[JenisSuratOut])
async def list_jenis_surat(
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    result = await db.execute(select(JenisSurat).order_by(JenisSurat.id_jenis_surat))
    return result.scalars().all()


# ----------------- Surat Keluar Endpoints -----------------


@router.get("/surat-keluar")
async def list_surat_keluar(
    status_filter: Optional[str] = Query(None, alias="status"),
    tahun_filter: Optional[int] = Query(None, alias="tahun"),
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    query = select(SuratKeluar).order_by(SuratKeluar.id_surat_keluar.desc())
    if status_filter:
        query = query.where(SuratKeluar.status == status_filter)
    if tahun_filter:
        query = query.where(SuratKeluar.tahun == tahun_filter)

    if not _is_letter_manager(current_user):
        received = select(Disposisi.id_surat_keluar).where(Disposisi.id_pegawai == current_user.id_pegawai)
        st_mine = (
            select(SuratTugas.id_surat_keluar)
            .join(SuratTugasPelaksana, SuratTugasPelaksana.id_surat_tugas == SuratTugas.id_surat_tugas)
            .where(SuratTugasPelaksana.id_pegawai == current_user.id_pegawai)
        )
        query = query.where(
            or_(
                SuratKeluar.id_pegawai == current_user.id_pegawai,
                SuratKeluar.id_surat_keluar.in_(received),
                SuratKeluar.id_surat_keluar.in_(st_mine),
            )
        )
    result = await db.execute(query.offset(skip).limit(limit))
    items = result.scalars().all()
    return [_surat_keluar_out(item) for item in items]


@router.get("/surat-keluar/penerbitan-status")
async def penerbitan_status(
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    """Whether official numbering is switched on, and whether this user holds numbering/signing grants."""
    return {
        "official_issuance_enabled": settings.OFFICIAL_ISSUANCE_ENABLED,
        "has_numbering_authority": await has_authority_async(
            db, settings.AUTHORITY_GRANTS, current_user.id_pegawai, "number_official_letter"
        ),
        "has_signing_authority": await has_authority_async(
            db, settings.AUTHORITY_GRANTS, current_user.id_pegawai, "sign_official_letter"
        ),
        "is_letter_manager": _is_letter_manager(current_user),
    }


@router.get("/surat-keluar/{id_surat_keluar}")
async def get_surat_keluar_detail(
    id_surat_keluar: int,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    surat = await db.get(SuratKeluar, id_surat_keluar)
    if not surat:
        raise HTTPException(404, "Surat keluar tidak ditemukan")
    await require_letter_access(db, surat, current_user)
    return _surat_keluar_out(surat, include_verification=bool(surat.nomor_surat))


@router.post("/surat-keluar/draft", status_code=status.HTTP_201_CREATED)
async def create_draft_surat_keluar(
    payload: SuratKeluarCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    if not is_admin(current_user):
        if current_user.id_bagian is None:
            raise HTTPException(422, "Akun pegawai belum terhubung ke bagian/subbagian")
        if payload.id_bagian != current_user.id_bagian:
            raise HTTPException(403, "Anda hanya dapat membuat draft surat untuk bagian/subbagian Anda sendiri")
    target_bagian_id = payload.id_bagian if is_admin(current_user) else current_user.id_bagian

    tgl = payload.tanggal_surat or date.today()
    roman = ("I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII")[tgl.month - 1]
    if payload.tahun is not None and payload.tahun != tgl.year:
        raise HTTPException(422, "Tahun surat tidak sesuai tanggal")
    if payload.bulan_romawi is not None and payload.bulan_romawi != roman:
        raise HTTPException(422, "Bulan surat tidak sesuai tanggal")
    for model, ident in (
        (KodeKlasifikasiArsip, payload.id_klasifikasi),
        (JenisSurat, payload.id_jenis_surat),
        (Bagian, target_bagian_id),
    ):
        if not await db.get(model, ident):
            raise HTTPException(422, "Referensi bagian, klasifikasi atau jenis surat tidak ditemukan")

    if payload.file_id is not None:
        f = await db.get(FileRecord, payload.file_id)
        if not f or (f.uploaded_by != current_user.id_pegawai and not is_admin(current_user)):
            raise HTTPException(403, "Berkas lampiran tidak ditemukan atau bukan milik pengguna")

    surat = SuratKeluar(
        id_pegawai=current_user.id_pegawai,
        id_bagian=target_bagian_id,
        id_klasifikasi=payload.id_klasifikasi,
        id_jenis_surat=payload.id_jenis_surat,
        tahun=tgl.year,
        bulan_romawi=roman,
        sifat_surat=payload.sifat_surat,
        lampiran=payload.lampiran,
        perihal=payload.perihal,
        tujuan_surat=payload.tujuan_surat,
        isi_surat=payload.isi_surat,
        tembusan=payload.tembusan,
        penandatangan_nama=payload.penandatangan_nama,
        penandatangan_jabatan=payload.penandatangan_jabatan,
        atas_nama=payload.atas_nama,
        file_id=payload.file_id,
        status="draft",
        tanggal_surat=tgl,
    )
    db.add(surat)
    await db.flush()
    db.add(
        RiwayatStatusSurat(
            id_surat_keluar=surat.id_surat_keluar,
            id_pegawai=current_user.id_pegawai,
            status_lama=None,
            status_baru="draft",
            catatan="Pembuatan draf surat keluar",
        )
    )
    await db.commit()
    await safe_sync(db, "surat_keluar", surat.id_surat_keluar)
    await db.refresh(surat)
    return _surat_keluar_out(surat)


@router.put("/surat-keluar/{id_surat_keluar}")
async def update_draft_surat_keluar(
    id_surat_keluar: int,
    payload: SuratKeluarUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    surat = await db.get(SuratKeluar, id_surat_keluar)
    if not surat:
        raise HTTPException(404, "Surat keluar tidak ditemukan")
    if surat.id_pegawai != current_user.id_pegawai and not _is_letter_manager(current_user):
        raise HTTPException(403, "Hanya pembuat surat atau pengelola persuratan yang dapat mengubah draf")
    if surat.status not in ("draft", "revisi"):
        raise HTTPException(409, f"Surat berstatus '{surat.status}' tidak dapat diubah")

    updates = payload.model_dump(exclude_unset=True)
    if "id_klasifikasi" in updates and updates["id_klasifikasi"] is not None:
        if not await db.get(KodeKlasifikasiArsip, updates["id_klasifikasi"]):
            raise HTTPException(422, "Kode klasifikasi tidak ditemukan")
    if "id_jenis_surat" in updates and updates["id_jenis_surat"] is not None:
        if not await db.get(JenisSurat, updates["id_jenis_surat"]):
            raise HTTPException(422, "Jenis surat tidak ditemukan")
    if "file_id" in updates and updates["file_id"] is not None:
        f = await db.get(FileRecord, updates["file_id"])
        if not f or (f.uploaded_by != current_user.id_pegawai and not is_admin(current_user)):
            raise HTTPException(403, "Berkas lampiran tidak ditemukan atau bukan milik pengguna")

    for key, val in updates.items():
        setattr(surat, key, val)

    if "tanggal_surat" in updates and updates["tanggal_surat"] is not None:
        tgl = updates["tanggal_surat"]
        surat.tahun = tgl.year
        surat.bulan_romawi = ("I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII")[tgl.month - 1]

    await db.commit()
    await safe_sync(db, "surat_keluar", surat.id_surat_keluar)
    await db.refresh(surat)
    return _surat_keluar_out(surat)


@router.delete("/surat-keluar/{id_surat_keluar}")
async def delete_draft_surat_keluar(
    id_surat_keluar: int,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    surat = await db.get(SuratKeluar, id_surat_keluar)
    if not surat:
        raise HTTPException(404, "Surat keluar tidak ditemukan")
    if surat.id_pegawai != current_user.id_pegawai and not _is_letter_manager(current_user):
        raise HTTPException(403, "Hanya pembuat surat atau pengelola persuratan yang dapat menghapus draf")
    if surat.status not in ("draft", "revisi"):
        raise HTTPException(409, f"Surat berstatus '{surat.status}' tidak dapat dihapus")

    mirrored = (
        await db.scalars(
            select(DokumenArsip).where(
                DokumenArsip.ref_tipe == "surat_keluar",
                DokumenArsip.ref_id == id_surat_keluar,
            )
        )
    ).all()
    for doc in mirrored:
        await db.delete(doc)

    await db.delete(surat)
    await db.commit()
    return {"message": "Draf surat keluar berhasil dihapus", "id_surat_keluar": id_surat_keluar}


@router.post("/surat-keluar/{id_surat_keluar}/ajukan")
async def ajukan_surat_keluar(
    id_surat_keluar: int,
    payload: StatusTransitionRequest = StatusTransitionRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    surat = await db.get(SuratKeluar, id_surat_keluar)
    if not surat:
        raise HTTPException(404, "Surat keluar tidak ditemukan")
    if surat.id_pegawai != current_user.id_pegawai and not _is_letter_manager(current_user):
        raise HTTPException(403, "Hanya pembuat surat atau pengelola persuratan yang dapat mengajukan draf")
    if surat.status not in ("draft", "revisi"):
        raise HTTPException(409, f"Surat berstatus '{surat.status}' tidak dapat diajukan")

    old_status = surat.status
    surat.status = "diajukan"
    db.add(
        RiwayatStatusSurat(
            id_surat_keluar=surat.id_surat_keluar,
            id_pegawai=current_user.id_pegawai,
            status_lama=old_status,
            status_baru="diajukan",
            catatan=payload.catatan or "Diajukan untuk pemeriksaan / paraf berjenjang",
        )
    )
    await db.commit()
    await db.refresh(surat)
    return _surat_keluar_out(surat)


@router.post("/surat-keluar/{id_surat_keluar}/revisi")
async def revisi_surat_keluar(
    id_surat_keluar: int,
    payload: StatusTransitionRequest = StatusTransitionRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    surat = await db.get(SuratKeluar, id_surat_keluar)
    if not surat:
        raise HTTPException(404, "Surat keluar tidak ditemukan")
    if not await _can_review_letter(db, current_user):
        raise HTTPException(403, "Hanya pemeriksa persuratan (Admin/UMLOG/pejabat berwenang) yang dapat mengembalikan revisi")
    if surat.status not in ("diajukan", "disetujui"):
        raise HTTPException(409, f"Surat berstatus '{surat.status}' tidak dapat dikembalikan untuk revisi")

    old_status = surat.status
    surat.status = "revisi"
    db.add(
        RiwayatStatusSurat(
            id_surat_keluar=surat.id_surat_keluar,
            id_pegawai=current_user.id_pegawai,
            status_lama=old_status,
            status_baru="revisi",
            catatan=payload.catatan or "Dikembalikan untuk perbaikan",
        )
    )
    await db.commit()
    await db.refresh(surat)
    return _surat_keluar_out(surat)


@router.post("/surat-keluar/{id_surat_keluar}/setujui")
async def setujui_surat_keluar(
    id_surat_keluar: int,
    payload: StatusTransitionRequest = StatusTransitionRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    surat = await db.get(SuratKeluar, id_surat_keluar)
    if not surat:
        raise HTTPException(404, "Surat keluar tidak ditemukan")
    if not await _can_review_letter(db, current_user):
        raise HTTPException(403, "Hanya pemeriksa persuratan (Admin/UMLOG/pejabat berwenang) yang dapat menyetujui/paraf")
    if surat.status != "diajukan":
        raise HTTPException(409, f"Surat berstatus '{surat.status}' tidak dapat disetujui; ajukan terlebih dahulu")

    old_status = surat.status
    surat.status = "disetujui"
    db.add(
        RiwayatStatusSurat(
            id_surat_keluar=surat.id_surat_keluar,
            id_pegawai=current_user.id_pegawai,
            status_lama=old_status,
            status_baru="disetujui",
            catatan=payload.catatan or "Disetujui / paraf pemeriksaan internal",
        )
    )
    await db.commit()
    await db.refresh(surat)
    return _surat_keluar_out(surat)


@router.post("/surat-keluar/{id_surat_keluar}/arsipkan")
async def arsipkan_surat_keluar(
    id_surat_keluar: int,
    payload: StatusTransitionRequest = StatusTransitionRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    surat = await db.get(SuratKeluar, id_surat_keluar)
    if not surat:
        raise HTTPException(404, "Surat keluar tidak ditemukan")
    if surat.id_pegawai != current_user.id_pegawai and not _is_letter_manager(current_user):
        raise HTTPException(403, "Hanya pembuat surat atau pengelola persuratan yang dapat mengarsipkan surat")
    if surat.status != "terbit":
        raise HTTPException(409, f"Hanya surat berstatus 'terbit' yang dapat diarsipkan (status saat ini: '{surat.status}')")

    surat.status = "diarsipkan"
    db.add(
        RiwayatStatusSurat(
            id_surat_keluar=surat.id_surat_keluar,
            id_pegawai=current_user.id_pegawai,
            status_lama="terbit",
            status_baru="diarsipkan",
            catatan=payload.catatan or "Surat ditandai selesai dan diarsipkan",
        )
    )
    await db.commit()
    await safe_sync(db, "surat_keluar", surat.id_surat_keluar)
    await db.refresh(surat)
    return _surat_keluar_out(surat, include_verification=True)


@router.get("/surat-keluar/{id_surat_keluar}/riwayat")
async def list_riwayat_surat(
    id_surat_keluar: int,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    surat = await db.get(SuratKeluar, id_surat_keluar)
    if not surat:
        raise HTTPException(404, "Surat keluar tidak ditemukan")
    await require_letter_access(db, surat, current_user)
    rows = (
        await db.execute(
            select(RiwayatStatusSurat, Pegawai.nama)
            .join(Pegawai, Pegawai.id_pegawai == RiwayatStatusSurat.id_pegawai, isouter=True)
            .where(RiwayatStatusSurat.id_surat_keluar == id_surat_keluar)
            .order_by(RiwayatStatusSurat.id_riwayat.asc())
        )
    ).all()
    return [
        {
            "id_riwayat": r.id_riwayat,
            "id_surat_keluar": r.id_surat_keluar,
            "id_pegawai": r.id_pegawai,
            "nama_pegawai": nama or f"Pegawai #{r.id_pegawai}",
            "status_lama": r.status_lama,
            "status_baru": r.status_baru,
            "catatan": r.catatan,
            "waktu": str(r.waktu) if r.waktu else None,
        }
        for r, nama in rows
    ]


def _format_official_number(
    *,
    format_nomor: Optional[str],
    next_num: int,
    kode_klas: str,
    kode_jenis: str,
    kode_bagian: str,
    bulan_romawi: str,
    tahun: int,
) -> str:
    num_str = str(next_num).zfill(3)
    template = (format_nomor or "").strip() or "{nomor_urut}/{kode_klasifikasi}-{kode_jenis}/71/{bulan_romawi}/{tahun}"
    values = {
        "nomor_urut": num_str,
        "kode_klasifikasi": kode_klas,
        "kode_jenis": kode_jenis,
        "kode_bagian": kode_bagian,
        "bulan_romawi": bulan_romawi,
        "tahun": str(tahun),
    }
    try:
        return template.format(**values)
    except (KeyError, ValueError):
        return f"{num_str}/{kode_klas}-{kode_jenis}/71/{bulan_romawi}/{tahun}"


@router.post("/surat-keluar/{id_surat_keluar}/finalisasi")
async def finalisasi_surat_atomic(
    id_surat_keluar: int,
    payload: FinalisasiRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    # Official issuance remains disabled until templates, numbering and signing
    # integration have been validated by the office. A technical admin is not a signatory.
    if not settings.OFFICIAL_ISSUANCE_ENABLED:
        raise HTTPException(
            409,
            "Penerbitan resmi belum diaktifkan: validasi format, nomor, dan kewenangan penandatangan diperlukan",
        )
    if not await has_authority_async(db, settings.AUTHORITY_GRANTS, current_user.id_pegawai, "number_official_letter"):
        raise HTTPException(403, "Penugasan penomoran resmi belum dikonfigurasi atau kedaluwarsa")
    res = await db.execute(
        select(SuratKeluar)
        .options(selectinload(SuratKeluar.surat_tugas))
        .where(SuratKeluar.id_surat_keluar == id_surat_keluar)
        .with_for_update()
    )
    surat = res.scalar_one_or_none()
    if not surat:
        raise HTTPException(status_code=404, detail="Surat keluar tidak ditemukan")

    if surat.status == "terbit":
        data = _surat_keluar_out(surat, include_verification=True)
        data["message"] = "Surat sudah berstatus terbit resmi"
        return data
    if surat.status not in ("draft", "disetujui"):
        raise HTTPException(
            status_code=409,
            detail=f"Surat berstatus '{surat.status}' tidak dapat diterbitkan nomor resminya",
        )

    previous_status = surat.status

    jenis = await db.get(JenisSurat, surat.id_jenis_surat)
    klas = await db.get(KodeKlasifikasiArsip, surat.id_klasifikasi)
    bagian = await db.get(Bagian, surat.id_bagian)
    kode_klas = klas.kode_klasifikasi if klas else "PL.01"
    kode_j = jenis.kode_jenis if jenis else "SD"
    kode_bag = (bagian.kode_bagian if bagian else None) or f"BAG-{surat.id_bagian}"
    template = jenis.format_nomor if jenis else None
    per_bagian = bool(template and "{kode_bagian}" in template)
    seq_bagian_id = surat.id_bagian if per_bagian else None

    seq_stmt = (
        select(PenomoranSequence)
        .where(
            PenomoranSequence.tahun == surat.tahun,
            PenomoranSequence.id_jenis_surat == surat.id_jenis_surat,
            PenomoranSequence.id_bagian == seq_bagian_id if seq_bagian_id is not None else PenomoranSequence.id_bagian.is_(None),
        )
        .order_by(PenomoranSequence.id_sequence.asc())
        .with_for_update()
    )
    seq = (await db.execute(seq_stmt)).scalars().first()

    if not seq:
        seq = PenomoranSequence(
            tahun=surat.tahun,
            id_jenis_surat=surat.id_jenis_surat,
            id_bagian=seq_bagian_id,
            last_number=1,
        )
        db.add(seq)
        next_num = 1
    else:
        seq.last_number += 1
        next_num = seq.last_number

    nomor_resmi = _format_official_number(
        format_nomor=template,
        next_num=next_num,
        kode_klas=kode_klas,
        kode_jenis=kode_j,
        kode_bagian=kode_bag,
        bulan_romawi=surat.bulan_romawi,
        tahun=surat.tahun,
    )

    surat.nomor_urut = next_num
    surat.nomor_surat = nomor_resmi
    surat.status = "terbit"
    surat.tanggal_terbit = datetime.now()
    surat.content_sha256 = _compute_content_sha256(surat)

    if surat.surat_tugas is not None:
        surat.surat_tugas.nomor_tugas = nomor_resmi

    riwayat = RiwayatStatusSurat(
        id_surat_keluar=surat.id_surat_keluar,
        id_pegawai=current_user.id_pegawai,
        status_lama=previous_status,
        status_baru="terbit",
        catatan=payload.catatan or "Penerbitan nomor resmi atomic",
    )
    db.add(riwayat)

    await db.commit()
    await safe_sync(db, "surat_keluar", surat.id_surat_keluar)
    await db.refresh(surat)
    return _surat_keluar_out(surat, include_verification=True)


# ----------------- Disposisi (Surat Keluar) -----------------


@router.post("/surat-keluar/{id_surat_keluar}/disposisi", status_code=status.HTTP_201_CREATED)
async def create_disposisi(
    id_surat_keluar: int,
    payload: DisposisiCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    surat = await db.get(SuratKeluar, id_surat_keluar)
    if not surat:
        raise HTTPException(status_code=404, detail="Surat keluar tidak ditemukan")
    await require_letter_access(db, surat, current_user)
    penerima = await db.get(Pegawai, payload.id_penerima)
    if not penerima or not penerima.is_active:
        raise HTTPException(status_code=404, detail="Pegawai penerima tidak ditemukan")
    if not _is_letter_manager(current_user) and surat.id_pegawai != current_user.id_pegawai and payload.id_parent is None:
        raise HTTPException(403, "Disposisi lanjutan memerlukan disposisi induk")
    if payload.id_parent is not None:
        parent = await db.get(Disposisi, payload.id_parent)
        if not parent or parent.id_surat_keluar != id_surat_keluar or (not _is_letter_manager(current_user) and parent.id_pegawai != current_user.id_pegawai):
            raise HTTPException(status_code=400, detail="Disposisi induk tidak sesuai")

    item = Disposisi(
        id_surat_keluar=id_surat_keluar,
        id_pegawai=penerima.id_pegawai,
        id_pengirim=current_user.id_pegawai,
        id_parent=payload.id_parent,
        instruksi=payload.instruksi,
        tanggal_disposisi=date.today(),
        status="terkirim",
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {
        "id_disposisi": item.id_disposisi,
        "id_surat_keluar": item.id_surat_keluar,
        "id_pengirim": item.id_pengirim,
        "id_penerima": item.id_pegawai,
        "id_parent": item.id_parent,
        "instruksi": item.instruksi,
        "tanggal_disposisi": str(item.tanggal_disposisi),
        "status": item.status,
    }


@router.get("/surat-keluar/{id_surat_keluar}/disposisi")
async def list_disposisi(
    id_surat_keluar: int,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    surat = await db.get(SuratKeluar, id_surat_keluar)
    if not surat:
        raise HTTPException(404, "Surat keluar tidak ditemukan")
    await require_letter_access(db, surat, current_user)
    result = await db.execute(
        select(Disposisi)
        .where(Disposisi.id_surat_keluar == id_surat_keluar)
        .order_by(Disposisi.id_disposisi)
    )
    return [
        {
            "id_disposisi": item.id_disposisi,
            "id_pengirim": item.id_pengirim,
            "id_penerima": item.id_pegawai,
            "id_parent": item.id_parent,
            "instruksi": item.instruksi,
            "tanggal_disposisi": str(item.tanggal_disposisi),
            "status": item.status,
            "diterima_pada": str(item.diterima_pada) if item.diterima_pada else None,
        }
        for item in result.scalars().all()
    ]


@router.post("/disposisi/{id_disposisi}/terima")
async def accept_disposisi(
    id_disposisi: int,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    item = await db.get(Disposisi, id_disposisi)
    if not item:
        raise HTTPException(status_code=404, detail="Disposisi tidak ditemukan")
    if item.id_pegawai != current_user.id_pegawai:
        raise HTTPException(status_code=403, detail="Disposisi bukan untuk pengguna ini")
    item.status = "diterima"
    item.diterima_pada = datetime.now()
    await db.commit()
    return {"id_disposisi": item.id_disposisi, "status": item.status}


# ----------------- Verification & Export -----------------


@router.get("/surat-keluar/{id_surat_keluar}/kode-verifikasi")
async def get_verification_code(
    id_surat_keluar: int,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    surat = await db.get(SuratKeluar, id_surat_keluar)
    if not surat:
        raise HTTPException(status_code=404, detail="Surat keluar tidak ditemukan")
    await require_letter_access(db, surat, current_user)
    code = _verification_code(surat)
    return {
        "verification_code": code,
        "verification_path": f"/api/v1/verifikasi/{code}",
        "content_sha256": surat.content_sha256,
    }


@router.get("/verifikasi/{kode_verifikasi}")
async def verify_surat(kode_verifikasi: str, db: AsyncSession = Depends(get_db)):
    decoded = _decode_verification_code(kode_verifikasi)
    if not decoded:
        raise HTTPException(status_code=404, detail="Kode verifikasi tidak valid")
    id_surat, nomor_surat = decoded
    surat = await db.get(SuratKeluar, id_surat)
    if not surat or surat.nomor_surat != nomor_surat or surat.status not in ("terbit", "diarsipkan"):
        raise HTTPException(status_code=404, detail="Surat tidak terverifikasi")
    return {
        "valid": True,
        "id_surat_keluar": surat.id_surat_keluar,
        "nomor_surat": surat.nomor_surat,
        "perihal": surat.perihal,
        "tujuan_surat": surat.tujuan_surat,
        "tanggal_surat": str(surat.tanggal_surat),
        "tanggal_terbit": str(surat.tanggal_terbit),
        "penandatangan_nama": surat.penandatangan_nama,
        "penandatangan_jabatan": surat.penandatangan_jabatan,
        "atas_nama": surat.atas_nama,
        "content_sha256": surat.content_sha256,
        "status": surat.status,
        "message": "Surat terdaftar dan nomor resminya valid",
    }


@router.get("/surat-keluar/{id_surat_keluar}/export")
async def export_surat(
    id_surat_keluar: int,
    format: str = Query("docx", pattern="^(docx|pdf)$"),
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    res = await db.execute(
        select(SuratKeluar)
        .options(
            selectinload(SuratKeluar.surat_tugas)
            .selectinload(SuratTugas.pelaksana)
            .selectinload(SuratTugasPelaksana.pegawai)
        )
        .where(SuratKeluar.id_surat_keluar == id_surat_keluar)
    )
    surat = res.scalar_one_or_none()
    if not surat:
        raise HTTPException(status_code=404, detail="Surat keluar tidak ditemukan")
    await require_letter_access(db, surat, current_user)
    if surat.status not in ("terbit", "diarsipkan"):
        raise HTTPException(status_code=409, detail="Hanya surat terbit yang dapat diekspor")

    jenis = await db.get(JenisSurat, surat.id_jenis_surat)
    heading = (jenis.nama_jenis if jenis else "SURAT DINAS").upper()
    kode_jenis = jenis.kode_jenis if jenis else "SD"
    ver_code = _verification_code(surat)
    sha_prefix = (surat.content_sha256 or _compute_content_sha256(surat))[:16]
    safe_id = str(surat.id_surat_keluar)
    st = surat.surat_tugas

    sign_label_parts = []
    if surat.atas_nama:
        sign_label_parts.append(surat.atas_nama)
    if surat.penandatangan_jabatan:
        sign_label_parts.append(surat.penandatangan_jabatan)
    sign_header = " ".join(sign_label_parts) or "Sekretaris KPU Provinsi Sulawesi Utara"
    sign_name = surat.penandatangan_nama or "Pejabat Penandatangan"

    if format == "docx":
        buf = io.BytesIO()
        document = Document()
        section = document.sections[0]
        header_p = section.header.paragraphs[0]
        header_p.text = (
            "KOMISI PEMILIHAN UMUM\n"
            "PROVINSI SULAWESI UTARA\n"
            "Jl. Diponegoro No. 25 Manado, Sulawesi Utara"
        )
        header_p.style = document.styles["Header"]

        if kode_jenis == "ST" and st is not None:
            document.add_heading("SURAT TUGAS", level=1)
            document.add_paragraph(f"Nomor: {surat.nomor_surat}")
            if st.dasar_tugas:
                document.add_paragraph(f"Dasar: {st.dasar_tugas}")
            document.add_paragraph("MEMBERI TUGAS KEPADA:")
            tbl = document.add_table(rows=1, cols=4)
            hdr = tbl.rows[0].cells
            hdr[0].text, hdr[1].text, hdr[2].text, hdr[3].text = "No", "Nama", "NIP / Jabatan", "Peran"
            for idx, pel in enumerate(st.pelaksana, start=1):
                row_cells = tbl.add_row().cells
                row_cells[0].text = str(idx)
                row_cells[1].text = pel.pegawai.nama if pel.pegawai else f"Pegawai #{pel.id_pegawai}"
                nip = pel.pegawai.nip if pel.pegawai else "-"
                jab = (pel.pegawai.jabatan or "-") if pel.pegawai else "-"
                row_cells[2].text = f"{nip} / {jab}"
                row_cells[3].text = pel.peran_tugas
            document.add_paragraph(f"Untuk: {st.maksud_tugas}")
            document.add_paragraph(f"Tempat Tujuan: {st.tempat_tugas}")
            document.add_paragraph(f"Waktu Pelaksanaan: {st.tanggal_mulai} s.d. {st.tanggal_selesai}")
            document.add_paragraph(f"Beban Anggaran: {st.beban_anggaran or 'DIPA KPU Provinsi Sulawesi Utara'}")
        else:
            document.add_heading(heading, level=1)
            document.add_paragraph(f"Nomor: {surat.nomor_surat}")
            document.add_paragraph(f"Tanggal: {surat.tanggal_surat}")
            document.add_paragraph(f"Sifat: {surat.sifat_surat}")
            document.add_paragraph(f"Lampiran: {surat.lampiran or '-'}")
            document.add_paragraph(f"Perihal: {surat.perihal}")
            document.add_paragraph(f"Kepada Yth.: {surat.tujuan_surat}")
            document.add_paragraph(surat.isi_surat or "")

        document.add_paragraph(f"\nManado, {surat.tanggal_surat}")
        document.add_paragraph(sign_header)
        document.add_paragraph("\n")
        p_sig = document.add_paragraph(sign_name)
        if p_sig.runs:
            p_sig.runs[0].bold = True

        if surat.tembusan:
            document.add_paragraph(f"\nTembusan:\n{surat.tembusan}")

        p_foot = document.add_paragraph(
            f"\nVerifikasi Dokumen: /api/v1/verifikasi/{ver_code[:24]}... | SHA-256: {sha_prefix}"
        )
        for run in p_foot.runs:
            run.font.size = Pt(8)

        document.save(buf)
        return Response(
            content=buf.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": f'attachment; filename="surat-{safe_id}.docx"',
                "X-Content-Type-Options": "nosniff",
            },
        )

    buf = io.BytesIO()
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("KopTitle", parent=styles["Title"], fontSize=13, leading=16, spaceAfter=2)
    sub_style = ParagraphStyle("KopSub", parent=styles["Normal"], fontSize=8.5, alignment=1, textColor=colors.HexColor("#475569"))
    small_style = ParagraphStyle("Foot", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#64748b"))

    story = [
        Paragraph("KOMISI PEMILIHAN UMUM<br/>PROVINSI SULAWESI UTARA", title_style),
        Paragraph("Jl. Diponegoro No. 25 Manado, Sulawesi Utara — Naskah Dinas Elektronik", sub_style),
        Spacer(1, 6),
        HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#991b1b")),
        Spacer(1, 12),
    ]

    if kode_jenis == "ST" and st is not None:
        story.append(Paragraph(f"<b>SURAT TUGAS</b><br/>Nomor: {escape(surat.nomor_surat or '-')}", styles["Normal"]))
        story.append(Spacer(1, 10))
        if st.dasar_tugas:
            story.append(Paragraph(f"<b>Dasar:</b> {escape(st.dasar_tugas)}", styles["Normal"]))
            story.append(Spacer(1, 6))
        story.append(Paragraph("<b>MEMBERI TUGAS KEPADA:</b>", styles["Normal"]))
        story.append(Spacer(1, 4))
        table_data = [["No", "Nama", "NIP / Jabatan", "Peran"]]
        for idx, pel in enumerate(st.pelaksana, start=1):
            nama = pel.pegawai.nama if pel.pegawai else f"Pegawai #{pel.id_pegawai}"
            nip = pel.pegawai.nip if pel.pegawai else "-"
            jab = (pel.pegawai.jabatan or "-") if pel.pegawai else "-"
            table_data.append([str(idx), nama, f"{nip} / {jab}", pel.peran_tugas])
        t = Table(table_data, colWidths=[1.1 * cm, 5.2 * cm, 6.2 * cm, 3.5 * cm])
        t.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ])
        )
        story.extend([
            t,
            Spacer(1, 10),
            Paragraph(f"<b>Untuk:</b> {escape(st.maksud_tugas)}", styles["BodyText"]),
            Paragraph(f"<b>Tempat:</b> {escape(st.tempat_tugas)}", styles["Normal"]),
            Paragraph(f"<b>Waktu:</b> {escape(str(st.tanggal_mulai))} s.d. {escape(str(st.tanggal_selesai))}", styles["Normal"]),
            Paragraph(f"<b>Beban Anggaran:</b> {escape(st.beban_anggaran or 'DIPA KPU Provinsi Sulawesi Utara')}", styles["Normal"]),
        ])
    else:
        story.extend([
            Paragraph(f"<b>{escape(heading)}</b><br/>Nomor: {escape(surat.nomor_surat or '-')}", styles["Normal"]),
            Spacer(1, 10),
            Paragraph(f"<b>Tanggal:</b> {escape(str(surat.tanggal_surat))}", styles["Normal"]),
            Paragraph(f"<b>Sifat:</b> {escape(surat.sifat_surat or 'Biasa')}", styles["Normal"]),
            Paragraph(f"<b>Lampiran:</b> {escape(surat.lampiran or '-')}", styles["Normal"]),
            Paragraph(f"<b>Perihal:</b> {escape(surat.perihal)}", styles["Normal"]),
            Paragraph(f"<b>Kepada Yth.:</b> {escape(surat.tujuan_surat)}", styles["Normal"]),
            Spacer(1, 10),
            Paragraph(escape(surat.isi_surat or "").replace("\n", "<br/>"), styles["BodyText"]),
        ])

    story.extend([
        Spacer(1, 20),
        Paragraph(f"Manado, {escape(str(surat.tanggal_surat))}", styles["Normal"]),
        Paragraph(f"<b>{escape(sign_header)}</b>", styles["Normal"]),
        Spacer(1, 28),
        Paragraph(f"<b><u>{escape(sign_name)}</u></b>", styles["Normal"]),
    ])
    if surat.tembusan:
        story.extend([
            Spacer(1, 12),
            Paragraph(f"<b>Tembusan:</b><br/>{escape(surat.tembusan).replace(chr(10), '<br/>')}", small_style),
        ])
    story.extend([
        Spacer(1, 14),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cbd5e1")),
        Spacer(1, 4),
        Paragraph(f"Kode Verifikasi: {escape(ver_code[:32])}... | SHA-256: {escape(sha_prefix)}", small_style),
    ])

    SimpleDocTemplate(buf, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.8 * cm, bottomMargin=1.8 * cm).build(story)
    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="surat-{safe_id}.pdf"',
            "X-Content-Type-Options": "nosniff",
        },
    )


# ----------------- Surat Tugas Endpoints -----------------


def _surat_tugas_out(t: SuratTugas) -> dict:
    return {
        "id_surat_tugas": t.id_surat_tugas,
        "id_surat_keluar": t.id_surat_keluar,
        "nomor_tugas": t.nomor_tugas,
        "maksud_tugas": t.maksud_tugas,
        "dasar_tugas": t.dasar_tugas,
        "tempat_tugas": t.tempat_tugas,
        "tanggal_mulai": str(t.tanggal_mulai),
        "tanggal_selesai": str(t.tanggal_selesai),
        "beban_anggaran": t.beban_anggaran,
        "id_pagu": t.id_pagu,
        "laporan_file_id": t.laporan_file_id,
        "status_surat": t.surat_keluar.status if t.surat_keluar else None,
        "pelaksana": [
            {
                "id_pegawai": p.id_pegawai,
                "nama": p.pegawai.nama if p.pegawai else None,
                "peran_tugas": p.peran_tugas,
            }
            for p in t.pelaksana
        ],
    }


@router.get("/surat-tugas")
async def list_surat_tugas(
    db: AsyncSession = Depends(get_db),
    user: Pegawai = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    query = (
        select(SuratTugas)
        .options(
            selectinload(SuratTugas.surat_keluar),
            selectinload(SuratTugas.pelaksana).selectinload(SuratTugasPelaksana.pegawai),
        )
        .order_by(SuratTugas.id_surat_tugas.desc())
    )
    if not _is_letter_manager(user):
        mine_pelaksana = select(SuratTugasPelaksana.id_surat_tugas).where(
            SuratTugasPelaksana.id_pegawai == user.id_pegawai
        )
        mine_created = select(SuratKeluar.id_surat_keluar).where(
            SuratKeluar.id_pegawai == user.id_pegawai
        )
        query = query.where(
            or_(
                SuratTugas.id_surat_tugas.in_(mine_pelaksana),
                SuratTugas.id_surat_keluar.in_(mine_created),
            )
        )
    res = await db.execute(query.offset(skip).limit(limit))
    return [_surat_tugas_out(t) for t in res.scalars().all()]


@router.get("/surat-tugas/cek-konflik")
async def cek_konflik_surat_tugas(
    pelaksana: List[str] = Query(..., description="ID pegawai pelaksana (dipisahkan koma atau parameter berulang)"),
    tanggal_mulai: date = Query(...),
    tanggal_selesai: date = Query(...),
    exclude_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    if tanggal_selesai < tanggal_mulai:
        raise HTTPException(422, "Tanggal selesai tidak boleh sebelum tanggal mulai")
    ids: list[int] = []
    for raw in pelaksana:
        for tok in str(raw).split(","):
            tok = tok.strip()
            if not tok:
                continue
            try:
                ids.append(int(tok))
            except ValueError:
                raise HTTPException(422, f"ID pelaksana tidak valid: {tok}")
    ids = list(dict.fromkeys(ids))
    if not ids:
        return {"konflik": []}

    stmt = (
        select(SuratTugasPelaksana, SuratTugas, Pegawai.nama)
        .join(SuratTugas, SuratTugas.id_surat_tugas == SuratTugasPelaksana.id_surat_tugas)
        .join(SuratKeluar, SuratKeluar.id_surat_keluar == SuratTugas.id_surat_keluar)
        .join(Pegawai, Pegawai.id_pegawai == SuratTugasPelaksana.id_pegawai, isouter=True)
        .where(
            SuratTugasPelaksana.id_pegawai.in_(ids),
            SuratTugas.tanggal_mulai <= tanggal_selesai,
            SuratTugas.tanggal_selesai >= tanggal_mulai,
            SuratKeluar.status != "dibatalkan",
        )
    )
    if exclude_id is not None:
        stmt = stmt.where(SuratTugas.id_surat_tugas != exclude_id)

    rows = (await db.execute(stmt)).all()
    konflik = [
        {
            "id_pegawai": pel.id_pegawai,
            "nama_pegawai": nama or f"Pegawai #{pel.id_pegawai}",
            "id_surat_tugas": st.id_surat_tugas,
            "nomor_tugas": st.nomor_tugas,
            "maksud_tugas": st.maksud_tugas,
            "tempat_tugas": st.tempat_tugas,
            "tanggal_mulai": str(st.tanggal_mulai),
            "tanggal_selesai": str(st.tanggal_selesai),
        }
        for pel, st, nama in rows
    ]
    return {"konflik": konflik}


@router.post("/surat-tugas", status_code=status.HTTP_201_CREATED)
async def create_surat_tugas(
    payload: SuratTugasCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    if payload.tanggal_selesai < payload.tanggal_mulai:
        raise HTTPException(422, "Tanggal selesai tidak boleh sebelum tanggal mulai")

    if not is_admin(current_user) and payload.id_bagian is not None and payload.id_bagian != current_user.id_bagian:
        raise HTTPException(403, "Anda hanya dapat membuat surat tugas untuk bagian/subbagian Anda sendiri")
    id_bagian = payload.id_bagian if is_admin(current_user) and payload.id_bagian else current_user.id_bagian
    if not id_bagian or not await db.get(Bagian, id_bagian):
        raise HTTPException(422, "Bagian penerbit surat tugas tidak ditemukan")
    if not await db.get(KodeKlasifikasiArsip, payload.id_klasifikasi):
        raise HTTPException(422, "Kode klasifikasi tidak ditemukan")
    if payload.id_pagu is not None and not await db.get(PaguAnggaran, payload.id_pagu):
        raise HTTPException(422, "Pagu anggaran referensi tidak ditemukan")
    jenis = await db.scalar(select(JenisSurat).where(JenisSurat.kode_jenis == "ST"))
    if not jenis:
        raise HTTPException(422, "Jenis surat 'ST' (Surat Tugas) belum tersedia di data master")

    # Build deduplicated pelaksana list with roles
    pelaksana_map: dict[int, str] = {}
    if payload.pelaksana_detail:
        for item in payload.pelaksana_detail:
            pelaksana_map[item.id_pegawai] = item.peran_tugas.strip() or "Pelaksana"
    elif payload.pelaksana:
        for pid in payload.pelaksana:
            pelaksana_map.setdefault(pid, "Pelaksana")

    if not pelaksana_map:
        raise HTTPException(422, "Minimal satu pegawai pelaksana harus dipilih")

    pelaksana_ids = list(pelaksana_map.keys())
    found = (
        await db.execute(
            select(Pegawai.id_pegawai).where(Pegawai.id_pegawai.in_(pelaksana_ids), Pegawai.is_active == True)  # noqa: E712
        )
    ).scalars().all()
    if len(found) != len(pelaksana_ids):
        raise HTTPException(422, "Sebagian pegawai pelaksana tidak ditemukan atau tidak aktif")

    tgl = date.today()
    roman = ("I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII")[tgl.month - 1]
    surat = SuratKeluar(
        id_pegawai=current_user.id_pegawai,
        id_bagian=id_bagian,
        id_klasifikasi=payload.id_klasifikasi,
        id_jenis_surat=jenis.id_jenis_surat,
        tahun=tgl.year,
        bulan_romawi=roman,
        sifat_surat="Biasa",
        perihal=f"Surat Tugas: {payload.maksud_tugas[:240]}",
        tujuan_surat="Pegawai Pelaksana Tugas",
        isi_surat=payload.maksud_tugas,
        status="draft",
        tanggal_surat=tgl,
    )
    db.add(surat)
    await db.flush()
    db.add(
        RiwayatStatusSurat(
            id_surat_keluar=surat.id_surat_keluar,
            id_pegawai=current_user.id_pegawai,
            status_lama=None,
            status_baru="draft",
            catatan="Pembuatan draf surat tugas",
        )
    )
    tugas = SuratTugas(
        id_surat_keluar=surat.id_surat_keluar,
        nomor_tugas=f"DRAFT/ST/{surat.id_surat_keluar}/{tgl.year}",
        maksud_tugas=payload.maksud_tugas,
        dasar_tugas=payload.dasar_tugas,
        tempat_tugas=payload.tempat_tugas,
        tanggal_mulai=payload.tanggal_mulai,
        tanggal_selesai=payload.tanggal_selesai,
        beban_anggaran=payload.beban_anggaran,
        id_pagu=payload.id_pagu,
        pelaksana=[
            SuratTugasPelaksana(id_pegawai=pid, peran_tugas=peran)
            for pid, peran in pelaksana_map.items()
        ],
    )
    db.add(tugas)
    await db.commit()
    await safe_sync(db, "surat_keluar", surat.id_surat_keluar)
    res = await db.execute(
        select(SuratTugas)
        .options(
            selectinload(SuratTugas.surat_keluar),
            selectinload(SuratTugas.pelaksana).selectinload(SuratTugasPelaksana.pegawai),
        )
        .where(SuratTugas.id_surat_tugas == tugas.id_surat_tugas)
    )
    return _surat_tugas_out(res.scalar_one())


@router.patch("/surat-tugas/{id_surat_tugas}/laporan")
async def attach_surat_tugas_laporan(
    id_surat_tugas: int,
    payload: SuratTugasLaporanUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    res = await db.execute(
        select(SuratTugas)
        .options(
            selectinload(SuratTugas.surat_keluar),
            selectinload(SuratTugas.pelaksana).selectinload(SuratTugasPelaksana.pegawai),
        )
        .where(SuratTugas.id_surat_tugas == id_surat_tugas)
    )
    tugas = res.scalar_one_or_none()
    if not tugas:
        raise HTTPException(404, "Surat tugas tidak ditemukan")

    is_pelaksana = any(p.id_pegawai == current_user.id_pegawai for p in tugas.pelaksana)
    is_creator = tugas.surat_keluar is not None and tugas.surat_keluar.id_pegawai == current_user.id_pegawai
    if not (_is_letter_manager(current_user) or is_pelaksana or is_creator):
        raise HTTPException(403, "Anda tidak berwenang mengunggah laporan untuk surat tugas ini")

    f = await db.get(FileRecord, payload.file_id)
    if not f or (f.uploaded_by != current_user.id_pegawai and not is_admin(current_user)):
        raise HTTPException(403, "Berkas laporan tidak ditemukan atau bukan milik pengguna")

    tugas.laporan_file_id = payload.file_id
    await db.commit()
    await db.refresh(tugas)
    return _surat_tugas_out(tugas)
