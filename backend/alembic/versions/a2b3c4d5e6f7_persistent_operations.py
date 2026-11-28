"""Persistent workflow, bug reports, and account activation."""
from alembic import op
import sqlalchemy as sa
revision = 'a2b3c4d5e6f7'
down_revision = 'f1a2b3c4d5e6'
branch_labels = depends_on = None

def upgrade():
    op.add_column('pegawai', sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()))
    # Fail on duplicate non-null NIPs rather than silently changing identities.
    op.create_unique_constraint('uq_pegawai_nip', 'pegawai', ['nip'])
    op.create_table('workflow_letter',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('kind', sa.String(20), nullable=False),
        sa.Column('subject', sa.String(255), nullable=False),
        sa.Column('sender', sa.String(255), nullable=False),
        sa.Column('recipient', sa.String(255), nullable=False),
        sa.Column('number', sa.String(150)),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('status', sa.String(30), nullable=False),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('pegawai.id_pegawai'), nullable=False),
        sa.Column('assignee_id', sa.Integer(), sa.ForeignKey('pegawai.id_pegawai')),
        sa.Column('file_id', sa.Integer(), sa.ForeignKey('file_record.id_file')),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('history', sa.JSON(), nullable=False))
    op.create_table('bug_report',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('priority', sa.String(20), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('pegawai.id_pegawai'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False))

def downgrade():
    op.drop_table('bug_report')
    op.drop_table('workflow_letter')
    op.drop_constraint('uq_pegawai_nip', 'pegawai', type_='unique')
    op.drop_column('pegawai', 'is_active')
