"""Deployment-supplied and database-backed authority evidence; administrator status alone is insufficient.
Supports both environment-configured AUTHORITY_GRANTS and DB-backed AuthorityGrant (SK Penugasan) rows.
"""
from datetime import date
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


def has_authority(grants, user_id, action, today=None):
    today = today or date.today()
    for grant in grants or []:
        try:
            if (
                grant['pegawai_id'] == user_id
                and grant['action'] == action
                and grant['document_reference'].strip()
                and date.fromisoformat(grant['valid_from']) <= today <= date.fromisoformat(grant['valid_until'])
            ):
                return True
        except (KeyError, TypeError, ValueError, AttributeError):
            continue
    return False


async def has_authority_async(
    db: AsyncSession,
    grants,
    user_id: int,
    action: str,
    today: date | None = None,
) -> bool:
    today = today or date.today()
    if has_authority(grants, user_id, action, today=today):
        return True
    from app.models.operations import AuthorityGrant

    row = await db.scalar(
        select(AuthorityGrant.id)
        .where(
            AuthorityGrant.pegawai_id == user_id,
            AuthorityGrant.action == action,
            AuthorityGrant.is_active == True,  # noqa: E712
            AuthorityGrant.valid_from <= today,
            AuthorityGrant.valid_until >= today,
        )
        .limit(1)
    )
    return row is not None
