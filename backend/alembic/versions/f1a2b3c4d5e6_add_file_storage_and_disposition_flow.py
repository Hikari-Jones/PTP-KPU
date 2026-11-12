"""Add physical file storage metadata and hierarchical dispositions."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e8c9d0f1a2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "file_record",
        sa.Column("id_file", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("original_name", sa.String(255), nullable=False),
        sa.Column("stored_name", sa.String(255), nullable=False),
        sa.Column("relative_path", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(150), nullable=True),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("category", sa.String(50), nullable=False, server_default="general"),
        sa.Column("uploaded_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["uploaded_by"], ["pegawai.id_pegawai"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id_file"),
        sa.UniqueConstraint("stored_name"),
    )
    op.add_column("disposisi", sa.Column("id_pengirim", sa.Integer(), nullable=True))
    op.add_column("disposisi", sa.Column("id_parent", sa.Integer(), nullable=True))
    op.add_column("disposisi", sa.Column("status", sa.String(30), nullable=False, server_default="terkirim"))
    op.add_column("disposisi", sa.Column("diterima_pada", sa.DateTime(), nullable=True))
    op.create_foreign_key(
        "fk_disposisi_pengirim", "disposisi", "pegawai",
        ["id_pengirim"], ["id_pegawai"], ondelete="RESTRICT", onupdate="CASCADE",
    )
    op.create_foreign_key(
        "fk_disposisi_parent", "disposisi", "disposisi",
        ["id_parent"], ["id_disposisi"], ondelete="CASCADE", onupdate="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_disposisi_parent", "disposisi", type_="foreignkey")
    op.drop_constraint("fk_disposisi_pengirim", "disposisi", type_="foreignkey")
    op.drop_column("disposisi", "diterima_pada")
    op.drop_column("disposisi", "status")
    op.drop_column("disposisi", "id_parent")
    op.drop_column("disposisi", "id_pengirim")
    op.drop_table("file_record")
