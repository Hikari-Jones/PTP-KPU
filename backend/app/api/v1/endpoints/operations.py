import io
from datetime import date, datetime, timezone
from typing import List, Literal, Optional
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, is_admin, require_admin
from app.core.database import get_db
from app.models.operations import BugReport, WorkflowLetter
from app.models.schema import FileRecord, KodeKlasifikasiArsip, Pegawai
from app.services.arsip_sync import safe_sync

router = APIRouter(prefix="/operations", tags=["Operations"])


class LetterInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    kind: Literal["masuk", "keluar"]
    subject: str = Field(min_length=1, max_length=255)
    sender: str = Field(min_length=1, max_length=255)
    recipient: str = Field(min_length=1, max_length=255)
    number: str | None = Field(None, max_length=150)
    content: str = Field("", max_length=100000)
    date: date
    file_id: int | None = None
    sifat_surat: str = Field("Biasa", max_length=30)
    batas_waktu: date | None = None
    id_klasifikasi: int | None = None


class ActionInput(BaseModel):
    action: Literal["submit", "revise", "approve", "assign", "complete", "archive", "edit"]
    version: int
    note: str = Field("", max_length=4000)
    assignee_id: int | None = None
    content: str | None = Field(None, max_length=100000)
    instruksi_disposisi: Optional[List[str]] = None
    batas_waktu: Optional[date] = None


def _participants_list(letter: WorkflowLetter) -> list[int]:
    ids: list[int] = []
    for x in (letter.participant_ids or []):
        try:
            v = int(x)
            if v not in ids:
                ids.append(v)
        except (TypeError, ValueError):
            continue
    for x in (letter.owner_id, letter.assignee_id):
        if x is not None and x not in ids:
            ids.append(int(x))
    return ids


def _participant_tokens(ids: list[int]) -> str:
    clean = sorted({int(x) for x in ids if x is not None})
    return f",{','.join(str(x) for x in clean)}," if clean else ""


def can_read(letter: WorkflowLetter, user: Pegawai) -> bool:
    if is_admin(user):
        return True
    return user.id_pegawai in _participants_list(letter)


def event(user: Pegawai, action: str, note: str, **extra):
    entry = {
        "at": datetime.now(timezone.utc).isoformat(),
        "actor": user.nama,
        "actor_id": user.id_pegawai,
        "action": action,
        "note": note,
    }
    entry.update({k: v for k, v in extra.items() if v is not None})
    return entry


def output(row):
    data = {c.name: getattr(row, c.name) for c in row.__table__.columns if c.name != "participant_tokens"}
    return data


@router.get("/letters")
async def letters(
    response: Response,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    kind: Literal["masuk", "keluar"] | None = None,
    search: str | None = Query(None, max_length=100),
    status: str | None = Query(None, max_length=30),
    year: int | None = Query(None, ge=1900, le=2100),
    sifat_surat: str | None = Query(None, max_length=30),
    db: AsyncSession = Depends(get_db),
    user: Pegawai = Depends(get_current_user),
):
    q = select(WorkflowLetter).order_by(WorkflowLetter.id.desc())
    if not is_admin(user):
        token = f"%,{user.id_pegawai},%"
        q = q.where(
            or_(
                WorkflowLetter.owner_id == user.id_pegawai,
                WorkflowLetter.assignee_id == user.id_pegawai,
                WorkflowLetter.participant_tokens.like(token),
            )
        )
    if kind:
        q = q.where(WorkflowLetter.kind == kind)
    if status:
        q = q.where(WorkflowLetter.status == status)
    if sifat_surat:
        q = q.where(WorkflowLetter.sifat_surat == sifat_surat)
    if year:
        q = q.where(func.extract("year", WorkflowLetter.date) == year)
    if search and search.strip():
        escaped = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        term = f"%{escaped}%"
        q = q.where(
            or_(
                WorkflowLetter.subject.ilike(term, escape="\\"),
                WorkflowLetter.sender.ilike(term, escape="\\"),
                WorkflowLetter.recipient.ilike(term, escape="\\"),
                WorkflowLetter.number.ilike(term, escape="\\"),
                WorkflowLetter.nomor_agenda.ilike(term, escape="\\"),
            )
        )
    response.headers["X-Total-Count"] = str(await db.scalar(select(func.count()).select_from(q.order_by(None).subquery())))
    return [output(x) for x in (await db.scalars(q.offset(skip).limit(limit))).all()]


