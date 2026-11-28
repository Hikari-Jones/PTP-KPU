"""Store Satker in the database instead of a hardcoded list.

The /satker endpoint used to return 16 built-in entries with invented budget
figures, and new entries lived only in memory. The table starts empty;
administrators add their own satker.
"""
from alembic import op
import sqlalchemy as sa

revision = 'f0a1b2c3d4e5'
down_revision = 'e9f0a1b2c3d4'
branch_labels = None
depends_on = None


def upgrade():
    if sa.inspect(op.get_bind()).has_table('satker'):
        return
    op.create_table(
        'satker',
        sa.Column('id_satker', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('kode_satker', sa.String(20), nullable=False, unique=True),
        sa.Column('nama_satker', sa.String(200), nullable=False),
        sa.Column('tingkat', sa.String(30), nullable=False),
        sa.Column('alamat', sa.String(255), nullable=False),
        sa.Column('pagu', sa.DECIMAL(18, 2), nullable=False, server_default='0'),
        sa.Column('realisasi', sa.DECIMAL(18, 2), nullable=False, server_default='0'),
        sa.Column('status_dipa', sa.String(30), nullable=False, server_default='Aktif'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
    )


def downgrade():
    op.drop_table('satker')
