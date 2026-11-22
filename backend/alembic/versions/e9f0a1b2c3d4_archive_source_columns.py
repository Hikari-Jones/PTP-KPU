"""Track which module an archive document came from.

Letters and budget evidence were stored only in their own modules, so the
archive stayed empty. These columns let the archive hold one row per source
record (idempotent sync) and filter by module and sub-category.
"""
from alembic import op
import sqlalchemy as sa

revision = 'e9f0a1b2c3d4'
down_revision = 'd7e8f9a0b1c2'
branch_labels = None
depends_on = None


def upgrade():
    columns = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('dokumen_arsip')}
    if 'sumber_modul' not in columns:
        op.add_column('dokumen_arsip', sa.Column('sumber_modul', sa.String(30), nullable=False, server_default='arsip'))
        op.create_index('ix_dokumen_arsip_sumber_modul', 'dokumen_arsip', ['sumber_modul'])
    if 'sub_kategori' not in columns:
        op.add_column('dokumen_arsip', sa.Column('sub_kategori', sa.String(150), nullable=True))
        op.create_index('ix_dokumen_arsip_sub_kategori', 'dokumen_arsip', ['sub_kategori'])
    if 'ref_tipe' not in columns:
        op.add_column('dokumen_arsip', sa.Column('ref_tipe', sa.String(30), nullable=True))
        op.add_column('dokumen_arsip', sa.Column('ref_id', sa.Integer(), nullable=True))
        op.create_unique_constraint('uq_dokumen_arsip_ref', 'dokumen_arsip', ['ref_tipe', 'ref_id'])


def downgrade():
    op.drop_constraint('uq_dokumen_arsip_ref', 'dokumen_arsip', type_='unique')
    op.drop_column('dokumen_arsip', 'ref_id')
    op.drop_column('dokumen_arsip', 'ref_tipe')
    op.drop_index('ix_dokumen_arsip_sub_kategori', 'dokumen_arsip')
    op.drop_column('dokumen_arsip', 'sub_kategori')
    op.drop_index('ix_dokumen_arsip_sumber_modul', 'dokumen_arsip')
    op.drop_column('dokumen_arsip', 'sumber_modul')
