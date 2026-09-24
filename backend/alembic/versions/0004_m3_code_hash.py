"""Permit salted Argon2 hashes for short review codes in existing M3 databases."""

import sqlalchemy as sa

from alembic import op

revision = "0004_m3_code_hash"
down_revision = "0003_m3"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("email_challenges", "code_hash", type_=sa.String(255))


def downgrade():
    # The earlier M3 migration now creates this column at 255 characters too.
    pass
