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
    await engine.dispose()
    print('Operations schema upgrade completed without reseeding data')

if __name__ == '__main__': asyncio.run(upgrade())
