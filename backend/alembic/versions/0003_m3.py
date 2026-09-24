"""Change request approval workflow."""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

from alembic import op

revision = "0003_m3"
down_revision = "0002_m2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("projects", sa.Column("current_price_minor", sa.BigInteger()))
    op.add_column("projects", sa.Column("current_delivery_date", sa.Date()))
    op.add_column(
        "projects", sa.Column("terms_version", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column("projects", sa.Column("first_issued_at", sa.DateTime(timezone=True)))
    op.execute(
        "UPDATE projects SET current_price_minor = original_price_minor, "
        "current_delivery_date = delivery_date"
    )
    op.alter_column("projects", "current_price_minor", nullable=False)
    op.alter_column("projects", "current_delivery_date", nullable=False)
    op.create_unique_constraint("uq_project_agency", "projects", ["id", "agency_id"])
    op.create_check_constraint(
        "ck_project_current_price",
        "projects",
        "current_price_minor >= 0 AND current_price_minor <= 9007199254740991",
    )
    op.create_table(
        "change_requests",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("agency_id", sa.UUID(), sa.ForeignKey("agencies.id"), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("linked_from_id", sa.UUID(), sa.ForeignKey("change_requests.id")),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("extra_deliverables", sa.Text(), nullable=False),
        sa.Column("additional_price_minor", sa.BigInteger(), nullable=False),
        sa.Column("proposed_delivery_date", sa.Date(), nullable=False),
        sa.Column("draft_terms_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("snapshot", JSONB()),
        sa.Column("issued_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("decision_name", sa.String(120)),
        sa.Column("decision_email", sa.String(320)),
        sa.Column("decision_reason", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id", "agency_id"],
            ["projects.id", "projects.agency_id"],
            ondelete="RESTRICT",
            name="fk_request_project_agency",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'pending', 'approved', 'rejected', 'withdrawn', 'expired')",
            name="ck_request_status",
        ),
        sa.CheckConstraint(
            "additional_price_minor >= 0 AND additional_price_minor <= 9007199254740991",
            name="ck_request_price",
        ),
    )
    op.create_index("ix_change_requests_agency_id", "change_requests", ["agency_id"])
    op.create_index("ix_change_requests_project_id", "change_requests", ["project_id"])
    op.create_index(
        "uq_request_one_pending",
        "change_requests",
        ["project_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_table(
        "request_events",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "request_id",
            sa.UUID(),
            sa.ForeignKey("change_requests.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column("actor", sa.String(20), nullable=False),
        sa.Column("actor_email", sa.String(320)),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "review_access_tokens",
        sa.Column(
            "request_id",
            sa.UUID(),
            sa.ForeignKey("change_requests.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column("token_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("rotated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "email_challenges",
        sa.Column(
            "request_id",
            sa.UUID(),
            sa.ForeignKey("change_requests.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column("code_hash", sa.String(255), nullable=False),
        sa.Column("failed_attempts", sa.Integer(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "review_sessions",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "request_id",
            sa.UUID(),
            sa.ForeignKey("change_requests.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), unique=True, nullable=False),
        sa.Column("csrf_hash", sa.String(64), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_review_sessions_request_id", "review_sessions", ["request_id"])


def downgrade():
    op.drop_table("review_sessions")
    op.drop_table("email_challenges")
    op.drop_table("review_access_tokens")
    op.drop_table("request_events")
    op.drop_table("change_requests")
    op.drop_constraint("ck_project_current_price", "projects")
    op.drop_constraint("uq_project_agency", "projects")
    for column in (
        "first_issued_at",
        "terms_version",
        "current_delivery_date",
        "current_price_minor",
    ):
        op.drop_column("projects", column)
