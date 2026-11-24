"""add permintaan_akun table for user signup verification

Revision ID: g2b3c4d5e6f7
Revises: f1a2b3d4e5e6
Create Date: 2026-11-25 04:15:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "g2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "f1a2b3d4e5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "permintaan_akun" not in inspector.get_table_names():
        op.create_table(
            "permintaan_akun",
            sa.Column("id_request", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("nama", sa.String(length=150), nullable=False),
            sa.Column("nip", sa.String(length=30), nullable=False),
            sa.Column("password", sa.String(length=255), nullable=False),
            sa.Column("jabatan", sa.String(length=100), nullable=False),
            sa.Column("unit_bagian", sa.String(length=150), nullable=False),
            sa.Column("id_bagian", sa.Integer(), nullable=True),
            sa.Column("nama_subbagian", sa.String(length=150), nullable=True),
            sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
            sa.Column("catatan_admin", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.current_timestamp(), nullable=False),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("reviewed_by", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(["id_bagian"], ["bagian.id_bagian"], onupdate="CASCADE", ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id_request"),
        )
        op.create_index(op.f("ix_permintaan_akun_nip"), "permintaan_akun", ["nip"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_permintaan_akun_nip"), table_name="permintaan_akun")
    op.drop_table("permintaan_akun")