@router.post("/letters", status_code=201)
async def create_letter(
    payload: LetterInput,
    db: AsyncSession = Depends(get_db),
    user: Pegawai = Depends(get_current_user),
):
    if payload.file_id:
        f = await db.get(FileRecord, payload.file_id)
        if not f or f.uploaded_by != user.id_pegawai:
            raise HTTPException(403, "Berkas bukan milik pengguna")
    if payload.id_klasifikasi is not None:
        if not await db.get(KodeKlasifikasiArsip, payload.id_klasifikasi):
            raise HTTPException(422, "Kode klasifikasi tidak ditemukan")

    nomor_agenda = None
    if payload.kind == "masuk":
        yr = payload.date.year
        existing_count = await db.scalar(
            select(func.count())
            .select_from(WorkflowLetter)
            .where(
                WorkflowLetter.kind == "masuk",
                func.extract("year", WorkflowLetter.date) == yr,
            )
        )
        nomor_agenda = f"AGM/{yr}/{(existing_count or 0) + 1:04d}"

    participants = [user.id_pegawai]
    item = WorkflowLetter(
        **payload.model_dump(),
        nomor_agenda=nomor_agenda,
        owner_id=user.id_pegawai,
        status="registered" if payload.kind == "masuk" else "draft",
        history=[event(user, "create", "")],
        participant_ids=participants,
        participant_tokens=_participant_tokens(participants),
    )
    if payload.kind == "keluar":
        item.number = None
    db.add(item)
    await db.commit()
    await safe_sync(db, "workflow_letter", item.id)
    await db.refresh(item)
    return output(item)


@router.post("/letters/{letter_id}/actions")
async def action(
    letter_id: int,
    payload: ActionInput,
    db: AsyncSession = Depends(get_db),
    user: Pegawai = Depends(get_current_user),
):
    item = await db.scalar(select(WorkflowLetter).where(WorkflowLetter.id == letter_id).with_for_update())
    if not item or not can_read(item, user):
        raise HTTPException(404, "Surat tidak ditemukan")
    if payload.version != item.version:
        raise HTTPException(409, "Surat berubah. Muat ulang sebelum melanjutkan.")
    a = payload.action
    from app.core.workflow import transition

    try:
        next_status = transition(item.status, a, is_admin(user), item.assignee_id == user.id_pegawai)
    except PermissionError:
        raise HTTPException(403, "Tidak berwenang melakukan tindakan ini")
    except ValueError:
        raise HTTPException(409, "Transisi status tidak valid")

    extra_event: dict = {}
    if payload.instruksi_disposisi:
        extra_event["instruksi_disposisi"] = payload.instruksi_disposisi
    if payload.batas_waktu:
        item.batas_waktu = payload.batas_waktu
        extra_event["batas_waktu"] = payload.batas_waktu.isoformat()

    if a == "assign":
        target = await db.get(Pegawai, payload.assignee_id) if payload.assignee_id else None
        if not target or not target.is_active:
            raise HTTPException(422, "Penerima tidak valid")
        item.assignee_id = target.id_pegawai
        participants = _participants_list(item)
        if target.id_pegawai not in participants:
            participants.append(target.id_pegawai)
        item.participant_ids = participants
        item.participant_tokens = _participant_tokens(participants)
        extra_event.update({"assignee_id": target.id_pegawai, "assignee_name": target.nama})

    if a == "edit":
        if payload.content is None:
            raise HTTPException(422, "Isi surat diperlukan")
        item.content = payload.content
    else:
        item.status = next_status

    if a == "approve":
        # Distinct internal workflow register; never masquerades as the official surat-keluar sequence.
        item.number = f"ALUR/{item.date.year}/{item.id:06d}"

    item.history = [*item.history, event(user, a, payload.note, **extra_event)]
    item.version += 1
    await db.commit()
    await safe_sync(db, "workflow_letter", item.id)
    await db.refresh(item)
    return output(item)


