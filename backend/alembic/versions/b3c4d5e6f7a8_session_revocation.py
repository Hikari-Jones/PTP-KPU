"""Account session revocation."""
from alembic import op
import sqlalchemy as sa
revision = 'b3c4d5e6f7a8'
down_revision = 'a2b3c4d5e6f7'
branch_labels = depends_on = None

def upgrade():
    op.add_column('pegawai', sa.Column('session_version', sa.Integer(), nullable=False, server_default='0'))

def downgrade():
    op.drop_column('pegawai', 'session_version')
