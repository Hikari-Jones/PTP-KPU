"""Initialize a provisioned EMPTY database with one administrator, no demo data."""
import asyncio
import getpass
import os
from sqlalchemy import inspect
from app.core.database import engine, Base, AsyncSessionLocal
from app.core.passwords import hash_password
from app.models.schema import Pegawai, Bagian
from app.schemas.pegawai import PegawaiCreate
import app.models

async def main():
    nip = os.environ.get('BOOTSTRAP_ADMIN_NIP') or input('Administrator NIP: ').strip()
    name = os.environ.get('BOOTSTRAP_ADMIN_NAME') or input('Administrator name: ').strip()
    password = os.environ.get('BOOTSTRAP_ADMIN_PASSWORD') or getpass.getpass('Administrator password (12+ characters): ')
    if len(password) < 12:
        raise ValueError('Bootstrap password must have at least 12 characters')
    account = PegawaiCreate(nip=nip, nama=name, password=password, role='Admin')
    if not account.nama.strip(): raise ValueError('Administrator name is required')
    try:
        async with engine.begin() as conn:
            if await conn.run_sync(lambda c: inspect(c).get_table_names()):
                raise RuntimeError('Bootstrap requires an EMPTY database. Use upgrade_operations.py for an existing installation.')
            await conn.run_sync(Base.metadata.create_all)
        async with AsyncSessionLocal() as db:
            section = Bagian(kode_bagian='ADMIN', nama_bagian='Administrasi Sistem')
            db.add(section)
            await db.flush()
            db.add(Pegawai(nip=account.nip, nama=account.nama, password=hash_password(password),
                           role='Admin', is_active=True, id_bagian=section.id_bagian))
            from app.core.reference_data import ensure_reference_data, ensure_subbagian_master
            await ensure_reference_data(db)
            await ensure_subbagian_master(db)
            await db.commit()
        print('Created one administrator and the official reference data (archive classifications, '
              'letter types). No sample users, letters or financial transactions were inserted.')
    finally:
        await engine.dispose()

if __name__ == '__main__': asyncio.run(main())
