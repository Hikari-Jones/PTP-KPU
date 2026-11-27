"""Dashboard overview: every number, list and activity shown on the main dashboard.

Results are limited to what the requesting user may see, using the same rules as
the source endpoints: workflow letters (owner/assignee/prior participant, or admin),
official outgoing letters & Surat Tugas (letter manager, creator, disposisi, pelaksana),
archives (internal/public, own, same-department restricted, or admin), and budget events
(own actions, or admin).
"""
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, extract, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, is_admin, is_letter_manager
from app.core.database import get_db
from app.models.operations import BudgetEvent, WorkflowLetter
from app.models.schema import (
    Disposisi,
    DokumenArsip,
    Pegawai,
    RiwayatStatusSurat,
    SuratKeluar,
    SuratTugas,
    SuratTugasPelaksana,
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]


def _letter_scope(user: Pegawai):
    if is_admin(user):
        return []
    token = f"%,{user.id_pegawai},%"
    return [
        or_(
            WorkflowLetter.owner_id == user.id_pegawai,
            WorkflowLetter.assignee_id == user.id_pegawai,
            WorkflowLetter.participant_tokens.like(token),
        )
    ]


def _surat_keluar_scope(user: Pegawai):
    if is_letter_manager(user):
        return []
    received = select(Disposisi.id_surat_keluar).where(Disposisi.id_pegawai == user.id_pegawai)
    st_mine = (
        select(SuratTugas.id_surat_keluar)
        .join(SuratTugasPelaksana, SuratTugasPelaksana.id_surat_tugas == SuratTugas.id_surat_tugas)
        .where(SuratTugasPelaksana.id_pegawai == user.id_pegawai)
    )
    return [
        or_(
            SuratKeluar.id_pegawai == user.id_pegawai,
            SuratKeluar.id_surat_keluar.in_(received),
            SuratKeluar.id_surat_keluar.in_(st_mine),
        )
    ]


def _archive_scope(user: Pegawai):
    conditions = [DokumenArsip.status_hapus == False]  # noqa: E712
    if not is_admin(user):
        visible = [
            DokumenArsip.hak_akses.in_(["biasa", "internal", "publik"]),
            DokumenArsip.id_pegawai == user.id_pegawai,
        ]
        if user.id_bagian is not None:
            visible.append(
                and_(
                    DokumenArsip.hak_akses == "terbatas",
                    DokumenArsip.pegawai.has(Pegawai.id_bagian == user.id_bagian),
                )
            )
        conditions.append(or_(*visible))
    return conditions


