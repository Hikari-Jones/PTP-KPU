from typing import Any, Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.schema import Pegawai, TahunAnggaran
from app.models.operations import HistoricalReportVersion, FinancialAuditLog
from app.schemas.anggaran import DashboardSummaryResponse, MonthlyReportResponse
from app.services.anggaran import get_dashboard_summary, get_monthly_report

router = APIRouter()


class PublishReportPayload(BaseModel):
    id_tahun_anggaran: int
    periode_laporan: str
    alasan: Optional[str] = None


class HistoricalReportVersionResponse(BaseModel):
    id_version: int
    id_tahun_anggaran: int
    tahun: int
    periode_laporan: str
    nomor_versi: int
    diterbitkan_oleh: Optional[int] = None
    nama_penerbit: Optional[str] = None
    waktu_terbit: Any
    alasan_koreksi: Optional[str] = None
    snapshot_data: dict

    class Config:
        from_attributes = True


@router.get(
    "/summary",
    response_model=DashboardSummaryResponse,
    summary="Ringkasan Makro Dashboard Anggaran",
    description="Menyajikan metrik agregat anggaran makro: total pagu aktif, total realisasi terverifikasi, sisa anggaran, persentase serapan, dan hitungan transaksi.",
)
async def read_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    id_tahun_anggaran: Optional[int] = Query(None, description="ID tahun anggaran (default ke tahun anggaran aktif jika tidak diisi)"),
    id_akun_anggaran: Optional[int] = Query(None, description="ID akun anggaran (MAK) untuk filter spesifik akun"),
    id_bagian: Optional[int] = Query(None, description="ID bagian/divisi untuk filter spesifik bagian"),
    bulan: Optional[int] = Query(None, ge=1, le=12, description="Filter bulan spesifik (1-12)"),
) -> Any:
    return await get_dashboard_summary(
        db,
        id_tahun_anggaran=id_tahun_anggaran,
        id_akun_anggaran=id_akun_anggaran,
        id_bagian=id_bagian,
        bulan=bulan,
    )


@router.get(
    "/monthly-report",
    response_model=MonthlyReportResponse,
    summary="Laporan Bulanan Realisasi Anggaran (12 Bulan)",
    description="Menyajikan matriks laporan serapan anggaran 12 bulan (Januari-Desember) per akun anggaran berdasarkan tahun anggaran, filter akun, dan filter bagian.",
)
async def read_monthly_report(
    db: AsyncSession = Depends(get_db),
    id_tahun_anggaran: Optional[int] = Query(None, description="ID tahun anggaran (default ke tahun anggaran aktif jika tidak diisi)"),
    id_akun_anggaran: Optional[int] = Query(None, description="ID akun anggaran (MAK) untuk filter spesifik akun"),
    id_bagian: Optional[int] = Query(None, description="ID bagian/divisi untuk filter spesifik bagian"),
) -> Any:
    return await get_monthly_report(
        db,
        id_tahun_anggaran=id_tahun_anggaran,
        id_akun_anggaran=id_akun_anggaran,
        id_bagian=id_bagian,
    )


@router.post(
    "/publish",
    response_model=HistoricalReportVersionResponse,
    summary="Terbitkan Versi Laporan Historis",
    description="Menyimpan snapshot versi laporan yang diterbitkan (append-only) untuk menjamin data historis tidak tertimpa.",
)
async def publish_report_version(
    payload: PublishReportPayload,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    ta_res = await db.execute(select(TahunAnggaran).where(TahunAnggaran.id_tahun_anggaran == payload.id_tahun_anggaran))
    ta = ta_res.scalar_one_or_none()
    if not ta:
        raise HTTPException(status_code=404, detail="Tahun anggaran tidak ditemukan")

    # Generate current report snapshot
    report_data = await get_monthly_report(db, id_tahun_anggaran=ta.id_tahun_anggaran)
    snapshot = report_data.model_dump() if hasattr(report_data, 'model_dump') else dict(report_data)

    # Determine next version number
    v_res = await db.execute(
        select(HistoricalReportVersion)
        .where(
            HistoricalReportVersion.id_tahun_anggaran == ta.id_tahun_anggaran,
            HistoricalReportVersion.periode_laporan == payload.periode_laporan,
        )
        .order_by(desc(HistoricalReportVersion.nomor_versi))
        .limit(1)
    )
    last_v = v_res.scalar_one_or_none()
    next_ver = (last_v.nomor_versi + 1) if last_v else 1

    new_report_version = HistoricalReportVersion(
        id_tahun_anggaran=ta.id_tahun_anggaran,
        tahun=ta.tahun,
        periode_laporan=payload.periode_laporan,
        nomor_versi=next_ver,
        diterbitkan_oleh=current_user.id_pegawai,
        nama_penerbit=current_user.nama,
        alasan_koreksi=payload.alasan,
        snapshot_data=snapshot,
    )
    db.add(new_report_version)

    # Record in FinancialAuditLog
    audit = FinancialAuditLog(
        id_pegawai=current_user.id_pegawai,
        nama_pegawai=current_user.nama,
        aksi="PUBLISH_REPORT",
        nama_tabel="historical_report_version",
        id_entitas=ta.id_tahun_anggaran,
        id_tahun_anggaran=ta.id_tahun_anggaran,
        tahun=ta.tahun,
        nilai_sebelum={"nomor_versi": last_v.nomor_versi} if last_v else None,
        nilai_sesudah={"nomor_versi": next_ver, "periode": payload.periode_laporan},
        alasan=payload.alasan or f"Penerbitan laporan versi {next_ver}",
    )
    db.add(audit)

    await db.commit()
    await db.refresh(new_report_version)
    return new_report_version


@router.get(
    "/versions",
    response_model=List[HistoricalReportVersionResponse],
    summary="Daftar Versi Laporan Historis",
    description="Mengambil riwayat versi laporan yang telah diterbitkan untuk tahun anggaran dan periode tertentu.",
)
async def list_report_versions(
    id_tahun_anggaran: int = Query(..., description="ID Tahun Anggaran"),
    periode_laporan: Optional[str] = Query(None, description="Periode Laporan"),
    db: AsyncSession = Depends(get_db),
) -> Any:
    stmt = select(HistoricalReportVersion).where(HistoricalReportVersion.id_tahun_anggaran == id_tahun_anggaran)
    if periode_laporan:
        stmt = stmt.where(HistoricalReportVersion.periode_laporan == periode_laporan)
    stmt = stmt.order_by(desc(HistoricalReportVersion.nomor_versi))
    res = await db.execute(stmt)
    return res.scalars().all()
