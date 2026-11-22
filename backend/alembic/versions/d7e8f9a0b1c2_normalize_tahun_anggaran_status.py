"""Normalize tahun_anggaran.status to draft/active/closed.

Older seeders stored Indonesian labels ("Aktif", "Perencanaan"). The API
schema only accepts draft|active|closed, so listing fiscal years returned
HTTP 500 and every service check for status == "active" found nothing.

Also merges the two existing heads into one.
"""
from alembic import op

revision = 'd7e8f9a0b1c2'
down_revision = ('c1a2b3d4e5f6', 'c4d5e6f7a8b9')
branch_labels = None
depends_on = None

NORMALIZE_SQL = (
    "UPDATE tahun_anggaran SET status = 'active' WHERE LOWER(TRIM(status)) IN ('aktif', 'active')",
    "UPDATE tahun_anggaran SET status = 'draft' WHERE LOWER(TRIM(status)) IN ('perencanaan', 'draft')",
    "UPDATE tahun_anggaran SET status = 'closed' WHERE LOWER(TRIM(status)) IN ('tutup', 'ditutup', 'closed')",
)


def upgrade():
    for statement in NORMALIZE_SQL:
        op.execute(statement)


def downgrade():
    # Data-only normalization; the original labels were invalid, nothing to restore.
    pass
