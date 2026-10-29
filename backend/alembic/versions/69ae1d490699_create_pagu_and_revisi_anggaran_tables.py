"""create_pagu_and_revisi_anggaran_tables

Revision ID: 69ae1d490699
Revises: 5dec35177453
Create Date: 2026-09-23 09:32:10.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '69ae1d490699'
down_revision: Union[str, Sequence[str], None] = '5dec35177453'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    # 1. Create pagu_anggaran
    if 'pagu_anggaran' not in tables:
        op.create_table(
            'pagu_anggaran',
            sa.Column('id_pagu', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('id_tahun_anggaran', sa.Integer(), nullable=False),
            sa.Column('id_akun_anggaran', sa.Integer(), nullable=False),
            sa.Column('pagu_awal', sa.Numeric(precision=18, scale=2), server_default='0', nullable=False),
            sa.Column('pagu_aktif', sa.Numeric(precision=18, scale=2), server_default='0', nullable=False),
            sa.Column('nomor_sk', sa.String(length=100), nullable=True),
            sa.Column('tanggal_sk', sa.Date(), nullable=True),
            sa.Column('keterangan', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['id_tahun_anggaran'], ['tahun_anggaran.id_tahun_anggaran'], onupdate='CASCADE', ondelete='RESTRICT', name='fk_pagu_tahun'),
            sa.ForeignKeyConstraint(['id_akun_anggaran'], ['akun_anggaran.id_akun_anggaran'], onupdate='CASCADE', ondelete='RESTRICT', name='fk_pagu_akun'),
            sa.PrimaryKeyConstraint('id_pagu'),
            sa.UniqueConstraint('id_tahun_anggaran', 'id_akun_anggaran', name='uq_pagu_tahun_akun')
        )

    # 2. Create revisi_anggaran
    if 'revisi_anggaran' not in tables:
        op.create_table(
            'revisi_anggaran',
            sa.Column('id_revisi', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('id_pagu', sa.Integer(), nullable=False),
            sa.Column('id_pegawai', sa.Integer(), nullable=False),
            sa.Column('nomor_revisi', sa.String(length=100), nullable=False),
            sa.Column('tanggal_revisi', sa.Date(), nullable=False),
            sa.Column('pagu_sebelum', sa.Numeric(precision=18, scale=2), nullable=False),
            sa.Column('pagu_sesudah', sa.Numeric(precision=18, scale=2), nullable=False),
            sa.Column('alasan_revisi', sa.Text(), nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['id_pagu'], ['pagu_anggaran.id_pagu'], onupdate='CASCADE', ondelete='RESTRICT', name='fk_revisi_pagu'),
            sa.ForeignKeyConstraint(['id_pegawai'], ['pegawai.id_pegawai'], onupdate='CASCADE', ondelete='RESTRICT', name='fk_revisi_pegawai'),
            sa.PrimaryKeyConstraint('id_revisi')
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    # Safety checks before dropping audit/budget tables
    if 'realisasi_anggaran' in tables:
        columns = [c['name'] for c in inspector.get_columns('realisasi_anggaran')]
        if 'id_pagu' in columns:
            cur = conn.execute(sa.text("SELECT COUNT(*) FROM realisasi_anggaran WHERE id_pagu IS NOT NULL"))
            count = cur.scalar() or 0
            if count > 0:
                raise RuntimeError("Downgrade aborted: tabel realisasi_anggaran masih memiliki data yang terhubung ke pagu_anggaran!")

    if 'revisi_anggaran' in tables:
        cur = conn.execute(sa.text("SELECT COUNT(*) FROM revisi_anggaran"))
        count = cur.scalar() or 0
        if count > 0:
            raise RuntimeError("Downgrade aborted: tabel revisi_anggaran masih memiliki riwayat revisi!")
        op.drop_table('revisi_anggaran')

    if 'pagu_anggaran' in tables:
        op.drop_table('pagu_anggaran')
