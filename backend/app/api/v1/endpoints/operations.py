from datetime import date, datetime, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.auth import get_current_user, require_admin, is_admin
from app.core.database import get_db
from app.models.schema import Pegawai, FileRecord
from app.models.operations import WorkflowLetter, BugReport

router = APIRouter(prefix='/operations', tags=['Operations'])

class LetterInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    kind: Literal['masuk', 'keluar']
    subject: str = Field(min_length=1, max_length=255)
    sender: str = Field(min_length=1, max_length=255)
    recipient: str = Field(min_length=1, max_length=255)
    number: str | None = Field(None, max_length=150)
    content: str = Field('', max_length=100000)
    date: date
    file_id: int | None = None

class ActionInput(BaseModel):
    action: Literal['submit', 'revise', 'approve', 'assign', 'complete', 'archive', 'edit']
    version: int
    note: str = Field('', max_length=4000)
    assignee_id: int | None = None
    content: str | None = Field(None, max_length=100000)


def can_read(letter, user):
    return is_admin(user) or user.id_pegawai in (letter.owner_id, letter.assignee_id)


def event(user, action, note):
    return {'at': datetime.now(timezone.utc).isoformat(), 'actor': user.nama,
            'actor_id': user.id_pegawai, 'action': action, 'note': note}


def output(row):
    return {c.name: getattr(row, c.name) for c in row.__table__.columns}

@router.get('/letters')
async def letters(response: Response, skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
                  kind: Literal['masuk', 'keluar'] | None = None,
                  db: AsyncSession = Depends(get_db), user: Pegawai = Depends(get_current_user)):
    q = select(WorkflowLetter).order_by(WorkflowLetter.id.desc())
    if not is_admin(user):
        q = q.where(or_(WorkflowLetter.owner_id == user.id_pegawai, WorkflowLetter.assignee_id == user.id_pegawai))
    if kind: q = q.where(WorkflowLetter.kind == kind)
    response.headers['X-Total-Count'] = str(await db.scalar(select(func.count()).select_from(q.order_by(None).subquery())))
    return [output(x) for x in (await db.scalars(q.offset(skip).limit(limit))).all()]

@router.post('/letters', status_code=201)
async def create_letter(payload: LetterInput, db: AsyncSession = Depends(get_db), user: Pegawai = Depends(get_current_user)):
    if not is_admin(user) and not (user.bagian and any(x in user.bagian.nama_bagian.lower() for x in ['umum', 'umlog'])):
        raise HTTPException(403, 'Hanya bagian Umum/Logistik atau admin dapat membuat surat')
    if payload.file_id:
        f = await db.get(FileRecord, payload.file_id)
        if not f or f.uploaded_by != user.id_pegawai:
            raise HTTPException(403, 'Berkas bukan milik pengguna')
    item = WorkflowLetter(**payload.model_dump(), owner_id=user.id_pegawai,
        status='registered' if payload.kind == 'masuk' else 'draft',
        history=[event(user, 'create', '')])
    if payload.kind == 'keluar':
        item.number = None
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return output(item)

@router.post('/letters/{letter_id}/actions')
async def action(letter_id: int, payload: ActionInput, db: AsyncSession = Depends(get_db), user: Pegawai = Depends(get_current_user)):
    item = await db.scalar(select(WorkflowLetter).where(WorkflowLetter.id == letter_id).with_for_update())
    if not item or not can_read(item, user):
        raise HTTPException(404, 'Surat tidak ditemukan')
    if payload.version != item.version:
        raise HTTPException(409, 'Surat berubah. Muat ulang sebelum melanjutkan.')
    a = payload.action
    from app.core.workflow import transition
    try:
        next_status = transition(item.status, a, is_admin(user), item.assignee_id == user.id_pegawai)
    except PermissionError:
        raise HTTPException(403, 'Tidak berwenang melakukan tindakan ini')
    except ValueError:
        raise HTTPException(409, 'Transisi status tidak valid')
    if a == 'assign':
        target = await db.get(Pegawai, payload.assignee_id) if payload.assignee_id else None
        if not target or not target.is_active:
            raise HTTPException(422, 'Penerima tidak valid')
        item.assignee_id = target.id_pegawai
    if a == 'edit':
        if payload.content is None:
            raise HTTPException(422, 'Isi surat diperlukan')
        item.content = payload.content
    else:
        item.status = next_status
    if a == 'approve':
        # Distinct internal workflow register; never masquerades as the official surat-keluar sequence.
        item.number = f'ALUR/{item.date.year}/{item.id:06d}'
    item.history = [*item.history, event(user, a, payload.note)]
    item.version += 1
    await db.commit()
    await db.refresh(item)
    return output(item)

class BugInput(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    priority: Literal['Rendah', 'Sedang', 'Tinggi'] = 'Sedang'

class BugStatus(BaseModel):
    status: Literal['Terbuka', 'Diproses', 'Selesai']

@router.get('/bugs')
async def bugs(db: AsyncSession = Depends(get_db), user: Pegawai = Depends(get_current_user)):
    q = select(BugReport).order_by(BugReport.id.desc())
    if not is_admin(user): q = q.where(BugReport.owner_id == user.id_pegawai)
    return [output(x) for x in (await db.scalars(q)).all()]

@router.post('/bugs', status_code=201)
async def create_bug(payload: BugInput, db: AsyncSession = Depends(get_db), user: Pegawai = Depends(get_current_user)):
    item = BugReport(**payload.model_dump(), owner_id=user.id_pegawai)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return output(item)

@router.patch('/bugs/{bug_id}')
async def update_bug(bug_id: int, payload: BugStatus, db: AsyncSession = Depends(get_db), user: Pegawai = Depends(require_admin)):
    item = await db.get(BugReport, bug_id)
    if not item: raise HTTPException(404, 'Laporan tidak ditemukan')
    item.status = payload.status
    await db.commit()
    return output(item)

@router.get('/admin-status')
async def admin_status(db: AsyncSession = Depends(get_db), user: Pegawai = Depends(require_admin)):
    from app.core.config import settings
    from app.models.operations import BudgetEvent
    counts = {}
    for name, model in [('users', Pegawai), ('letters', WorkflowLetter), ('budget_events', BudgetEvent)]:
        counts[name] = await db.scalar(select(func.count()).select_from(model))
    counts['active_users'] = await db.scalar(select(func.count()).select_from(Pegawai).where(Pegawai.is_active == True))
    return {**counts, 'official_issuance_enabled': settings.OFFICIAL_ISSUANCE_ENABLED,
            'checked_at': datetime.now(timezone.utc).isoformat()}
