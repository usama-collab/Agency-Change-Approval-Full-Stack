"""Exercise both installation paths on the guarded, disposable test database."""

import uuid

from alembic.config import Config
from sqlalchemy import inspect, text

from alembic import command
from app.db import engine


def test_empty_and_existing_m1_upgrade():
    assert (engine.url.database or "").endswith("_test")
    config = Config("alembic.ini")
    command.downgrade(config, "base")
    try:
        command.upgrade(config, "head")
        assert {
            "users",
            "agencies",
            "clients",
            "projects",
            "change_requests",
            "review_sessions",
        } <= set(inspect(engine).get_table_names())
        command.downgrade(config, "0001_m1")
        owner, agency = uuid.uuid4(), uuid.uuid4()
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO users (id, email, password_hash, is_verified, created_at) "
                    "VALUES (:id, 'preserved@example.com', 'test-only-hash', true, now())"
                ),
                {"id": owner},
            )
            connection.execute(
                text(
                    "INSERT INTO agencies "
                    "(id, owner_id, name, contact_name, contact_email, created_at) "
                    "VALUES (:id, :owner, 'Preserved agency', 'Owner', "
                    "'preserved@example.com', now())"
                ),
                {"id": agency, "owner": owner},
            )
        command.upgrade(config, "0002_m2")
        client, project = uuid.uuid4(), uuid.uuid4()
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO clients (id, agency_id, name, email, created_at, updated_at) "
                    "VALUES (:id, :agency, 'Preserved client', 'client@example.com', now(), now())"
                ),
                {"id": client, "agency": agency},
            )
            connection.execute(
                text(
                    "INSERT INTO projects (id, agency_id, client_id, title, baseline_deliverables, "
                    "original_price_minor, currency, delivery_date, created_at, updated_at) "
                    "VALUES (:id, :agency, :client, 'Preserved project', 'Work', 12345, 'USD', "
                    "'2026-12-01', now(), now())"
                ),
                {"id": project, "agency": agency, "client": client},
            )
        command.upgrade(config, "head")
        with engine.connect() as connection:
            assert (
                connection.scalar(
                    text("SELECT owner_id FROM agencies WHERE id = :id"), {"id": agency}
                )
                == owner
            )
            assert (
                connection.scalar(text("SELECT email FROM users WHERE id = :id"), {"id": owner})
                == "preserved@example.com"
            )
        assert "projects" in inspect(engine).get_table_names()
        with engine.connect() as connection:
            terms = connection.execute(
                text(
                    "SELECT current_price_minor, current_delivery_date, terms_version "
                    "FROM projects WHERE id = :id"
                ),
                {"id": project},
            ).one()
            assert (
                terms.current_price_minor,
                str(terms.current_delivery_date),
                terms.terms_version,
            ) == (
                12345,
                "2026-12-01",
                0,
            )
    finally:
        command.upgrade(config, "head")
