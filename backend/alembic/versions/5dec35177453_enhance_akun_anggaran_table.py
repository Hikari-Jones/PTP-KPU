"""enhance_akun_anggaran_table

Revision ID: 5dec35177453
Revises: 5e435d6b163d
Create Date: 2026-09-23 09:32:05.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5dec35177453'
down_revision: Union[str, Sequence[str], None] = '5e435d6b163d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('akun_anggaran')]

    # Add metadata columns to akun_anggaran while strictly preserving total_pagu
    if 'jenis_belanja' not in columns:
        op.add_column('akun_anggaran', sa.Column('jenis_belanja', sa.String(length=100), nullable=True))
    if 'program' not in columns:
        op.add_column('akun_anggaran', sa.Column('program', sa.String(length=255), nullable=True))
    if 'sub_program' not in columns:
        op.add_column('akun_anggaran', sa.Column('sub_program', sa.String(length=255), nullable=True))
    if 'status' not in columns:
        op.add_column('akun_anggaran', sa.Column('status', sa.String(length=20), server_default='active', nullable=False))
    if 'created_at' not in columns:
        op.add_column('akun_anggaran', sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False))
    if 'updated_at' not in columns:
        op.add_column('akun_anggaran', sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=False))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('akun_anggaran')]

    # Drop added metadata columns, total_pagu remains completely untouched
    if 'updated_at' in columns:
        op.drop_column('akun_anggaran', 'updated_at')
    if 'created_at' in columns:
        op.drop_column('akun_anggaran', 'created_at')
    if 'status' in columns:
        op.drop_column('akun_anggaran', 'status')
    if 'sub_program' in columns:
        op.drop_column('akun_anggaran', 'sub_program')
    if 'program' in columns:
        op.drop_column('akun_anggaran', 'program')
    if 'jenis_belanja' in columns:
        op.drop_column('akun_anggaran', 'jenis_belanja')
