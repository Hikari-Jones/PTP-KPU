from typing import Any, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.anggaran import DashboardSummaryResponse
from app.services.anggaran import get_dashboard_summary

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
) -> Any:
    return await get_dashboard_summary(db, id_tahun_anggaran=id_tahun_anggaran)
