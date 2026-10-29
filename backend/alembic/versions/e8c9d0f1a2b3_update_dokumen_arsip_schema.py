"""Update dokumen_arsip schema for dynamic archive filtering and robust metadata

Revision ID: e8c9d0f1a2b3
Revises: 57fc4fb30298
Create Date: 2026-09-02 16:10:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8c9d0f1a2b3'
down_revision: Union[str, Sequence[str], None] = '57fc4fb30298'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check if table already exists
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if 'dokumen_arsip' not in tables:
        op.create_table(
            'dokumen_arsip',
            sa.Column('id_dokumen', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('nama_dokumen', sa.String(length=255), nullable=False),
            sa.Column('nomor_dokumen', sa.String(length=100), nullable=False),
            sa.Column('id_pegawai', sa.Integer(), nullable=False),
            sa.Column('kategori', sa.String(length=100), nullable=False),
            sa.Column('event', sa.String(length=150), nullable=True),
            sa.Column('tanggal_dokumen', sa.Date(), nullable=False),
            sa.Column('file_path', sa.String(length=255), nullable=True),
            sa.Column('ukuran_file', sa.BigInteger(), nullable=True, server_default='0'),
            sa.Column('hak_akses', sa.String(length=50), nullable=False, server_default='internal'),
            sa.Column('status_hapus', sa.Boolean(), nullable=False, server_default=sa.text('0')),
            sa.Column('dihapus_oleh', sa.Integer(), nullable=True),
            sa.Column('dihapus_pada', sa.DateTime(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=False),
            sa.ForeignKeyConstraint(['id_pegawai'], ['pegawai.id_pegawai'], onupdate='CASCADE', ondelete='RESTRICT', name='fk_dokumen_pegawai'),
            sa.ForeignKeyConstraint(['dihapus_oleh'], ['pegawai.id_pegawai'], onupdate='CASCADE', ondelete='SET NULL', name='fk_dokumen_pegawai_hapus'),
            sa.PrimaryKeyConstraint('id_dokumen')
        )
        op.create_index('ix_dokumen_arsip_nomor', 'dokumen_arsip', ['nomor_dokumen'])
        op.create_index('ix_dokumen_arsip_kategori', 'dokumen_arsip', ['kategori'])
        op.create_index('ix_dokumen_arsip_event', 'dokumen_arsip', ['event'])
        op.create_index('ix_dokumen_arsip_tanggal', 'dokumen_arsip', ['tanggal_dokumen'])
        op.create_index('ix_dokumen_arsip_hak_akses', 'dokumen_arsip', ['hak_akses'])
        op.create_index('ix_dokumen_arsip_status_hapus', 'dokumen_arsip', ['status_hapus'])
    else:
        columns = [c['name'] for c in inspector.get_columns('dokumen_arsip')]
        
        # Modify columns if existing
        if 'nama_dokumen' in columns:
            op.alter_column('dokumen_arsip', 'nama_dokumen', existing_type=sa.String(length=15), type_=sa.String(length=255), nullable=False)
        
        if 'event' not in columns:
            op.add_column('dokumen_arsip', sa.Column('event', sa.String(length=150), nullable=True))
        if 'tanggal_dokumen' not in columns:
            op.add_column('dokumen_arsip', sa.Column('tanggal_dokumen', sa.Date(), nullable=False, server_default=sa.text('(CURRENT_DATE)')))
        if 'file_path' not in columns:
            op.add_column('dokumen_arsip', sa.Column('file_path', sa.String(length=255), nullable=True))
        if 'ukuran_file' not in columns:
            op.add_column('dokumen_arsip', sa.Column('ukuran_file', sa.BigInteger(), nullable=True, server_default='0'))
        if 'dihapus_oleh' not in columns:
            op.add_column('dokumen_arsip', sa.Column('dihapus_oleh', sa.Integer(), nullable=True))
            op.create_foreign_key('fk_dokumen_pegawai_hapus', 'dokumen_arsip', 'pegawai', ['dihapus_oleh'], ['id_pegawai'], onupdate='CASCADE', ondelete='SET NULL')
        if 'dihapus_pada' not in columns:
            op.add_column('dokumen_arsip', sa.Column('dihapus_pada', sa.DateTime(), nullable=True))
        if 'created_at' not in columns:
            op.add_column('dokumen_arsip', sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False))
        if 'updated_at' not in columns:
            op.add_column('dokumen_arsip', sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'), nullable=False))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    if 'dokumen_arsip' in tables:
        op.drop_table('dokumen_arsip')
