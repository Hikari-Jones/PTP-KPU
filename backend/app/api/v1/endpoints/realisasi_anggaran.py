from datetime import date
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import (
    get_current_user,
    is_admin,
    require_rendatin_or_keuangan,
    is_rendatin_or_keuangan,
    get_effective_subbagian_id,
)
from app.models.schema import Pegawai
from app.schemas.anggaran import (
    RealisasiAnggaranCreateDraft,
    RealisasiAnggaranUpdateDraft,
    RealisasiAnggaranVerify,
    RealisasiAnggaranReject,
    RealisasiAnggaranResponse,
    RealisasiAnggaranListResponse,
)
from app.services.anggaran import realisasi_anggaran

from app.core.authority import has_authority
from app.core.config import settings

from app.services.arsip_sync import safe_sync
router = APIRouter()

async def require_budget_operator(user: Pegawai = Depends(get_current_user)):
    if not is_rendatin_or_keuangan(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak: Input realisasi anggaran hanya untuk Subbagian Keuangan dan RENDATIN",
        )
    return user

async def require_budget_reviewer(user: Pegawai = Depends(get_current_user)):
    if not has_authority(settings.AUTHORITY_GRANTS, user.id_pegawai, "verify_budget"):
        raise HTTPException(403, "Penugasan pemeriksa anggaran aktif belum dikonfigurasi")
    return user

@router.get("/capabilities")
async def capabilities(user: Pegawai = Depends(get_current_user)):
    return {"user_id": user.id_pegawai, "can_review": has_authority(
        settings.AUTHORITY_GRANTS, user.id_pegawai, "verify_budget")}



@router.get(
    "/",
    response_model=RealisasiAnggaranListResponse,
    summary="List Transaksi Realisasi Anggaran",
    description="Mengambil daftar transaksi realisasi belanja anggaran dengan filter komprehensif (id_pagu, tahun, bagian, akun, status, nomor dokumen/uraian, rentang tanggal) dan pagination.",
)
async def read_realisasi_anggaran(
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
    id_pagu: Optional[int] = Query(None, description="Filter berdasarkan ID pagu anggaran"),
    id_tahun_anggaran: Optional[int] = Query(None, description="Filter berdasarkan tahun anggaran"),
    id_bagian: Optional[int] = Query(None, description="Filter berdasarkan divisi / bagian KPU"),
    id_akun_anggaran: Optional[int] = Query(None, description="Filter berdasarkan akun MAK"),
    bulan: Optional[int] = Query(None, ge=1, le=12, description="Filter berdasarkan bulan transaksi (1-12)"),
    status: Optional[str] = Query(None, pattern="^(draft|submitted|verified|rejected)$", description="Filter status transaksi"),
    search: Optional[str] = Query(None, description="Search nomor dokumen, uraian, kode akun, atau nama akun"),
    tanggal_mulai: Optional[date] = Query(None, description="Filter tanggal transaksi mulai"),
    tanggal_selesai: Optional[date] = Query(None, description="Filter tanggal transaksi selesai"),
    has_bukti: Optional[bool] = Query(None, description="true = memiliki bukti dokumen, false = belum ada bukti"),
    skip: int = Query(0, ge=0, description="Offset data"),
    limit: int = Query(50, ge=1, le=500, description="Limit data per halaman"),
) -> Any:
    effective_bagian = get_effective_subbagian_id(current_user, id_bagian)
    items, total = await realisasi_anggaran.get_filtered(
        db,
        id_pagu=id_pagu,
        id_tahun_anggaran=id_tahun_anggaran,
        id_bagian=effective_bagian,
        id_akun_anggaran=id_akun_anggaran,
        bulan=bulan,
        status=status,
        search=search,
        tanggal_mulai=tanggal_mulai,
        tanggal_selesai=tanggal_selesai,
        has_bukti=has_bukti,
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return {"total": total, "items": items}


@router.get(
    "/{id_realisasi}",
    response_model=RealisasiAnggaranResponse,
    summary="Detail Transaksi Realisasi",
    description="Mengambil rincian detail dokumen transaksi realisasi belanja beserta relasi akun, pagu, bagian, operator, dan verifikator.",
)
async def read_realisasi_anggaran_by_id(
    id_realisasi: int,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    db_obj = await realisasi_anggaran.get_detail(db, id_realisasi)
    if not db_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaksi realisasi dengan ID {id_realisasi} tidak ditemukan",
        )
    if not is_rendatin_or_keuangan(current_user):
        bagian_id = db_obj.akun_anggaran.id_bagian if db_obj.akun_anggaran else None
        if bagian_id != current_user.id_bagian:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Akses ditolak: Anda hanya dapat melihat rincian realisasi subbagian Anda sendiri",
            )
    return await realisasi_anggaran.enrich_realisasi_response(db, db_obj)


