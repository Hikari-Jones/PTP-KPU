from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from pydantic import BaseModel

from app.core.database import get_db
from app.models.schema import (
    KodeKlasifikasiArsip,
    JenisSurat,
    SuratKeluar,
    SuratTugas,
    SuratTugasPelaksana,
    PenomoranSequence,
    RiwayatStatusSurat,
    Disposisi,
    Pegawai,
    Bagian
)

router = APIRouter()

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

class JenisSuratOut(BaseModel):
    id_jenis_surat: int
    kode_jenis: str
    nama_jenis: str
    format_nomor: str

    class Config:
        from_attributes = True

class SuratKeluarCreate(BaseModel):
    id_pegawai: int = 1
    id_bagian: int = 1
    id_klasifikasi: int = 1
    id_jenis_surat: int = 1
    tahun: int = 2026
    bulan_romawi: str = "X"
    sifat_surat: str = "Biasa"
    perihal: str
    tujuan_surat: str
    isi_surat: Optional[str] = None
    lampiran: Optional[str] = None
    tanggal_surat: Optional[str] = None

class FinalisasiRequest(BaseModel):
    id_pegawai: int = 1
    catatan: Optional[str] = "Penerbitan nomor surat resmi"

# ----------------- Endpoints -----------------

@router.get("/klasifikasi", response_model=List[KlasifikasiOut])
async def list_klasifikasi(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KodeKlasifikasiArsip).order_by(KodeKlasifikasiArsip.kode_klasifikasi))
    return result.scalars().all()

@router.get("/jenis-surat", response_model=List[JenisSuratOut])
async def list_jenis_surat(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(JenisSurat).order_by(JenisSurat.id_jenis_surat))
    return result.scalars().all()

@router.get("/surat-keluar")
async def list_surat_keluar(
    status_filter: Optional[str] = Query(None, alias="status"),
    tahun_filter: Optional[int] = Query(None, alias="tahun"),
    db: AsyncSession = Depends(get_db)
):
    query = select(SuratKeluar).order_by(SuratKeluar.id_surat_keluar.desc())
    if status_filter:
        query = query.where(SuratKeluar.status == status_filter)
    if tahun_filter:
        query = query.where(SuratKeluar.tahun == tahun_filter)
    
    result = await db.execute(query)
    items = result.scalars().all()

    # Enrich with details
    output = []
    for item in items:
        output.append({
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
            "status": item.status,
            "tanggal_surat": str(item.tanggal_surat),
            "tanggal_terbit": str(item.tanggal_terbit) if item.tanggal_terbit else None,
            "created_at": str(item.created_at) if item.created_at else None,
        })
    return output

@router.post("/surat-keluar/draft", status_code=status.HTTP_201_CREATED)
async def create_draft_surat_keluar(
    payload: SuratKeluarCreate,
    db: AsyncSession = Depends(get_db)
):
    # Parse date or default to today
    tgl = date.today()
    if payload.tanggal_surat:
        try:
            tgl = datetime.strptime(payload.tanggal_surat, "%Y-%m-%d").date()
        except Exception:
            pass

    surat = SuratKeluar(
        id_pegawai=payload.id_pegawai,
        id_bagian=payload.id_bagian,
        id_klasifikasi=payload.id_klasifikasi,
        id_jenis_surat=payload.id_jenis_surat,
        tahun=payload.tahun or tgl.year,
        bulan_romawi=payload.bulan_romawi or "X",
        sifat_surat=payload.sifat_surat,
        lampiran=payload.lampiran,
        perihal=payload.perihal,
        tujuan_surat=payload.tujuan_surat,
        isi_surat=payload.isi_surat,
        status="draft",
        tanggal_surat=tgl,
    )
    db.add(surat)
    await db.commit()
    await db.refresh(surat)

    return {
        "id_surat_keluar": surat.id_surat_keluar,
        "id_pegawai": surat.id_pegawai,
        "id_bagian": surat.id_bagian,
        "id_klasifikasi": surat.id_klasifikasi,
        "id_jenis_surat": surat.id_jenis_surat,
        "nomor_surat": surat.nomor_surat,
        "nomor_urut": surat.nomor_urut,
        "tahun": surat.tahun,
        "bulan_romawi": surat.bulan_romawi,
        "sifat_surat": surat.sifat_surat,
        "perihal": surat.perihal,
        "tujuan_surat": surat.tujuan_surat,
        "isi_surat": surat.isi_surat,
        "status": surat.status,
        "tanggal_surat": str(surat.tanggal_surat),
        "created_at": str(surat.created_at),
    }

