"""Clients and editable project baselines."""

import sqlalchemy as sa

from alembic import op

revision = "0002_m2"
down_revision = "0001_m1"
branch_labels = None
depends_on = None


def common():
    return [
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("agency_id", sa.UUID(), sa.ForeignKey("agencies.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade():
    op.create_table(
        "clients",
        *common(),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("company", sa.String(120)),
        sa.Column("email", sa.String(320), nullable=False),
        sa.UniqueConstraint("id", "agency_id", name="uq_client_agency"),
    )
    op.create_index("ix_clients_agency_id", "clients", ["agency_id"])
    op.create_table(
        "projects",
        *common(),
        sa.Column("client_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("baseline_deliverables", sa.Text(), nullable=False),
        sa.Column("exclusions", sa.Text()),
        sa.Column("original_price_minor", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("delivery_date", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(
            ["client_id", "agency_id"],
            ["clients.id", "clients.agency_id"],
            ondelete="RESTRICT",
            name="fk_project_client_agency",
        ),
        sa.CheckConstraint(
            "original_price_minor >= 0 AND original_price_minor <= 9007199254740991",
            name="ck_project_price",
        ),
        sa.CheckConstraint("currency IN ('PKR', 'USD', 'GBP', 'EUR')", name="ck_project_currency"),
    )
    op.create_index("ix_projects_agency_id", "projects", ["agency_id"])
    op.create_index("ix_projects_client_id", "projects", ["client_id"])


def downgrade():
    op.drop_table("projects")
    op.drop_table("clients")