@router.post(
    "/",
    response_model=RealisasiAnggaranResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Simpan Draft Realisasi Anggaran",
    description="Menyimpan draft setelah validasi pagu dan tahun. Ajukan untuk pemeriksaan terpisah; draft tidak dihitung sebagai realisasi terverifikasi.",
)
async def create_realisasi(
    realisasi_in: RealisasiAnggaranCreateDraft,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_budget_operator),
) -> Any:
    db_obj = await realisasi_anggaran.create_realisasi_direct(
        db,
        obj_in=realisasi_in,
        id_pegawai=current_user.id_pegawai,
    )
    tx_id = db_obj.id_realisasi
    await safe_sync(db, "realisasi", tx_id)
    # Reload with relationships: the response needs pagu/akun/bagian loaded eagerly.
    db_obj = await realisasi_anggaran.get_detail(db, tx_id)
    return await realisasi_anggaran.enrich_realisasi_response(db, db_obj)


def require_rendatin_user(user: Pegawai) -> None:
    """
    Enforces strict authorization: ONLY officers of Subbagian RENDATIN (BAG-02)
    have edit and delete privileges on budget realization transactions.
    - BAG-02 is the primary authoritative identifier.
    - Strict name fallback is provided if kode_bagian is missing.
    - Non-RENDATIN Admins and non-RENDATIN Operators are strictly forbidden (HTTP 403).
    """
    if not user or not user.bagian:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak: Hanya pegawai Subbagian RENDATIN (BAG-02) yang memiliki kewenangan mengubah atau menghapus transaksi realisasi anggaran",
        )

    kode = (user.bagian.kode_bagian or "").strip().upper()
    nama = (user.bagian.nama_bagian or "").strip().lower()

    is_rendatin = (kode == "BAG-02") or ("rendatin" in nama) or ("perencanaan, data dan informasi" in nama)
    if not is_rendatin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akses ditolak: Anda bukan anggota Subbagian RENDATIN (Perencanaan, Data dan Informasi). Role Admin dari bagian lain tidak memiliki hak ini.",
        )