@router.post("/surat-keluar/{id_surat_keluar}/finalisasi")
async def finalisasi_surat_atomic(
    id_surat_keluar: int,
    payload: FinalisasiRequest,
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(SuratKeluar).where(SuratKeluar.id_surat_keluar == id_surat_keluar))
    surat = res.scalar_one_or_none()
    if not surat:
        raise HTTPException(status_code=404, detail="Surat keluar tidak ditemukan")

    if surat.status == "terbit":
        return {
            "id_surat_keluar": surat.id_surat_keluar,
            "nomor_surat": surat.nomor_surat,
            "nomor_urut": surat.nomor_urut,
            "status": surat.status,
            "message": "Surat sudah berstatus terbit resmi"
        }

    # Fetch jenis surat and klasifikasi
    res_jenis = await db.execute(select(JenisSurat).where(JenisSurat.id_jenis_surat == surat.id_jenis_surat))
    jenis = res_jenis.scalar_one_or_none()
    
    res_klas = await db.execute(select(KodeKlasifikasiArsip).where(KodeKlasifikasiArsip.id_klasifikasi == surat.id_klasifikasi))
    klas = res_klas.scalar_one_or_none()
    kode_klas = klas.kode_klasifikasi if klas else "PL.01"

    # Atomic sequence generation
    res_seq = await db.execute(
        select(PenomoranSequence).where(
            PenomoranSequence.tahun == surat.tahun,
            PenomoranSequence.id_jenis_surat == surat.id_jenis_surat
        ).with_for_update()
    )
    seq = res_seq.scalar_one_or_none()

    if not seq:
        seq = PenomoranSequence(
            tahun=surat.tahun,
            id_jenis_surat=surat.id_jenis_surat,
            id_bagian=surat.id_bagian,
            last_number=1
        )
        db.add(seq)
        next_num = 1
    else:
        seq.last_number += 1
        next_num = seq.last_number

    # Format official nomor surat
    # Standard format: {nomor_urut}/{kode_klasifikasi}-{kode_jenis}/71/{bulan_romawi}/{tahun}
    num_str = str(next_num).zfill(3)
    kode_j = jenis.kode_jenis if jenis else "SD"
    nomor_resmi = f"{num_str}/{kode_klas}-{kode_j}/71/{surat.bulan_romawi}/{surat.tahun}"

    surat.nomor_urut = next_num
    surat.nomor_surat = nomor_resmi
    surat.status = "terbit"
    surat.tanggal_terbit = datetime.now()

    # Log riwayat status
    riwayat = RiwayatStatusSurat(
        id_surat_keluar=surat.id_surat_keluar,
        id_pegawai=payload.id_pegawai,
        status_lama="draft",
        status_baru="terbit",
        catatan=payload.catatan or "Penerbitan nomor resmi atomic"
    )
    db.add(riwayat)

    await db.commit()
    await db.refresh(surat)

    return {
        "id_surat_keluar": surat.id_surat_keluar,
        "id_pegawai": surat.id_pegawai,
        "id_bagian": surat.id_bagian,
        "id_klasifikasi": surat.id_klasifikasi,
        "id_jenis_surat": surat.id_jenis_surat,
        "nomor_surat": surat.nomor_surat,
        "nomor_urut": surat.nomor_urut,
        "tahun": surat.tahun,
        "bulan_romawi": surat.bulan_romawi,
        "sifat_surat": surat.sifat_surat,
        "perihal": surat.perihal,
        "tujuan_surat": surat.tujuan_surat,
        "status": surat.status,
        "tanggal_surat": str(surat.tanggal_surat),
        "tanggal_terbit": str(surat.tanggal_terbit),
    }

@router.get("/surat-tugas")
async def list_surat_tugas(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SuratTugas).order_by(SuratTugas.id_surat_tugas.desc()))
    items = res.scalars().all()
    output = []
    for t in items:
        output.append({
            "id_surat_tugas": t.id_surat_tugas,
            "id_surat_keluar": t.id_surat_keluar,
            "nomor_tugas": t.nomor_tugas,
            "maksud_tugas": t.maksud_tugas,
            "tempat_tugas": t.tempat_tugas,
            "tanggal_mulai": str(t.tanggal_mulai),
            "tanggal_selesai": str(t.tanggal_selesai),
            "beban_anggaran": t.beban_anggaran
        })
    return output
