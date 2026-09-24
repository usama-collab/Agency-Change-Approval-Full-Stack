import pytest
from sqlalchemy import delete

from app import auth
from app.db import SessionLocal, engine
from app.models import Agency, Client, EmailToken, OwnerSession, Project, RateLimit, User


@pytest.fixture(autouse=True)
def clean_database():
    if not (engine.url.database or "").endswith("_test"):
        pytest.fail("Set DATABASE_URL to a dedicated database ending in _test before running tests")
    with SessionLocal() as db:
        for model in (Project, Client, Agency, EmailToken, OwnerSession, User, RateLimit):
            db.execute(delete(model))
        db.commit()


@pytest.fixture
def inbox(monkeypatch):
    messages = []
    monkeypatch.setattr(
        auth, "send_mail", lambda to, subject, body: messages.append((to, subject, body))
    )
    return messages
