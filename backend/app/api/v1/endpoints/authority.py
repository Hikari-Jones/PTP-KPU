"""Database-backed SK Penugasan / Authority Grant management endpoints."""
from datetime import date, datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, is_admin, require_admin
from app.core.database import get_db
from app.models.operations import AuthorityGrant
from app.models.schema import Pegawai

router = APIRouter(prefix="/authority-grants", tags=["Kewenangan & SK Penugasan"])

VALID_ACTIONS = (
    "number_official_letter",
    "sign_official_letter",
    "verify_budget",
    "approve_disposal",
    "access_secret_archive",
)


class AuthorityGrantCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    pegawai_id: int
    action: Literal[
        "number_official_letter",
        "sign_official_letter",
        "verify_budget",
        "approve_disposal",
        "access_secret_archive",
    ]
    jabatan_penugasan: Optional[str] = Field(None, max_length=200)
    document_reference: str = Field(..., min_length=2, max_length=200)
    valid_from: date
    valid_until: date


def _grant_out(grant: AuthorityGrant, nama_pegawai: Optional[str] = None) -> dict:
    return {
        "id": grant.id,
        "pegawai_id": grant.pegawai_id,
        "nama_pegawai": nama_pegawai,
        "action": grant.action,
        "jabatan_penugasan": grant.jabatan_penugasan,
        "document_reference": grant.document_reference,
        "valid_from": grant.valid_from.isoformat(),
        "valid_until": grant.valid_until.isoformat(),
        "is_active": bool(grant.is_active),
        "granted_by": grant.granted_by,
        "created_at": grant.created_at.isoformat() if grant.created_at else None,
        "revoked_at": grant.revoked_at.isoformat() if grant.revoked_at else None,
    }


@router.get("")
@router.get("/")
async def list_authority_grants(
    include_revoked: bool = Query(False),
    action: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(get_current_user),
):
    stmt = (
        select(AuthorityGrant, Pegawai.nama)
        .join(Pegawai, Pegawai.id_pegawai == AuthorityGrant.pegawai_id, isouter=True)
        .order_by(AuthorityGrant.id.desc())
    )
    if not is_admin(current_user):
        stmt = stmt.where(AuthorityGrant.pegawai_id == current_user.id_pegawai)
    if not include_revoked:
        stmt = stmt.where(AuthorityGrant.is_active == True)  # noqa: E712
    if action:
        stmt = stmt.where(AuthorityGrant.action == action)
    rows = (await db.execute(stmt)).all()
    return [_grant_out(g, nama) for g, nama in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_authority_grant(
    payload: AuthorityGrantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
):
    if payload.valid_until < payload.valid_from:
        raise HTTPException(422, "Tanggal berakhir berlaku tidak boleh sebelum tanggal mulai")
    target = await db.get(Pegawai, payload.pegawai_id)
    if not target or not target.is_active:
        raise HTTPException(404, "Pegawai penerima kewenangan tidak ditemukan atau tidak aktif")
    grant = AuthorityGrant(
        pegawai_id=payload.pegawai_id,
        action=payload.action,
        jabatan_penugasan=payload.jabatan_penugasan,
        document_reference=payload.document_reference,
        valid_from=payload.valid_from,
        valid_until=payload.valid_until,
        is_active=True,
        granted_by=current_user.id_pegawai,
    )
    db.add(grant)
    await db.commit()
    await db.refresh(grant)
    return _grant_out(grant, target.nama)


@router.delete("/{grant_id}")
async def revoke_authority_grant(
    grant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Pegawai = Depends(require_admin),
):
    grant = await db.get(AuthorityGrant, grant_id)
    if not grant:
        raise HTTPException(404, "Penugasan kewenangan tidak ditemukan")
    grant.is_active = False
    grant.revoked_at = datetime.utcnow()
    await db.commit()
    await db.refresh(grant)
    target = await db.get(Pegawai, grant.pegawai_id)
    return _grant_out(grant, target.nama if target else None)
