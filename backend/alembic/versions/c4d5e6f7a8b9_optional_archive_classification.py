"""Allow archive documents without a classification code.

The archive upload screen does not collect a classification, and a freshly
bootstrapped database has no classification master rows, so the NOT NULL
constraint made every archive upload fail.
"""
from alembic import op
import sqlalchemy as sa

revision = 'c4d5e6f7a8b9'
down_revision = 'b3c4d5e6f7a8'
branch_labels = None
depends_on = None


def upgrade():
    columns = {c['name']: c for c in sa.inspect(op.get_bind()).get_columns('dokumen_arsip')}
    if 'id_klasifikasi' in columns and not columns['id_klasifikasi']['nullable']:
        op.alter_column('dokumen_arsip', 'id_klasifikasi', existing_type=sa.Integer(), nullable=True)


def downgrade():
    # Fails if any archive row has no classification; assign one first.
    op.alter_column('dokumen_arsip', 'id_klasifikasi', existing_type=sa.Integer(), nullable=False)
