"""create_tahun_anggaran_table

Revision ID: 5e435d6b163d
Revises: e8c9d0f1a2b3
Create Date: 2026-09-23 09:32:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5e435d6b163d'
down_revision: Union[str, Sequence[str], None] = 'e8c9d0f1a2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if 'tahun_anggaran' not in tables:
        op.create_table(
            'tahun_anggaran',
            sa.Column('id_tahun_anggaran', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('tahun', sa.Integer(), nullable=False),
            sa.Column('status', sa.String(length=20), server_default='draft', nullable=False),
            sa.Column('tanggal_mulai', sa.Date(), nullable=False),
            sa.Column('tanggal_selesai', sa.Date(), nullable=False),
            sa.Column('deskripsi', sa.String(length=255), nullable=True),
            sa.Column('id_pegawai_pembuat', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['id_pegawai_pembuat'], ['pegawai.id_pegawai'], onupdate='CASCADE', ondelete='SET NULL', name='fk_tahun_pegawai'),
            sa.PrimaryKeyConstraint('id_tahun_anggaran'),
            sa.UniqueConstraint('tahun', name='uq_tahun_anggaran_tahun')
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if 'tahun_anggaran' in tables:
        # Safety check: if pagu_anggaran exists and references tahun_anggaran, do not silently delete
        if 'pagu_anggaran' in tables:
            cur = conn.execute(sa.text("SELECT COUNT(*) FROM pagu_anggaran"))
            count = cur.scalar() or 0
            if count > 0:
                raise RuntimeError("Downgrade aborted: tabel pagu_anggaran masih memiliki data yang terhubung ke tahun_anggaran!")
        op.drop_table('tahun_anggaran')
