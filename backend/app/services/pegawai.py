import hashlib
from typing import Any, Dict, Optional, Union
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schema import Pegawai
from app.schemas.pegawai import PegawaiCreate, PegawaiUpdate
from app.services.base import CRUDBase

def get_password_hash(password: str) -> str:
    # Catatan: Ini adalah hashing sederhana untuk contoh.
    # Di production sebaiknya gunakan library seperti passlib (bcrypt).
    return hashlib.sha256(password.encode()).hexdigest()

class CRUDPegawai(CRUDBase[Pegawai, PegawaiCreate, PegawaiUpdate]):
    async def create(self, db: AsyncSession, *, obj_in: PegawaiCreate) -> Pegawai:
        obj_in_data = obj_in.model_dump()
        # Hash password sebelum disimpan ke database
        obj_in_data["password"] = get_password_hash(obj_in_data["password"])
        
        db_obj = self.model(**obj_in_data)
        db.add(db_obj)
        await db.commit()
        await db.refresh(db_obj)
        return db_obj
        
    async def update(
        self,
        db: AsyncSession,
        *,
        db_obj: Pegawai,
        obj_in: Union[PegawaiUpdate, Dict[str, Any]]
    ) -> Pegawai:
        if isinstance(obj_in, dict):
            update_data = obj_in
        else:
            update_data = obj_in.model_dump(exclude_unset=True)
            
        # Jika password diupdate, lakukan hashing baru
        if "password" in update_data:
            update_data["password"] = get_password_hash(update_data["password"])
            
        return await super().update(db, db_obj=db_obj, obj_in=update_data)

pegawai = CRUDPegawai(Pegawai)