def _iso(value) -> Optional[str]:
    """Timestamps are stored in UTC; naive values are marked as UTC."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, datetime) and value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


async def _count(db: AsyncSession, model, *conditions) -> int:
    return int(await db.scalar(select(func.count()).select_from(model).where(*conditions)) or 0)


@router.get("/overview")
async def overview(
    year: Optional[int] = Query(None, ge=2000, le=2100),
    db: AsyncSession = Depends(get_db),
    user: Pegawai = Depends(get_current_user),
):
    today = date.today()
    year = year or today.year
    letters = _letter_scope(user)
    sk_scope = _surat_keluar_scope(user)
    archives = _archive_scope(user)

    # --- Workflow Letters (Surat Masuk & Alur Internal) --------------------
    incoming_active = await _count(
        db,
        WorkflowLetter,
        *letters,
        WorkflowLetter.kind == "masuk",
        WorkflowLetter.status.in_(["registered", "assigned"]),
    )
    needs_action_conditions = [
        and_(WorkflowLetter.assignee_id == user.id_pegawai, WorkflowLetter.status == "assigned"),
        and_(WorkflowLetter.owner_id == user.id_pegawai, WorkflowLetter.status == "revision"),
    ]
    if is_admin(user):
        needs_action_conditions.append(WorkflowLetter.status.in_(["registered", "submitted"]))
    wl_needs_action = await _count(db, WorkflowLetter, or_(*needs_action_conditions))

    # --- Official Outgoing Letters & Surat Tugas ---------------------------
    surat_keluar_total = await _count(db, SuratKeluar, *sk_scope)
    sk_needs_conditions = [
        and_(SuratKeluar.id_pegawai == user.id_pegawai, SuratKeluar.status == "revisi"),
    ]
    if is_letter_manager(user):
        sk_needs_conditions.append(SuratKeluar.status == "diajukan")
    surat_keluar_perlu_tindakan = await _count(db, SuratKeluar, or_(*sk_needs_conditions))
    needs_action = wl_needs_action + surat_keluar_perlu_tindakan

    st_conditions = [SuratTugas.tanggal_selesai >= today]
    if not is_letter_manager(user):
        mine_pel = select(SuratTugasPelaksana.id_surat_tugas).where(SuratTugasPelaksana.id_pegawai == user.id_pegawai)
        mine_sk = select(SuratKeluar.id_surat_keluar).where(SuratKeluar.id_pegawai == user.id_pegawai)
        st_conditions.append(or_(SuratTugas.id_surat_tugas.in_(mine_pel), SuratTugas.id_surat_keluar.in_(mine_sk)))
    surat_tugas_aktif = await _count(db, SuratTugas, *st_conditions)

    # --- Archives ----------------------------------------------------------
    month_start = datetime(today.year, today.month, 1)
    archive_total = await _count(db, DokumenArsip, *archives)
    archive_this_month = await _count(db, DokumenArsip, *archives, DokumenArsip.created_at >= month_start)

    # --- Monthly statistics for the selected year --------------------------
    letter_month = extract("month", WorkflowLetter.date)
    letter_rows = (
        await db.execute(
            select(letter_month, func.count())
            .where(*letters, extract("year", WorkflowLetter.date) == year)
            .group_by(letter_month)
        )
    ).all()
    sk_month = extract("month", SuratKeluar.tanggal_surat)
    sk_rows = (
        await db.execute(
            select(sk_month, func.count())
            .where(*sk_scope, SuratKeluar.tahun == year)
            .group_by(sk_month)
        )
    ).all()
    archive_month = extract("month", DokumenArsip.created_at)
    archive_rows = (
        await db.execute(
            select(archive_month, func.count())
            .where(*archives, extract("year", DokumenArsip.created_at) == year)
            .group_by(archive_month)
        )
    ).all()
    letters_by_month = {int(m): int(c) for m, c in letter_rows}
    for m, c in sk_rows:
        letters_by_month[int(m)] = letters_by_month.get(int(m), 0) + int(c)
    archives_by_month = {int(m): int(c) for m, c in archive_rows}
    monthly = [
        {
            "bulan": i + 1,
            "nama_bulan": MONTHS[i],
            "surat": letters_by_month.get(i + 1, 0),
            "arsip": archives_by_month.get(i + 1, 0),
        }
        for i in range(12)
    ]

    # --- Recent letters (unified WorkflowLetter + SuratKeluar) -------------
    recent_rows = (
        await db.scalars(select(WorkflowLetter).where(*letters).order_by(WorkflowLetter.id.desc()).limit(10))
    ).all()
    recent_sk = (
        await db.scalars(select(SuratKeluar).where(*sk_scope).order_by(SuratKeluar.id_surat_keluar.desc()).limit(10))
    ).all()

    unified_recent = [
        {
            "id": row.id,
            "kind": row.kind,
            "number": row.number or row.nomor_agenda,
            "subject": row.subject,
            "sender": row.sender,
            "recipient": row.recipient,
            "date": row.date.isoformat(),
            "status": row.status,
            "source": "workflow_letter",
        }
        for row in recent_rows
    ] + [
        {
            "id": sk.id_surat_keluar,
            "kind": "keluar",
            "number": sk.nomor_surat,
            "subject": sk.perihal,
            "sender": "KPU Provinsi Sulawesi Utara",
            "recipient": sk.tujuan_surat,
            "date": sk.tanggal_surat.isoformat(),
            "status": sk.status,
            "source": "surat_keluar",
        }
        for sk in recent_sk
    ]
    recent_letters = sorted(unified_recent, key=lambda x: (x["date"], x["id"]), reverse=True)[:5]

    # --- Recent activity ---------------------------------------------------
    activity = []
    for row in recent_rows:
        for ev in (row.history or [])[-5:]:
            activity.append(
                {
                    "type": "surat",
                    "action": ev.get("action"),
                    "title": row.subject,
                    "actor": ev.get("actor"),
                    "at": ev.get("at"),
                }
            )
    if recent_sk:
        sk_ids = [sk.id_surat_keluar for sk in recent_sk]
        sk_map = {sk.id_surat_keluar: sk.perihal for sk in recent_sk}
        sk_hist = (
            await db.execute(
                select(RiwayatStatusSurat, Pegawai.nama)
                .join(Pegawai, Pegawai.id_pegawai == RiwayatStatusSurat.id_pegawai, isouter=True)
                .where(RiwayatStatusSurat.id_surat_keluar.in_(sk_ids))
                .order_by(RiwayatStatusSurat.id_riwayat.desc())
                .limit(5)
            )
        ).all()
        for hist_row, actor_name in sk_hist:
            activity.append(
                {
                    "type": "surat",
                    "action": hist_row.status_baru,
                    "title": sk_map.get(hist_row.id_surat_keluar, f"Surat #{hist_row.id_surat_keluar}"),
                    "actor": actor_name or f"Pegawai #{hist_row.id_pegawai}",
                    "at": _iso(hist_row.waktu),
                }
            )
    archive_recent = (
        await db.execute(
            select(DokumenArsip.nama_dokumen, DokumenArsip.created_at, Pegawai.nama)
            .join(Pegawai, Pegawai.id_pegawai == DokumenArsip.id_pegawai)
            .where(*archives)
            .order_by(DokumenArsip.created_at.desc())
            .limit(5)
        )
    ).all()
    for name, created, actor in archive_recent:
        activity.append({"type": "arsip", "action": "upload", "title": name, "actor": actor, "at": _iso(created)})
    budget_query = (
        select(BudgetEvent, Pegawai.nama)
        .join(Pegawai, Pegawai.id_pegawai == BudgetEvent.actor_id)
        .order_by(BudgetEvent.id.desc())
        .limit(5)
    )
    if not is_admin(user):
        budget_query = budget_query.where(BudgetEvent.actor_id == user.id_pegawai)
    for ev, actor in (await db.execute(budget_query)).all():
        snapshot = ev.snapshot or {}
        activity.append(
            {
                "type": "anggaran",
                "action": ev.action,
                "title": snapshot.get("nomor_dokumen")
                or snapshot.get("uraian_kegiatan")
                or f"Realisasi #{ev.realization_id}",
                "actor": actor,
                "at": _iso(ev.recorded_at),
            }
        )

    def moment(item):
        try:
            parsed = datetime.fromisoformat(item["at"])
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            return datetime.min.replace(tzinfo=timezone.utc)

    activity = sorted((a for a in activity if a["at"]), key=moment, reverse=True)[:6]

    return {
        "year": year,
        "surat_masuk_aktif": incoming_active,
        "surat_perlu_tindakan": needs_action,
        "surat_keluar_total": surat_keluar_total,
        "surat_keluar_perlu_tindakan": surat_keluar_perlu_tindakan,
        "surat_tugas_aktif": surat_tugas_aktif,
        "arsip_total": archive_total,
        "arsip_bulan_ini": archive_this_month,
        "monthly": monthly,
        "recent_letters": recent_letters,
        "recent_activity": activity,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
