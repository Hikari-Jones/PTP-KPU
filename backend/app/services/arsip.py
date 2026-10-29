from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import distinct, extract, func, or_, select, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.schema import DokumenArsip, Pegawai, Bagian
from app.schemas.arsip import DokumenArsipCreate, DokumenArsipUpdate
from app.services.base import CRUDBase

class CRUDArsip(CRUDBase[DokumenArsip, DokumenArsipCreate, DokumenArsipUpdate]):
    async def get_by_id(self, db: AsyncSession, id_dokumen: int) -> Optional[DokumenArsip]:
        stmt = (
            select(DokumenArsip)
            .options(
                selectinload(DokumenArsip.pegawai).selectinload(Pegawai.bagian),
                selectinload(DokumenArsip.penghapus)
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
        status_hapus: bool = False,
        skip: int = 0,
        limit: int = 100,
    ) -> Tuple[List[DokumenArsip], int]:
        """
        Dynamic parameterized query filtering for DokumenArsip.
        All primary filtering is performed at database level.
        """
        conditions = [DokumenArsip.status_hapus == status_hapus]

        # 1. Search filter on nama_dokumen or nomor_dokumen
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    DokumenArsip.nama_dokumen.ilike(term),
                    DokumenArsip.nomor_dokumen.ilike(term),
                )
            )

        # 2. Year filter on tanggal_dokumen
        if year is not None:
            conditions.append(extract("year", DokumenArsip.tanggal_dokumen) == year)

        # 3. Month filter on tanggal_dokumen
        if month is not None:
            conditions.append(extract("month", DokumenArsip.tanggal_dokumen) == month)

        # 4. Event filter
        if event and event.strip():
            conditions.append(DokumenArsip.event == event.strip())

        # 5. Kategori filter
        if kategori and kategori.strip():
            conditions.append(DokumenArsip.kategori == kategori.strip())

        # 6. Hak Akses filter
        if hak_akses and hak_akses.strip():
            conditions.append(DokumenArsip.hak_akses == hak_akses.strip())

        # 7. Sub Bagian filter
        if sub_bagian and sub_bagian.strip():
            conditions.append(
                DokumenArsip.pegawai.has(
                    Pegawai.bagian.has(Bagian.nama_bagian == sub_bagian.strip())
                )
            )

        # Count total matching rows
        count_stmt = select(func.count(DokumenArsip.id_dokumen)).where(*conditions)
        count_res = await db.execute(count_stmt)
        total = count_res.scalar_one() or 0

        # Query data with relationships loaded
        data_stmt = (
            select(DokumenArsip)
            .options(
                selectinload(DokumenArsip.pegawai).selectinload(Pegawai.bagian),
                selectinload(DokumenArsip.penghapus)
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
        self, db: AsyncSession, *, status_hapus: bool = False
    ) -> Dict[str, Any]:
        """
        Retrieve distinct filter options dynamically from database.
        Zero hardcoded values.
        """
        # 1. Distinct Years
        years_stmt = (
            select(distinct(extract("year", DokumenArsip.tanggal_dokumen)))
            .where(DokumenArsip.status_hapus == status_hapus)
            .order_by(desc(extract("year", DokumenArsip.tanggal_dokumen)))
        )
        years_res = await db.execute(years_stmt)
        years = [int(r[0]) for r in years_res.fetchall() if r[0] is not None]

        # 2. Distinct Months
        months_stmt = (
            select(distinct(extract("month", DokumenArsip.tanggal_dokumen)))
            .where(DokumenArsip.status_hapus == status_hapus)
            .order_by(asc(extract("month", DokumenArsip.tanggal_dokumen)))
        )
        months_res = await db.execute(months_stmt)
        months = [int(r[0]) for r in months_res.fetchall() if r[0] is not None]

        # 3. Distinct Events
        events_stmt = (
            select(distinct(DokumenArsip.event))
            .where(
                DokumenArsip.status_hapus == status_hapus,
                DokumenArsip.event.is_not(None),
                DokumenArsip.event != "",
            )
            .order_by(asc(DokumenArsip.event))
        )
        events_res = await db.execute(events_stmt)
        events = [str(r[0]) for r in events_res.fetchall() if r[0] is not None]

        # 4. Distinct Kategori
        kategori_stmt = (
            select(distinct(DokumenArsip.kategori))
            .where(
                DokumenArsip.status_hapus == status_hapus,
                DokumenArsip.kategori.is_not(None),
                DokumenArsip.kategori != "",
            )
            .order_by(asc(DokumenArsip.kategori))
        )
        kategori_res = await db.execute(kategori_stmt)
        kategori = [str(r[0]) for r in kategori_res.fetchall() if r[0] is not None]

        # 5. Distinct Hak Akses
        hak_akses_stmt = (
            select(distinct(DokumenArsip.hak_akses))
            .where(
                DokumenArsip.status_hapus == status_hapus,
                DokumenArsip.hak_akses.is_not(None),
                DokumenArsip.hak_akses != "",
            )
            .order_by(asc(DokumenArsip.hak_akses))
        )
        hak_akses_res = await db.execute(hak_akses_stmt)
        hak_akses = [str(r[0]) for r in hak_akses_res.fetchall() if r[0] is not None]

        # 6. Distinct Sub Bagian (from bagian master table)
        bagian_stmt = (
            select(distinct(Bagian.nama_bagian))
            .order_by(asc(Bagian.nama_bagian))
        )
        bagian_res = await db.execute(bagian_stmt)
        sub_bagian = [str(r[0]) for r in bagian_res.fetchall() if r[0] is not None]

        return {
            "years": years,
            "months": months,
            "events": events,
            "kategori": kategori,
            "hak_akses": hak_akses,
            "sub_bagian": sub_bagian,
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
        await db.refresh(doc)
        return doc

    async def restore(
        self, db: AsyncSession, *, id_dokumen: int
    ) -> Optional[DokumenArsip]:
        doc = await self.get_by_id(db, id_dokumen)
        if not doc:
            return None
        doc.status_hapus = False
        doc.dihapus_oleh = None
        doc.dihapus_pada = None
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        return doc

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
