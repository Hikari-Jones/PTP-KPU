import json
from decimal import Decimal
from typing import Any, Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, desc, func, select

from app.core.database import get_db
from app.core.auth import get_current_user, get_effective_subbagian_id, require_rendatin_or_keuangan
from app.models.schema import AkunAnggaran, PaguAnggaran, Pegawai, RealisasiAnggaran, TahunAnggaran
from app.models.operations import HistoricalReportVersion, FinancialAuditLog
from app.schemas.anggaran import DashboardSummaryResponse, MonthlyReportResponse
from app.services.anggaran import get_dashboard_summary, get_monthly_report, tahun_anggaran as tahun_service

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
    description="Menyajikan metrik agregat anggaran makro: total pagu aktif, total realisasi terverifikasi, sisa anggaran, persentase serapan, dan hitungan transaksi. Subbagian non-RENDATIN/Keuangan otomatis dibatasi pada datanya sendiri.",
)
async def read_dashboard_summary(
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
    id_tahun_anggaran: Optional[int] = Query(None, description="ID tahun anggaran (default ke tahun anggaran aktif jika tidak diisi)"),
    id_akun_anggaran: Optional[int] = Query(None, description="ID akun anggaran (MAK) untuk filter spesifik akun"),
    id_bagian: Optional[int] = Query(None, description="ID bagian/divisi untuk filter spesifik bagian"),
    bulan: Optional[int] = Query(None, ge=1, le=12, description="Filter bulan spesifik (1-12)"),
) -> Any:
    effective_bagian = get_effective_subbagian_id(current_user, id_bagian)
    return await get_dashboard_summary(
        db,
        id_tahun_anggaran=id_tahun_anggaran,
        id_akun_anggaran=id_akun_anggaran,
        id_bagian=effective_bagian,
        bulan=bulan,
    )


@router.get(
    "/monthly-report",
    response_model=MonthlyReportResponse,
    summary="Laporan Bulanan Realisasi Anggaran (12 Bulan)",
    description="Menyajikan matriks laporan serapan anggaran 12 bulan (Januari-Desember) per akun anggaran berdasarkan tahun anggaran, filter akun, dan filter bagian. Subbagian non-RENDATIN/Keuangan otomatis dibatasi pada datanya sendiri.",
)
async def read_monthly_report(
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
    id_tahun_anggaran: Optional[int] = Query(None, description="ID tahun anggaran (default ke tahun anggaran aktif jika tidak diisi)"),
    id_akun_anggaran: Optional[int] = Query(None, description="ID akun anggaran (MAK) untuk filter spesifik akun"),
    id_bagian: Optional[int] = Query(None, description="ID bagian/divisi untuk filter spesifik bagian"),
) -> Any:
    effective_bagian = get_effective_subbagian_id(current_user, id_bagian)
    return await get_monthly_report(
        db,
        id_tahun_anggaran=id_tahun_anggaran,
        id_akun_anggaran=id_akun_anggaran,
        id_bagian=effective_bagian,
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
    current_user: Pegawai = Depends(require_rendatin_or_keuangan),
) -> Any:
    ta_res = await db.execute(
        select(TahunAnggaran)
        .where(TahunAnggaran.id_tahun_anggaran == payload.id_tahun_anggaran)
        .with_for_update()
    )
    ta = ta_res.scalar_one_or_none()
    if not ta:
        raise HTTPException(status_code=404, detail="Tahun anggaran tidak ditemukan")

    # Generate current report snapshot (serialize Decimal/date safely for JSON column)
    report_data = await get_monthly_report(db, id_tahun_anggaran=ta.id_tahun_anggaran)
    raw_snapshot = report_data.model_dump() if hasattr(report_data, 'model_dump') else dict(report_data)
    snapshot = json.loads(json.dumps(raw_snapshot, default=str))

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
    current_user: Pegawai = Depends(require_rendatin_or_keuangan),
) -> Any:
    stmt = select(HistoricalReportVersion).where(HistoricalReportVersion.id_tahun_anggaran == id_tahun_anggaran)
    if periode_laporan:
        stmt = stmt.where(HistoricalReportVersion.periode_laporan == periode_laporan)
    stmt = stmt.order_by(desc(HistoricalReportVersion.nomor_versi))
    res = await db.execute(stmt)
    return res.scalars().all()


@router.get(
    "/audit-logs",
    summary="Daftar Log Audit Keuangan (Immutable)",
    description="Menampilkan jejak audit keuangan (revisi pagu, koreksi SSPB, perubahan transaksi, penerbitan laporan) khusus Keuangan/RENDATIN.",
)
async def list_financial_audit_logs(
    response: Response,
    id_tahun_anggaran: Optional[int] = Query(None),
    aksi: Optional[str] = Query(None),
    nama_tabel: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_rendatin_or_keuangan),
) -> Any:
    conditions = []
    if id_tahun_anggaran is not None:
        conditions.append(FinancialAuditLog.id_tahun_anggaran == id_tahun_anggaran)
    if aksi:
        conditions.append(FinancialAuditLog.aksi == aksi)
    if nama_tabel:
        conditions.append(FinancialAuditLog.nama_tabel == nama_tabel)

    count_stmt = select(func.count(FinancialAuditLog.id_log))
    if conditions:
        count_stmt = count_stmt.where(and_(*conditions))
    total = int(await db.scalar(count_stmt) or 0)
    response.headers["X-Total-Count"] = str(total)

    stmt = select(FinancialAuditLog).order_by(desc(FinancialAuditLog.id_log)).offset(skip).limit(limit)
    if conditions:
        stmt = stmt.where(and_(*conditions))
    rows = (await db.scalars(stmt)).all()
    return {
        "total": total,
        "items": [
            {
                "id_log": r.id_log,
                "id_pegawai": r.id_pegawai,
                "nama_pegawai": r.nama_pegawai,
                "waktu_aksi": r.waktu_aksi.isoformat() if r.waktu_aksi else None,
                "aksi": r.aksi,
                "nama_tabel": r.nama_tabel,
                "id_entitas": r.id_entitas,
                "id_tahun_anggaran": r.id_tahun_anggaran,
                "tahun": r.tahun,
                "nilai_sebelum": r.nilai_sebelum,
                "nilai_sesudah": r.nilai_sesudah,
                "alasan": r.alasan,
            }
            for r in rows
        ],
    }


