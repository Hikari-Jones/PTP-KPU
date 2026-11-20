"""Dashboard overview: every number, list and activity shown on the main dashboard.

Results are limited to what the requesting user may see, using the same rules as
the source endpoints: workflow letters (owner/assignee, or admin), archives
(internal/public, own, same-department restricted, or admin), and budget events
(own actions, or admin).
"""
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, extract, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, is_admin
from app.core.database import get_db
from app.models.operations import BudgetEvent, WorkflowLetter
from app.models.schema import DokumenArsip, Pegawai

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]


def _letter_scope(user: Pegawai):
    if is_admin(user):
        return []
    return [or_(WorkflowLetter.owner_id == user.id_pegawai, WorkflowLetter.assignee_id == user.id_pegawai)]


def _archive_scope(user: Pegawai):
    conditions = [DokumenArsip.status_hapus == False]  # noqa: E712
    if not is_admin(user):
        visible = [DokumenArsip.hak_akses.in_(["internal", "publik"]), DokumenArsip.id_pegawai == user.id_pegawai]
        if user.id_bagian is not None:
            visible.append(and_(DokumenArsip.hak_akses == "terbatas",
                                DokumenArsip.pegawai.has(Pegawai.id_bagian == user.id_bagian)))
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
    archives = _archive_scope(user)

    # --- Letters -----------------------------------------------------------
    incoming_active = await _count(db, WorkflowLetter, *letters, WorkflowLetter.kind == "masuk",
                                   WorkflowLetter.status.in_(["registered", "assigned"]))
    # What is waiting for THIS user: admins assign/approve, assignees complete,
    # owners rework letters sent back for revision.
    needs_action_conditions = [and_(WorkflowLetter.assignee_id == user.id_pegawai, WorkflowLetter.status == "assigned"),
                               and_(WorkflowLetter.owner_id == user.id_pegawai, WorkflowLetter.status == "revision")]
    if is_admin(user):
        needs_action_conditions.append(WorkflowLetter.status.in_(["registered", "submitted"]))
    needs_action = await _count(db, WorkflowLetter, or_(*needs_action_conditions))

    # --- Archives ----------------------------------------------------------
    month_start = datetime(today.year, today.month, 1)
    archive_total = await _count(db, DokumenArsip, *archives)
    archive_this_month = await _count(db, DokumenArsip, *archives, DokumenArsip.created_at >= month_start)

    # --- Monthly statistics for the selected year --------------------------
    letter_month = extract("month", WorkflowLetter.date)
    letter_rows = (await db.execute(
        select(letter_month, func.count()).where(*letters, extract("year", WorkflowLetter.date) == year)
        .group_by(letter_month))).all()
    archive_month = extract("month", DokumenArsip.created_at)
    archive_rows = (await db.execute(
        select(archive_month, func.count()).where(*archives, extract("year", DokumenArsip.created_at) == year)
        .group_by(archive_month))).all()
    letters_by_month = {int(m): int(c) for m, c in letter_rows}
    archives_by_month = {int(m): int(c) for m, c in archive_rows}
    monthly = [{"bulan": i + 1, "nama_bulan": MONTHS[i],
                "surat": letters_by_month.get(i + 1, 0), "arsip": archives_by_month.get(i + 1, 0)}
               for i in range(12)]

    # --- Recent letters ----------------------------------------------------
    recent_rows = (await db.scalars(
        select(WorkflowLetter).where(*letters).order_by(WorkflowLetter.id.desc()).limit(20))).all()
    recent_letters = [{
        "id": row.id, "kind": row.kind, "number": row.number, "subject": row.subject,
        "sender": row.sender, "recipient": row.recipient, "date": row.date.isoformat(), "status": row.status,
    } for row in recent_rows[:5]]

    # --- Recent activity (letters history, archive uploads, budget audit) ---
    activity = []
    for row in recent_rows:
        for event in (row.history or [])[-5:]:
            activity.append({"type": "surat", "action": event.get("action"), "title": row.subject,
                             "actor": event.get("actor"), "at": event.get("at")})
    archive_recent = (await db.execute(
        select(DokumenArsip.nama_dokumen, DokumenArsip.created_at, Pegawai.nama)
        .join(Pegawai, Pegawai.id_pegawai == DokumenArsip.id_pegawai)
        .where(*archives).order_by(DokumenArsip.created_at.desc()).limit(5))).all()
    for name, created, actor in archive_recent:
        activity.append({"type": "arsip", "action": "upload", "title": name, "actor": actor, "at": _iso(created)})
    budget_query = (select(BudgetEvent, Pegawai.nama).join(Pegawai, Pegawai.id_pegawai == BudgetEvent.actor_id)
                    .order_by(BudgetEvent.id.desc()).limit(5))
    if not is_admin(user):
        budget_query = budget_query.where(BudgetEvent.actor_id == user.id_pegawai)
    for event, actor in (await db.execute(budget_query)).all():
        snapshot = event.snapshot or {}
        activity.append({"type": "anggaran", "action": event.action,
                         "title": snapshot.get("nomor_dokumen") or snapshot.get("uraian_kegiatan") or f"Realisasi #{event.realization_id}",
                         "actor": actor, "at": _iso(event.recorded_at)})
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
        "arsip_total": archive_total,
        "arsip_bulan_ini": archive_this_month,
        "monthly": monthly,
        "recent_letters": recent_letters,
        "recent_activity": activity,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
