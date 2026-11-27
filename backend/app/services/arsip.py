from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import and_, distinct, extract, func, or_, select, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.authority import has_authority_async
from app.core.config import settings
from app.models.operations import ArsipAccessGrant, ArsipAuditLog, WorkflowLetter
from app.models.schema import DokumenArsip, Pegawai, Bagian
from app.schemas.arsip import DokumenArsipCreate, DokumenArsipUpdate
from app.services.base import CRUDBase

OPEN_ACCESS_LEVELS = ("biasa", "internal", "publik")


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class CRUDArsip(CRUDBase[DokumenArsip, DokumenArsipCreate, DokumenArsipUpdate]):
    async def _has_secret_authority(self, db: AsyncSession, viewer: Optional[Pegawai]) -> bool:
        if viewer is None:
            return False
        from app.core.auth import is_admin
        if is_admin(viewer):
            return True
        return await has_authority_async(
            db, settings.AUTHORITY_GRANTS, viewer.id_pegawai, "access_secret_archive"
        )

    def _visibility_conditions(
        self, viewer: Optional[Pegawai], *, has_secret_authority: bool = False
    ) -> List[Any]:
        if viewer is None:
            return []
        from app.core.auth import is_admin
        if is_admin(viewer):
            return []

        today = date.today()
        # Explicit per-document SKKAAD access grant (active & not expired)
        grant_subq = select(ArsipAccessGrant.id_dokumen).where(
            ArsipAccessGrant.id_pegawai == viewer.id_pegawai,
            or_(
                ArsipAccessGrant.valid_until.is_(None),
                ArsipAccessGrant.valid_until >= today,
            ),
        )
        # Workflow letter mirror visibility: owner, current assignee, or prior participant
        wl_token = f"%,{viewer.id_pegawai},%"
        wl_subq = select(WorkflowLetter.id).where(
            or_(
                WorkflowLetter.owner_id == viewer.id_pegawai,
                WorkflowLetter.assignee_id == viewer.id_pegawai,
                WorkflowLetter.participant_tokens.like(wl_token),
            )
        )

        clauses: List[Any] = [
            DokumenArsip.hak_akses.in_(OPEN_ACCESS_LEVELS),
            DokumenArsip.id_pegawai == viewer.id_pegawai,
            and_(
                DokumenArsip.ref_tipe == "workflow_letter",
                DokumenArsip.ref_id.in_(wl_subq),
            ),
            and_(
                or_(DokumenArsip.ref_tipe.is_(None), DokumenArsip.ref_tipe != "workflow_letter"),
                DokumenArsip.id_dokumen.in_(grant_subq),
            ),
        ]
        if has_secret_authority:
            clauses.append(
                or_(DokumenArsip.ref_tipe.is_(None), DokumenArsip.ref_tipe != "workflow_letter")
            )
        if viewer.id_bagian is not None:
            clauses.append(
                and_(
                    DokumenArsip.hak_akses == "terbatas",
                    or_(DokumenArsip.ref_tipe.is_(None), DokumenArsip.ref_tipe != "workflow_letter"),
                    DokumenArsip.pegawai.has(Pegawai.id_bagian == viewer.id_bagian),
                )
            )
        return [or_(*clauses)]

    async def can_view(self, db: AsyncSession, doc: DokumenArsip, viewer: Pegawai) -> bool:
        from app.core.auth import is_admin
        if is_admin(viewer) or doc.id_pegawai == viewer.id_pegawai:
            return True
        if doc.ref_tipe == "workflow_letter" and doc.ref_id is not None:
            wl = await db.get(WorkflowLetter, doc.ref_id)
            return bool(
                wl
                and (
                    viewer.id_pegawai in (wl.owner_id, wl.assignee_id)
                    or viewer.id_pegawai in (wl.participant_ids or [])
                )
            )
        if doc.hak_akses in OPEN_ACCESS_LEVELS:
            return True
        if await self._has_secret_authority(db, viewer):
            return True
        if doc.hak_akses == "terbatas" and viewer.id_bagian is not None:
            owner = doc.pegawai or await db.get(Pegawai, doc.id_pegawai)
            if owner and owner.id_bagian == viewer.id_bagian:
                return True
        today = date.today()
        grant = await db.scalar(
            select(ArsipAccessGrant.id).where(
                ArsipAccessGrant.id_dokumen == doc.id_dokumen,
                ArsipAccessGrant.id_pegawai == viewer.id_pegawai,
                or_(
                    ArsipAccessGrant.valid_until.is_(None),
                    ArsipAccessGrant.valid_until >= today,
                ),
            ).limit(1)
        )
        return bool(grant)

    async def log_audit(
        self,
        db: AsyncSession,
        *,
        doc: Optional[DokumenArsip],
        aksi: str,
        actor: Optional[Pegawai],
        detail: Optional[str] = None,
        commit: bool = True,
    ) -> ArsipAuditLog:
        entry = ArsipAuditLog(
            id_dokumen=doc.id_dokumen if doc else None,
            nomor_dokumen=doc.nomor_dokumen if doc else None,
            nama_dokumen=doc.nama_dokumen if doc else None,
            aksi=aksi,
            actor_id=actor.id_pegawai if actor else None,
            actor_nama=actor.nama if actor else None,
            detail=(detail[:500] if detail else None),
        )
        db.add(entry)
        if commit:
            await db.commit()
        return entry

    async def get_by_id(self, db: AsyncSession, id_dokumen: int) -> Optional[DokumenArsip]:
        stmt = (
            select(DokumenArsip)
            .options(
                selectinload(DokumenArsip.pegawai).selectinload(Pegawai.bagian),
                selectinload(DokumenArsip.penghapus),
                selectinload(DokumenArsip.klasifikasi),
            )
            .where(DokumenArsip.id_dokumen == id_dokumen)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_filtered(
        self,
        db: AsyncSession,
        *,
        search: Optional[str] = None,
        year: Optional[int] = None,
        month: Optional[int] = None,
        event: Optional[str] = None,
        kategori: Optional[str] = None,
        hak_akses: Optional[str] = None,
        sub_bagian: Optional[str] = None,
        sumber_modul: Optional[str] = None,
        sub_kategori: Optional[str] = None,
        hapus_status: Optional[str] = None,
        status_retensi: Optional[str] = None,
        arsip_vital: Optional[bool] = None,
        legal_hold: Optional[bool] = None,
        id_klasifikasi: Optional[int] = None,
        status_hapus: bool = False,
        viewer: Optional[Pegawai] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[List[DokumenArsip], int]:
        """
        Dynamic parameterized query filtering for DokumenArsip.
        All primary filtering is performed at database level.
        """
        has_secret = await self._has_secret_authority(db, viewer)
        conditions = [DokumenArsip.status_hapus == status_hapus]
        conditions.extend(self._visibility_conditions(viewer, has_secret_authority=has_secret))

        # 1. Full-text + metadata search (escaped LIKE)
        if search and search.strip():
            term = f"%{_escape_like(search.strip())}%"
            conditions.append(
                or_(
                    DokumenArsip.nama_dokumen.ilike(term, escape="\\"),
                    DokumenArsip.nomor_dokumen.ilike(term, escape="\\"),
                    DokumenArsip.lokasi_fisik.ilike(term, escape="\\"),
                    DokumenArsip.nomor_berkas.ilike(term, escape="\\"),
                    DokumenArsip.extracted_text.ilike(term, escape="\\"),
                )
            )

        if year is not None:
            conditions.append(extract("year", DokumenArsip.tanggal_dokumen) == year)
        if month is not None:
            conditions.append(extract("month", DokumenArsip.tanggal_dokumen) == month)
        if event and event.strip():
            conditions.append(DokumenArsip.event == event.strip())
        if kategori and kategori.strip():
            conditions.append(DokumenArsip.kategori == kategori.strip())
        if hak_akses and hak_akses.strip():
            conditions.append(DokumenArsip.hak_akses == hak_akses.strip())
        if sub_bagian and sub_bagian.strip():
            conditions.append(
                DokumenArsip.pegawai.has(
                    Pegawai.bagian.has(Bagian.nama_bagian == sub_bagian.strip())
                )
            )
        if sumber_modul and sumber_modul.strip():
            conditions.append(DokumenArsip.sumber_modul == sumber_modul.strip())
        if sub_kategori and sub_kategori.strip():
            conditions.append(DokumenArsip.sub_kategori == sub_kategori.strip())
        if hapus_status and hapus_status.strip():
            conditions.append(DokumenArsip.hapus_status == hapus_status.strip())
        if status_retensi and status_retensi.strip():
            conditions.append(DokumenArsip.status_retensi == status_retensi.strip())
        if arsip_vital is not None:
            conditions.append(DokumenArsip.arsip_vital == arsip_vital)
        if legal_hold is not None:
            conditions.append(DokumenArsip.legal_hold == legal_hold)
        if id_klasifikasi is not None:
            conditions.append(DokumenArsip.id_klasifikasi == id_klasifikasi)

        count_stmt = select(func.count(DokumenArsip.id_dokumen)).where(*conditions)
        count_res = await db.execute(count_stmt)
        total = count_res.scalar_one() or 0

        data_stmt = (
            select(DokumenArsip)
            .options(
                selectinload(DokumenArsip.pegawai).selectinload(Pegawai.bagian),
                selectinload(DokumenArsip.penghapus),
                selectinload(DokumenArsip.klasifikasi),
            )
            .where(*conditions)
            .order_by(desc(DokumenArsip.tanggal_dokumen), desc(DokumenArsip.id_dokumen))
            .offset(skip)
            .limit(limit)
        )
        data_res = await db.execute(data_stmt)
        items = list(data_res.scalars().all())

        return items, total

    async def get_filter_options(
        self, db: AsyncSession, *, status_hapus: bool = False, viewer: Optional[Pegawai] = None
    ) -> Dict[str, Any]:
        has_secret = await self._has_secret_authority(db, viewer)
        base = [DokumenArsip.status_hapus == status_hapus]
        base.extend(self._visibility_conditions(viewer, has_secret_authority=has_secret))

        years_res = await db.execute(
            select(distinct(extract("year", DokumenArsip.tanggal_dokumen)))
            .where(*base)
            .order_by(desc(extract("year", DokumenArsip.tanggal_dokumen)))
        )
        years = [int(r[0]) for r in years_res.fetchall() if r[0] is not None]

        months_res = await db.execute(
            select(distinct(extract("month", DokumenArsip.tanggal_dokumen)))
            .where(*base)
            .order_by(asc(extract("month", DokumenArsip.tanggal_dokumen)))
        )
        months = [int(r[0]) for r in months_res.fetchall() if r[0] is not None]

        events_res = await db.execute(
            select(distinct(DokumenArsip.event))
            .where(*base, DokumenArsip.event.is_not(None), DokumenArsip.event != "")
            .order_by(asc(DokumenArsip.event))
        )
        events = [str(r[0]) for r in events_res.fetchall() if r[0] is not None]

        kategori_res = await db.execute(
            select(distinct(DokumenArsip.kategori))
            .where(*base, DokumenArsip.kategori.is_not(None), DokumenArsip.kategori != "")
            .order_by(asc(DokumenArsip.kategori))
        )
        kategori = [str(r[0]) for r in kategori_res.fetchall() if r[0] is not None]

        hak_akses_res = await db.execute(
            select(distinct(DokumenArsip.hak_akses))
            .where(*base, DokumenArsip.hak_akses.is_not(None), DokumenArsip.hak_akses != "")
            .order_by(asc(DokumenArsip.hak_akses))
        )
        hak_akses = [str(r[0]) for r in hak_akses_res.fetchall() if r[0] is not None]

        retensi_res = await db.execute(
            select(distinct(DokumenArsip.status_retensi))
            .where(*base, DokumenArsip.status_retensi.is_not(None), DokumenArsip.status_retensi != "")
            .order_by(asc(DokumenArsip.status_retensi))
        )
        status_retensi = [str(r[0]) for r in retensi_res.fetchall() if r[0] is not None]

        bagian_res = await db.execute(
            select(distinct(Bagian.nama_bagian)).order_by(asc(Bagian.nama_bagian))
        )
        sub_bagian = [str(r[0]) for r in bagian_res.fetchall() if r[0] is not None]

        sumber_res = await db.execute(
            select(DokumenArsip.sumber_modul, DokumenArsip.sub_kategori)
            .where(*base)
            .distinct()
        )
        sub_kategori: Dict[str, List[str]] = {}
        for modul, sub in sumber_res.fetchall():
            values = sub_kategori.setdefault(modul or "arsip", [])
            if sub and sub not in values:
                values.append(sub)
        for values in sub_kategori.values():
            values.sort()

        return {
            "sumber_modul": sorted(sub_kategori.keys()),
            "sub_kategori": sub_kategori,
            "years": years,
            "months": months,
            "events": events,
            "kategori": kategori,
            "hak_akses": hak_akses,
            "sub_bagian": sub_bagian,
            "status_retensi": status_retensi,
        }

    async def soft_delete(
        self, db: AsyncSession, *, id_dokumen: int, deleted_by: Optional[int] = None
    ) -> Optional[DokumenArsip]:
        doc = await self.get_by_id(db, id_dokumen)
        if not doc:
            return None
        doc.status_hapus = True
        doc.dihapus_oleh = deleted_by
        doc.dihapus_pada = datetime.now()
        db.add(doc)
        await db.commit()
        return await self.get_by_id(db, id_dokumen)

    async def restore(
        self, db: AsyncSession, *, id_dokumen: int
    ) -> Optional[DokumenArsip]:
        doc = await self.get_by_id(db, id_dokumen)
        if not doc:
            return None
        doc.status_hapus = False
        doc.dihapus_oleh = None
        doc.dihapus_pada = None
        doc.hapus_status = None
        doc.hapus_diajukan_oleh = None
        doc.hapus_diajukan_pada = None
        doc.hapus_alasan = None
        doc.hapus_catatan_admin = None
        db.add(doc)
        await db.commit()
        return await self.get_by_id(db, id_dokumen)

    async def permanent_delete(
        self, db: AsyncSession, *, id_dokumen: int
    ) -> Optional[DokumenArsip]:
        doc = await self.get_by_id(db, id_dokumen)
        if not doc:
            return None
        await db.delete(doc)
        await db.commit()
        return doc


arsip = CRUDArsip(DokumenArsip)
