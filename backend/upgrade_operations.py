"""Add operations tables to an existing current-model MySQL database without reseeding."""
import asyncio
from sqlalchemy import inspect, text
from app.core.database import engine, Base
import app.models

async def upgrade():
    async with engine.begin() as connection:
        def inspect_schema(conn):
            inspector = inspect(conn)
            return inspector.get_table_names(), inspector.get_columns('pegawai') if inspector.has_table('pegawai') else [], inspector.get_unique_constraints('pegawai') if inspector.has_table('pegawai') else []
        tables, columns, constraints = await connection.run_sync(inspect_schema)
        if 'pegawai' not in tables:
            raise RuntimeError('Initialize a fresh database with setup_local_database.py first')
        if 'id_pegawai' not in {c['name'] for c in columns}:
            raise RuntimeError('Legacy UUID schema detected; migrate to current schema before this upgrade')
        duplicates = (await connection.execute(text('SELECT nip FROM pegawai WHERE nip IS NOT NULL GROUP BY nip HAVING COUNT(*) > 1'))).fetchall()
        if duplicates: raise RuntimeError('Duplicate NIPs exist; resolve duplicate identities before upgrade')
        if 'session_version' not in {c['name'] for c in columns}:
            await connection.execute(text('ALTER TABLE pegawai ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0'))
        if 'is_active' not in {c['name'] for c in columns}:
            await connection.execute(text('ALTER TABLE pegawai ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE'))
        if not any(c['column_names'] == ['nip'] for c in constraints):
            await connection.execute(text('ALTER TABLE pegawai ADD CONSTRAINT uq_pegawai_nip UNIQUE (nip)'))
        await connection.run_sync(Base.metadata.create_all)
        # Archive uploads from the UI carry no classification; allow NULL.
        archive_columns = await connection.run_sync(
            lambda c: {col['name']: col for col in inspect(c).get_columns('dokumen_arsip')})
        if not archive_columns.get('id_klasifikasi', {}).get('nullable', True):
            await connection.execute(text('ALTER TABLE dokumen_arsip MODIFY id_klasifikasi INT NULL'))
        # Archive rows now record which module (letters/budget) they came from.
        if 'sumber_modul' not in archive_columns:
            await connection.execute(text("ALTER TABLE dokumen_arsip ADD COLUMN sumber_modul VARCHAR(30) NOT NULL DEFAULT 'arsip'"))
            await connection.execute(text('CREATE INDEX ix_dokumen_arsip_sumber_modul ON dokumen_arsip (sumber_modul)'))
        if 'sub_kategori' not in archive_columns:
            await connection.execute(text('ALTER TABLE dokumen_arsip ADD COLUMN sub_kategori VARCHAR(150) NULL'))
            await connection.execute(text('CREATE INDEX ix_dokumen_arsip_sub_kategori ON dokumen_arsip (sub_kategori)'))
        if 'ref_tipe' not in archive_columns:
            await connection.execute(text('ALTER TABLE dokumen_arsip ADD COLUMN ref_tipe VARCHAR(30) NULL, ADD COLUMN ref_id INT NULL'))
            await connection.execute(text('ALTER TABLE dokumen_arsip ADD CONSTRAINT uq_dokumen_arsip_ref UNIQUE (ref_tipe, ref_id)'))
        # Permanent deletion is requested by users and approved by an administrator.
        if 'hapus_status' not in archive_columns:
            await connection.execute(text(
                'ALTER TABLE dokumen_arsip ADD COLUMN hapus_status VARCHAR(20) NULL, '
                'ADD COLUMN hapus_diajukan_oleh INT NULL, ADD COLUMN hapus_diajukan_pada DATETIME NULL, '
                'ADD COLUMN hapus_alasan VARCHAR(255) NULL, ADD COLUMN hapus_catatan_admin VARCHAR(255) NULL'))
            await connection.execute(text('CREATE INDEX ix_dokumen_arsip_hapus_status ON dokumen_arsip (hapus_status)'))
            await connection.execute(text(
                'ALTER TABLE dokumen_arsip ADD CONSTRAINT fk_dokumen_arsip_pengaju_hapus FOREIGN KEY (hapus_diajukan_oleh) '
                'REFERENCES pegawai (id_pegawai) ON UPDATE CASCADE ON DELETE SET NULL'))
        # Older seeders stored Indonesian fiscal-year labels the API rejects.
        if 'tahun_anggaran' in tables:
            for value, aliases in (('active', "'aktif','active'"), ('draft', "'perencanaan','draft'"),
                                   ('closed', "'tutup','ditutup','closed'")):
                await connection.execute(text(
                    f"UPDATE tahun_anggaran SET status = '{value}' WHERE LOWER(TRIM(status)) IN ({aliases})"))
    # Reference data the letter/archive screens need (inserts only missing codes).
    from app.core.database import AsyncSessionLocal
    from app.core.reference_data import ensure_reference_data
    async with AsyncSessionLocal() as session:
        await ensure_reference_data(session)
        await session.commit()
    await engine.dispose()
    print('Operations schema upgrade completed without reseeding demo data')

if __name__ == '__main__': asyncio.run(upgrade())
