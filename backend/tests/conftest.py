import pytest
from sqlalchemy import delete

from app import auth
from app.db import SessionLocal, engine
from app.models import (
    Agency,
    ChangeRequest,
    Client,
    EmailChallenge,
    EmailToken,
    OwnerSession,
    Project,
    RateLimit,
    RequestEvent,
    ReviewAccessToken,
    ReviewSession,
    User,
)


@pytest.fixture(autouse=True)
def clean_database():
    if not (engine.url.database or "").endswith("_test"):
        pytest.fail("Set DATABASE_URL to a dedicated database ending in _test before running tests")
    with SessionLocal() as db:
        for model in (
            ReviewSession,
            EmailChallenge,
            ReviewAccessToken,
            RequestEvent,
            ChangeRequest,
            Project,
            Client,
            Agency,
            EmailToken,
            OwnerSession,
            User,
            RateLimit,
        ):
            db.execute(delete(model))
        db.commit()


@pytest.fixture
def inbox(monkeypatch):
    messages = []
    monkeypatch.setattr(
        auth, "send_mail", lambda to, subject, body: messages.append((to, subject, body))
    )
    return messages
