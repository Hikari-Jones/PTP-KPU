import re

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schema import AkunAnggaran, Bagian, Pegawai
from app.schemas.bagian import BagianCreate, BagianUpdate
from app.services.base import CRUDBase


class CRUDBagian(CRUDBase[Bagian, BagianCreate, BagianUpdate]):
    async def _code_taken(self, db: AsyncSession, code: str, exclude_id: int | None = None) -> bool:
        query = select(Bagian.id_bagian).where(Bagian.kode_bagian == code)
        if exclude_id is not None:
            query = query.where(Bagian.id_bagian != exclude_id)
        return (await db.scalar(query.limit(1))) is not None

    async def create(self, db: AsyncSession, *, obj_in: BagianCreate) -> Bagian:
        name = obj_in.nama_bagian.strip()
        if not name:
            raise HTTPException(422, "Nama bagian wajib diisi")
        if obj_in.kode_bagian:
            code = obj_in.kode_bagian.strip().upper()
            if await self._code_taken(db, code):
                raise HTTPException(409, f"Kode bagian {code} sudah digunakan")
        else:
            # Initials of the significant words, e.g. "Umum dan Logistik" -> "UL".
            words = [w for w in re.findall(r"[A-Za-z0-9]+", name) if w.lower() not in {"dan", "&", "the", "of"}]
            stem = ("".join(w[0] for w in words).upper() or "BAG")[:16]
            code, n = stem, 1
            while await self._code_taken(db, code):
                n += 1
                code = f"{stem}{n}"
        db_obj = Bagian(kode_bagian=code, nama_bagian=name)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj

    async def update(self, db: AsyncSession, *, db_obj: Bagian, obj_in: BagianUpdate) -> Bagian:
        data = obj_in.model_dump(exclude_unset=True, exclude_none=True)
        if "kode_bagian" in data:
            data["kode_bagian"] = data["kode_bagian"].strip().upper()
            if await self._code_taken(db, data["kode_bagian"], exclude_id=db_obj.id_bagian):
                raise HTTPException(409, f"Kode bagian {data['kode_bagian']} sudah digunakan")
        return await super().update(db, db_obj=db_obj, obj_in=data)

    async def remove(self, db: AsyncSession, *, id: int) -> Bagian | None:
        obj = await db.get(Bagian, id)
        if not obj:
            return None
        # Without this check SQLAlchemy would silently set the employees' id_bagian to NULL.
        employees = await db.scalar(select(func.count()).select_from(Pegawai).where(Pegawai.id_bagian == id))
        accounts = await db.scalar(select(func.count()).select_from(AkunAnggaran).where(AkunAnggaran.id_bagian == id))
        if employees or accounts:
            raise HTTPException(409, f"Bagian masih digunakan oleh {employees} pegawai dan {accounts} akun anggaran; "
                                     "pindahkan data tersebut terlebih dahulu")
        await db.delete(obj)
        await db.commit()
        return obj


bagian = CRUDBagian(Bagian)
