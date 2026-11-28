"""Permanent archive deletion: users request it, an administrator approves or rejects.

Adds the request state to dokumen_arsip instead of letting any user hard-delete.
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f7'
down_revision = 'f0a1b2c3d4e5'
branch_labels = None
depends_on = None


def upgrade():
    columns = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('dokumen_arsip')}
    if 'hapus_status' in columns:
        return
    op.add_column('dokumen_arsip', sa.Column('hapus_status', sa.String(20), nullable=True))
    op.add_column('dokumen_arsip', sa.Column('hapus_diajukan_oleh', sa.Integer(), nullable=True))
    op.add_column('dokumen_arsip', sa.Column('hapus_diajukan_pada', sa.DateTime(), nullable=True))
    op.add_column('dokumen_arsip', sa.Column('hapus_alasan', sa.String(255), nullable=True))
    op.add_column('dokumen_arsip', sa.Column('hapus_catatan_admin', sa.String(255), nullable=True))
    op.create_index('ix_dokumen_arsip_hapus_status', 'dokumen_arsip', ['hapus_status'])
    op.create_foreign_key('fk_dokumen_arsip_pengaju_hapus', 'dokumen_arsip', 'pegawai',
                          ['hapus_diajukan_oleh'], ['id_pegawai'], onupdate='CASCADE', ondelete='SET NULL')


def downgrade():
    op.drop_constraint('fk_dokumen_arsip_pengaju_hapus', 'dokumen_arsip', type_='foreignkey')
    op.drop_index('ix_dokumen_arsip_hapus_status', 'dokumen_arsip')
    for column in ('hapus_catatan_admin', 'hapus_alasan', 'hapus_diajukan_pada', 'hapus_diajukan_oleh', 'hapus_status'):
        op.drop_column('dokumen_arsip', column)
