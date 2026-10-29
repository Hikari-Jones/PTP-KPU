"""enhance_realisasi_anggaran_table

Revision ID: 90eeefdfaa30
Revises: 69ae1d490699
Create Date: 2026-09-23 09:32:15.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '90eeefdfaa30'
down_revision: Union[str, Sequence[str], None] = '69ae1d490699'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('realisasi_anggaran')]

    # Add new nullable columns to preserve legacy records without fake data
    if 'id_pagu' not in columns:
        op.add_column('realisasi_anggaran', sa.Column('id_pagu', sa.Integer(), nullable=True))
        op.create_foreign_key(
            'fk_realisasi_pagu',
            'realisasi_anggaran',
            'pagu_anggaran',
            ['id_pagu'],
            ['id_pagu'],
            onupdate='CASCADE',
            ondelete='RESTRICT'
        )

    if 'id_pegawai' not in columns:
        op.add_column('realisasi_anggaran', sa.Column('id_pegawai', sa.Integer(), nullable=True))
        op.create_foreign_key(
            'fk_realisasi_pegawai',
            'realisasi_anggaran',
            'pegawai',
            ['id_pegawai'],
            ['id_pegawai'],
            onupdate='CASCADE',
            ondelete='RESTRICT'
        )

    if 'id_verifier' not in columns:
        op.add_column('realisasi_anggaran', sa.Column('id_verifier', sa.Integer(), nullable=True))
        op.create_foreign_key(
            'fk_realisasi_verifier',
            'realisasi_anggaran',
            'pegawai',
            ['id_verifier'],
            ['id_pegawai'],
            onupdate='CASCADE',
            ondelete='SET NULL'
        )

    if 'periode' not in columns:
        op.add_column('realisasi_anggaran', sa.Column('periode', sa.String(length=50), nullable=True))

    if 'bukti_file_path' not in columns:
        op.add_column('realisasi_anggaran', sa.Column('bukti_file_path', sa.String(length=255), nullable=True))

    if 'bukti_file_nama' not in columns:
        op.add_column('realisasi_anggaran', sa.Column('bukti_file_nama', sa.String(length=255), nullable=True))

    if 'bukti_file_ukuran' not in columns:
        op.add_column('realisasi_anggaran', sa.Column('bukti_file_ukuran', sa.BigInteger(), nullable=True))

    if 'bukti_file_mime' not in columns:
        op.add_column('realisasi_anggaran', sa.Column('bukti_file_mime', sa.String(length=100), nullable=True))

    if 'catatan_verifikasi' not in columns:
        op.add_column('realisasi_anggaran', sa.Column('catatan_verifikasi', sa.Text(), nullable=True))

    if 'verified_at' not in columns:
        op.add_column('realisasi_anggaran', sa.Column('verified_at', sa.DateTime(), nullable=True))

    if 'created_at' not in columns:
        op.add_column('realisasi_anggaran', sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False))

    if 'updated_at' not in columns:
        op.add_column('realisasi_anggaran', sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=False))

    # Standardize status to lowercase if any rows exist
    conn.execute(sa.text("UPDATE realisasi_anggaran SET status = LOWER(TRIM(status)) WHERE status IS NOT NULL"))

    # Add indices for fast filtering and reporting
    existing_indexes = [idx['name'] for idx in inspector.get_indexes('realisasi_anggaran')]
    if 'ix_realisasi_status' not in existing_indexes:
        op.create_index('ix_realisasi_status', 'realisasi_anggaran', ['status'])
    if 'ix_realisasi_tanggal' not in existing_indexes:
        op.create_index('ix_realisasi_tanggal', 'realisasi_anggaran', ['tanggal_transaksi'])
    if 'ix_realisasi_pagu' not in existing_indexes:
        op.create_index('ix_realisasi_pagu', 'realisasi_anggaran', ['id_pagu'])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('realisasi_anggaran')]
    indexes = [idx['name'] for idx in inspector.get_indexes('realisasi_anggaran')]

    if 'ix_realisasi_pagu' in indexes:
        op.drop_index('ix_realisasi_pagu', table_name='realisasi_anggaran')
    if 'ix_realisasi_tanggal' in indexes:
        op.drop_index('ix_realisasi_tanggal', table_name='realisasi_anggaran')
    if 'ix_realisasi_status' in indexes:
        op.drop_index('ix_realisasi_status', table_name='realisasi_anggaran')

    if 'id_verifier' in columns:
        op.drop_constraint('fk_realisasi_verifier', 'realisasi_anggaran', type_='foreignkey')
        op.drop_column('realisasi_anggaran', 'id_verifier')

    if 'id_pegawai' in columns:
        op.drop_constraint('fk_realisasi_pegawai', 'realisasi_anggaran', type_='foreignkey')
        op.drop_column('realisasi_anggaran', 'id_pegawai')

    if 'id_pagu' in columns:
        op.drop_constraint('fk_realisasi_pagu', 'realisasi_anggaran', type_='foreignkey')
        op.drop_column('realisasi_anggaran', 'id_pagu')

    for col in ['updated_at', 'created_at', 'verified_at', 'catatan_verifikasi', 'bukti_file_mime', 'bukti_file_ukuran', 'bukti_file_nama', 'bukti_file_path', 'periode']:
        if col in columns:
            op.drop_column('realisasi_anggaran', col)