@router.put(
    "/{id_realisasi}",
    response_model=RealisasiAnggaranResponse,
    summary="Update Transaksi Realisasi (Khusus RENDATIN)",
    description="Memperbarui data transaksi realisasi verified secara atomik oleh Subbagian RENDATIN (BAG-02). Melakukan validasi pagu dengan SELECT ... FOR UPDATE.",
)
async def update_realisasi_rendatin_endpoint(
    id_realisasi: int,
    realisasi_in: RealisasiAnggaranUpdateDraft,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    # 1. Enforce RENDATIN strict authorization
    require_rendatin_user(current_user)

    # 2. Execute atomic update with concurrency protection
    db_obj = await realisasi_anggaran.update_realisasi_rendatin(
        db,
        id_realisasi=id_realisasi,
        obj_in=realisasi_in,
        user=current_user,
    )
    tx_id = db_obj.id_realisasi
    await safe_sync(db, "realisasi", tx_id)
    # Reload with relationships: the response needs pagu/akun/bagian loaded eagerly.
    db_obj = await realisasi_anggaran.get_detail(db, tx_id)
    return await realisasi_anggaran.enrich_realisasi_response(db, db_obj)


@router.delete(
    "/{id_realisasi}",
    response_model=RealisasiAnggaranResponse,
    summary="Hapus Transaksi Realisasi (Khusus RENDATIN)",
    description="Menghapus transaksi realisasi verified secara atomik oleh Subbagian RENDATIN (BAG-02). Saldo pagu aktif otomatis pulih.",
)
async def delete_realisasi_rendatin_endpoint(
    id_realisasi: int,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    # 1. Enforce RENDATIN strict authorization
    require_rendatin_user(current_user)

    # 2. Execute atomic deletion
    return await realisasi_anggaran.delete_realisasi_rendatin(
        db,
        id_realisasi=id_realisasi,
        user=current_user,
    )


# =========================================================
# ACTION ENDPOINTS (EXPLICIT WORKFLOW STATE TRANSITIONS)
# =========================================================

@router.post(
    "/{id_realisasi}/submit",
    response_model=RealisasiAnggaranResponse,
    summary="Ajukan Transaksi (Draft -> Submitted)",
    description="Mengajukan transaksi draft ke verifikator keuangan. Service memvalidasi ketersediaan sisa anggaran sebelum status berubah menjadi 'submitted'.",
)
async def submit_realisasi_action(
    id_realisasi: int,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_budget_operator),
) -> Any:
    db_obj = await realisasi_anggaran.submit_realisasi(
        db,
        id_realisasi=id_realisasi,
        current_user_id=current_user.id_pegawai,
    )
    return await realisasi_anggaran.enrich_realisasi_response(db, db_obj)


@router.post(
    "/{id_realisasi}/verify",
    response_model=RealisasiAnggaranResponse,
    summary="Verifikasi Transaksi (Submitted -> Verified)",
    description="Menyetujui dan memverifikasi transaksi realisasi belanja. Identitas verifikator diambil langsung secara aman dari kredensial autentikasi sistem. Dilindungi oleh row-level locking pada database untuk menjamin transaksi bebas overbudget.",
)
async def verify_realisasi_action(
    id_realisasi: int,
    verify_in: RealisasiAnggaranVerify,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_budget_reviewer),
) -> Any:
    db_obj = await realisasi_anggaran.verify_realisasi(
        db,
        id_realisasi=id_realisasi,
        id_verifier=current_user.id_pegawai,
        obj_in=verify_in,
    )
    return await realisasi_anggaran.enrich_realisasi_response(db, db_obj)


@router.post(
    "/{id_realisasi}/reject",
    response_model=RealisasiAnggaranResponse,
    summary="Tolak Transaksi (Submitted -> Rejected)",
    description="Menolak transaksi realisasi yang telah diajukan. Catatan penolakan (catatan_verifikasi) wajib diisi untuk alasan audit finansial.",
)
async def reject_realisasi_action(
    id_realisasi: int,
    reject_in: RealisasiAnggaranReject,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_budget_reviewer),
) -> Any:
    db_obj = await realisasi_anggaran.reject_realisasi(
        db,
        id_realisasi=id_realisasi,
        id_verifier=current_user.id_pegawai,
        obj_in=reject_in,
    )
    return await realisasi_anggaran.enrich_realisasi_response(db, db_obj)

@router.get("/{id_realisasi}/history")
async def budget_history(id_realisasi: int, db: AsyncSession = Depends(get_db),
                         user: Pegawai = Depends(get_current_user)):
    from sqlalchemy import select
    from app.models.operations import BudgetEvent
    rows = (await db.scalars(select(BudgetEvent).where(
        BudgetEvent.realization_id == id_realisasi).order_by(BudgetEvent.id))).all()
    return [{"id": row.id, "actor_id": row.actor_id, "action": row.action,
             "recorded_at": row.recorded_at.isoformat() + "Z", "snapshot": row.snapshot} for row in rows]
