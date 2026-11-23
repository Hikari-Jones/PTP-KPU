from typing import Any, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.anggaran import DashboardSummaryResponse, MonthlyReportResponse
from app.services.anggaran import get_dashboard_summary, get_monthly_report

router = APIRouter()


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