@router.get(
    "/triwulan-rpd",
    summary="Laporan Realisasi per Triwulan & Deviasi RPD Halaman III DIPA",
    description="Membandingkan target Rencana Penarikan Dana (RPD) Triwulan I–IV terhadap realisasi terverifikasi serta menampilkan total pagu blokir dan efektif.",
)
async def get_triwulan_rpd(
    id_tahun_anggaran: Optional[int] = Query(None),
    id_bagian: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
) -> Any:
    effective_bagian = get_effective_subbagian_id(current_user, id_bagian)
    if not id_tahun_anggaran:
        active_yr = await tahun_service.get_active_year(db)
        id_tahun_anggaran = active_yr.id_tahun_anggaran if active_yr else None
        tahun_val = active_yr.tahun if active_yr else None
    else:
        yr = await db.get(TahunAnggaran, id_tahun_anggaran)
        if not yr:
            raise HTTPException(404, "Tahun anggaran tidak ditemukan")
        tahun_val = yr.tahun

    if not id_tahun_anggaran:
        return {
            "id_tahun_anggaran": None,
            "tahun": None,
            "total_pagu_aktif": Decimal("0.00"),
            "total_pagu_blokir": Decimal("0.00"),
            "total_pagu_efektif": Decimal("0.00"),
            "triwulan": [],
        }

    pagu_conds = [PaguAnggaran.id_tahun_anggaran == id_tahun_anggaran]
    if effective_bagian is not None:
        pagu_conds.append(PaguAnggaran.akun_anggaran.has(AkunAnggaran.id_bagian == effective_bagian))

    pagu_agg = (
        await db.execute(
            select(
                func.coalesce(func.sum(PaguAnggaran.pagu_aktif), Decimal("0.00")),
                func.coalesce(func.sum(PaguAnggaran.pagu_blokir), Decimal("0.00")),
                func.coalesce(func.sum(PaguAnggaran.rpd_triwulan_1), Decimal("0.00")),
                func.coalesce(func.sum(PaguAnggaran.rpd_triwulan_2), Decimal("0.00")),
                func.coalesce(func.sum(PaguAnggaran.rpd_triwulan_3), Decimal("0.00")),
                func.coalesce(func.sum(PaguAnggaran.rpd_triwulan_4), Decimal("0.00")),
            ).where(and_(*pagu_conds))
        )
    ).one()

    total_pagu_aktif = Decimal(str(pagu_agg[0] or 0))
    total_pagu_blokir = Decimal(str(pagu_agg[1] or 0))
    total_pagu_efektif = total_pagu_aktif - total_pagu_blokir
    targets = [Decimal(str(pagu_agg[i] or 0)) for i in range(2, 6)]

    real_conds = [
        PaguAnggaran.id_tahun_anggaran == id_tahun_anggaran,
        RealisasiAnggaran.status == "verified",
    ]
    if effective_bagian is not None:
        real_conds.append(PaguAnggaran.akun_anggaran.has(AkunAnggaran.id_bagian == effective_bagian))

    month_col = func.extract("month", RealisasiAnggaran.tanggal_transaksi)
    rows = (
        await db.execute(
            select(
                month_col.label("m"),
                func.coalesce(func.sum(RealisasiAnggaran.jumlah_realisasi), Decimal("0.00")).label("tot"),
            )
            .join(PaguAnggaran, RealisasiAnggaran.id_pagu == PaguAnggaran.id_pagu)
            .where(and_(*real_conds))
            .group_by(month_col)
        )
    ).all()

    q_actual = [Decimal("0.00"), Decimal("0.00"), Decimal("0.00"), Decimal("0.00")]
    for r in rows:
        m = int(r.m)
        q_idx = min(max((m - 1) // 3, 0), 3)
        q_actual[q_idx] += Decimal(str(r.tot or 0))

    labels = ["Triwulan I (Jan–Mar)", "Triwulan II (Apr–Jun)", "Triwulan III (Jul–Sep)", "Triwulan IV (Okt–Des)"]
    triwulan = []
    for idx in range(4):
        target = targets[idx]
        actual = q_actual[idx]
        deviasi = actual - target
        deviasi_pct = round(float((abs(deviasi) / target) * 100), 2) if target > 0 else 0.0
        capaian_pct = round(float((actual / target) * 100), 2) if target > 0 else 0.0
        triwulan.append({
            "triwulan": idx + 1,
            "label": labels[idx],
            "target_rpd": target,
            "realisasi_verified": actual,
            "deviasi": deviasi,
            "deviasi_persen": deviasi_pct,
            "capaian_persen": capaian_pct,
        })

    return {
        "id_tahun_anggaran": id_tahun_anggaran,
        "tahun": tahun_val,
        "total_pagu_aktif": total_pagu_aktif,
        "total_pagu_blokir": total_pagu_blokir,
        "total_pagu_efektif": total_pagu_efektif,
        "triwulan": triwulan,
    }
