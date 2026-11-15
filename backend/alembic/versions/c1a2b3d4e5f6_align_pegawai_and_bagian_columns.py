"""align_pegawai_and_bagian_columns

Revision ID: c1a2b3d4e5f6
Revises: 90eeefdfaa30
Create Date: 2026-10-12 11:27:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1a2b3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '90eeefdfaa30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # 1. Align tabel pegawai
    pegawai_cols = [c['name'] for c in inspector.get_columns('pegawai')]
    if 'nip' not in pegawai_cols:
        op.add_column('pegawai', sa.Column('nip', sa.String(length=30), nullable=True))
    if 'jabatan' not in pegawai_cols:
        op.add_column('pegawai', sa.Column('jabatan', sa.String(length=100), nullable=True))

    # 2. Align tabel bagian
    bagian_cols = [c['name'] for c in inspector.get_columns('bagian')]
    if 'kode_bagian' not in bagian_cols:
        op.add_column('bagian', sa.Column('kode_bagian', sa.String(length=20), nullable=True))
        
        # Populate safe unique codes for existing rows based on id_bagian if any exist
        conn.execute(sa.text("UPDATE bagian SET kode_bagian = CONCAT('BAG-', id_bagian) WHERE kode_bagian IS NULL"))
        
        # Alter to NOT NULL and add unique constraint as defined in ORM and schema
        op.alter_column('bagian', 'kode_bagian', existing_type=sa.String(length=20), nullable=False)
        op.create_unique_constraint('uq_bagian_kode_bagian', 'bagian', ['kode_bagian'])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    bagian_cols = [c['name'] for c in inspector.get_columns('bagian')]
    if 'kode_bagian' in bagian_cols:
        op.drop_constraint('uq_bagian_kode_bagian', 'bagian', type_='unique')
        op.drop_column('bagian', 'kode_bagian')

    pegawai_cols = [c['name'] for c in inspector.get_columns('pegawai')]
    if 'jabatan' in pegawai_cols:
        op.drop_column('pegawai', 'jabatan')
    if 'nip' in pegawai_cols:
        op.drop_column('pegawai', 'nip')