@router.get("/letters/{letter_id}/lembar-disposisi")
async def export_lembar_disposisi(
    letter_id: int,
    db: AsyncSession = Depends(get_db),
    user: Pegawai = Depends(get_current_user),
):
    item = await db.get(WorkflowLetter, letter_id)
    if not item or not can_read(item, user):
        raise HTTPException(404, "Surat tidak ditemukan")

    buf = io.BytesIO()
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("KopTitle", parent=styles["Title"], fontSize=13, leading=16, spaceAfter=2)
    sub_style = ParagraphStyle("KopSub", parent=styles["Normal"], fontSize=8.5, alignment=1, textColor=colors.HexColor("#475569"))

    story = [
        Paragraph("KOMISI PEMILIHAN UMUM<br/>PROVINSI SULAWESI UTARA", title_style),
        Paragraph("LEMBAR DISPOSISI SURAT MASUK", sub_style),
        Spacer(1, 6),
        HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#991b1b")),
        Spacer(1, 10),
    ]

    meta_rows = [
        ["Nomor Agenda", item.nomor_agenda or f"#{item.id}", "Tanggal Surat", str(item.date)],
        ["Nomor Surat", item.number or "-", "Sifat Surat", item.sifat_surat or "Biasa"],
        ["Asal / Pengirim", item.sender, "Batas Waktu (SLA)", str(item.batas_waktu) if item.batas_waktu else "-"],
        ["Tujuan / Penerima", item.recipient, "Status Saat Ini", item.status],
    ]
    meta_table = Table(meta_rows, colWidths=[3.2 * cm, 5.3 * cm, 3.2 * cm, 4.3 * cm])
    meta_table.setStyle(
        TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f8fafc")),
            ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#f8fafc")),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ])
    )
    story.extend([
        meta_table,
        Spacer(1, 10),
        Paragraph(f"<b>Perihal:</b> {escape(item.subject)}", styles["Normal"]),
        Spacer(1, 6),
        Paragraph(f"<b>Ringkasan Isi:</b><br/>{escape(item.content or '-').replace(chr(10), '<br/>')}", styles["BodyText"]),
        Spacer(1, 12),
        Paragraph("<b>RIWAYAT DISPOSISI &amp; TINDAK LANJUT</b>", styles["Normal"]),
        Spacer(1, 6),
    ])

    hist_rows = [["Waktu", "Pelaksana / Pimpinan", "Aksi", "Tujuan & Instruksi / Catatan"]]
    for h in item.history or []:
        parts = []
        if h.get("assignee_name"):
            parts.append(f"Kepada: {h['assignee_name']}")
        if h.get("instruksi_disposisi"):
            parts.append("Instruksi: " + ", ".join(h["instruksi_disposisi"]))
        if h.get("note"):
            parts.append(f"Catatan: {h['note']}")
        hist_rows.append([
            str(h.get("at", ""))[:19].replace("T", " "),
            str(h.get("actor", "-")),
            str(h.get("action", "-")),
            " | ".join(parts) or "-",
        ])
    hist_table = Table(hist_rows, colWidths=[3.2 * cm, 3.5 * cm, 2.2 * cm, 7.1 * cm])
    hist_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ])
    )
    story.append(hist_table)

    SimpleDocTemplate(buf, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.8 * cm, bottomMargin=1.8 * cm).build(story)
    return Response(
        content=buf.getvalue(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="lembar-disposisi-{item.id}.pdf"',
            "X-Content-Type-Options": "nosniff",
        },
    )


class BugInput(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    priority: Literal["Rendah", "Sedang", "Tinggi"] = "Sedang"


class BugStatus(BaseModel):
    status: Literal["Terbuka", "Diproses", "Selesai"]


@router.get("/bugs")
async def bugs(db: AsyncSession = Depends(get_db), user: Pegawai = Depends(get_current_user)):
    q = (
        select(BugReport, Pegawai.nama.label("pelapor_nama"), Pegawai.nip.label("pelapor_nip"))
        .join(Pegawai, BugReport.owner_id == Pegawai.id_pegawai, isouter=True)
        .order_by(BugReport.id.desc())
    )
    if not is_admin(user):
        q = q.where(BugReport.owner_id == user.id_pegawai)
    rows = (await db.execute(q)).all()
    results = []
    for bug, nama, nip in rows:
        data = output(bug)
        data["pelapor_nama"] = nama or f"Pengguna #{bug.owner_id}"
        data["pelapor_nip"] = nip or "-"
        results.append(data)
    return results


@router.post("/bugs", status_code=201)
async def create_bug(payload: BugInput, db: AsyncSession = Depends(get_db), user: Pegawai = Depends(get_current_user)):
    item = BugReport(**payload.model_dump(), owner_id=user.id_pegawai)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return output(item)


@router.patch("/bugs/{bug_id}")
async def update_bug(bug_id: int, payload: BugStatus, db: AsyncSession = Depends(get_db), user: Pegawai = Depends(require_admin)):
    item = await db.get(BugReport, bug_id)
    if not item:
        raise HTTPException(404, "Laporan tidak ditemukan")
    item.status = payload.status
    await db.commit()
    return output(item)


@router.get("/admin-status")
async def admin_status(db: AsyncSession = Depends(get_db), user: Pegawai = Depends(require_admin)):
    from app.core.config import settings
    from app.models.operations import BudgetEvent

    counts = {}
    for name, model in [("users", Pegawai), ("letters", WorkflowLetter), ("budget_events", BudgetEvent)]:
        counts[name] = await db.scalar(select(func.count()).select_from(model))
    counts["active_users"] = await db.scalar(select(func.count()).select_from(Pegawai).where(Pegawai.is_active == True))  # noqa: E712
    return {
        **counts,
        "official_issuance_enabled": settings.OFFICIAL_ISSUANCE_ENABLED,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
