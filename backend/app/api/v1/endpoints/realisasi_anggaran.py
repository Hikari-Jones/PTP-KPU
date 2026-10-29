from datetime import date
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user, require_admin
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

router = APIRouter()


@router.get(
    "/",
    response_model=RealisasiAnggaranListResponse,
    summary="List Transaksi Realisasi Anggaran",
    description="Mengambil daftar transaksi realisasi belanja anggaran dengan filter komprehensif (id_pagu, tahun, bagian, akun, status, nomor dokumen/uraian, rentang tanggal) dan pagination.",
)
async def read_realisasi_anggaran(
    response: Response,
    db: AsyncSession = Depends(get_db),
    id_pagu: Optional[int] = Query(None, description="Filter berdasarkan ID pagu anggaran"),
    id_tahun_anggaran: Optional[int] = Query(None, description="Filter berdasarkan tahun anggaran"),
    id_bagian: Optional[int] = Query(None, description="Filter berdasarkan divisi / bagian KPU"),
    id_akun_anggaran: Optional[int] = Query(None, description="Filter berdasarkan akun MAK"),
    status: Optional[str] = Query(None, pattern="^(draft|submitted|verified|rejected)$", description="Filter status transaksi"),
    search: Optional[str] = Query(None, description="Search nomor dokumen, uraian, kode akun, atau nama akun"),
    tanggal_mulai: Optional[date] = Query(None, description="Filter tanggal transaksi mulai"),
    tanggal_selesai: Optional[date] = Query(None, description="Filter tanggal transaksi selesai"),
    skip: int = Query(0, ge=0, description="Offset data"),
    limit: int = Query(50, ge=1, le=500, description="Limit data per halaman"),
) -> Any:
    items, total = await realisasi_anggaran.get_filtered(
        db,
        id_pagu=id_pagu,
        id_tahun_anggaran=id_tahun_anggaran,
        id_bagian=id_bagian,
        id_akun_anggaran=id_akun_anggaran,
        status=status,
        search=search,
        tanggal_mulai=tanggal_mulai,
        tanggal_selesai=tanggal_selesai,
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
) -> Any:
    db_obj = await realisasi_anggaran.get_detail(db, id_realisasi)
    if not db_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaksi realisasi dengan ID {id_realisasi} tidak ditemukan",
        )
    return await realisasi_anggaran.enrich_realisasi_response(db, db_obj)


@router.post(
    "/",
    response_model=RealisasiAnggaranResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Buat Transaksi Draft",
    description="Membuat transaksi realisasi anggaran baru dengan status awal 'draft'. Operator pencatat diambil otomatis dari user yang terautentikasi.",
)
async def create_realisasi_draft(
    realisasi_in: RealisasiAnggaranCreateDraft,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    db_obj = await realisasi_anggaran.create_draft(
        db,
        obj_in=realisasi_in,
        id_pegawai=current_user.id_pegawai,
    )
    return await realisasi_anggaran.enrich_realisasi_response(db, db_obj)


@router.put(
    "/{id_realisasi}",
    response_model=RealisasiAnggaranResponse,
    summary="Update Transaksi Draft / Rejected",
    description="Memperbarui data transaksi realisasi. Sesuai business rule, hanya transaksi berstatus 'draft' atau 'rejected' yang diizinkan untuk diubah. Jika sebelumnya berstatus 'rejected', status otomatis kembali ke 'draft'.",
)
async def update_realisasi_draft(
    id_realisasi: int,
    realisasi_in: RealisasiAnggaranUpdateDraft,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    db_obj = await realisasi_anggaran.update_draft(
        db,
        id_realisasi=id_realisasi,
        obj_in=realisasi_in,
        current_user_id=current_user.id_pegawai,
    )
    return await realisasi_anggaran.enrich_realisasi_response(db, db_obj)


@router.delete(
    "/{id_realisasi}",
    response_model=RealisasiAnggaranResponse,
    summary="Hapus Transaksi Draft",
    description="Menghapus transaksi realisasi belanja. Sesuai business rule, hanya transaksi berstatus 'draft' yang dapat dihapus.",
)
async def delete_realisasi_draft(
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
    enriched = await realisasi_anggaran.enrich_realisasi_response(db, db_obj)
    await realisasi_anggaran.delete_draft(
        db,
        id_realisasi=id_realisasi,
        current_user_id=current_user.id_pegawai,
    )
    return enriched


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
    current_user: Pegawai = Depends(get_current_user),
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
    current_user: Pegawai = Depends(require_admin),
) -> Any:
    # In KPU system architecture, verification authority is held by Admin/PPK/KPA
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
    current_user: Pegawai = Depends(require_admin),
) -> Any:
    db_obj = await realisasi_anggaran.reject_realisasi(
        db,
        id_realisasi=id_realisasi,
        id_verifier=current_user.id_pegawai,
        obj_in=reject_in,
    )
    return await realisasi_anggaran.enrich_realisasi_response(db, db_obj)
