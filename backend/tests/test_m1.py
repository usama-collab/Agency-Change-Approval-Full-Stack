from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app import auth
from app.db import SessionLocal
from app.main import app
from app.models import EmailToken, utcnow
from tests.support import ORIGIN, create_owner, post, pre_csrf, token_from


def test_registration_session_logout_and_csrf(inbox):
    with TestClient(app) as client:
        csrf = pre_csrf(client)
        assert (
            client.post(
                "/api/auth/register",
                json={"email": "a@example.com", "password": "long-safe-password-123"},
            ).status_code
            == 403
        )
        assert (
            post(
                client,
                "/api/auth/register",
                {"email": "a@example.com", "password": "long-safe-password-123"},
                csrf,
            ).status_code
            == 201
        )
        assert (
            post(
                client,
                "/api/auth/login",
                {"email": "a@example.com", "password": "long-safe-password-123"},
                csrf,
            ).status_code
            == 403
        )
        assert (
            post(client, "/api/auth/verify", {"token": token_from(inbox)}, csrf).status_code == 200
        )
        session_csrf = post(
            client,
            "/api/auth/login",
            {"email": "a@example.com", "password": "long-safe-password-123"},
            csrf,
        ).json()["csrf_token"]
        assert client.get("/api/auth/me").status_code == 200
        assert client.post("/api/auth/logout", headers={"Origin": ORIGIN}).status_code == 403
        assert post(client, "/api/auth/logout", {}, session_csrf).status_code == 200
        assert client.get("/api/auth/me").status_code == 401


def test_two_owners_are_isolated_and_one_agency_each(inbox):
    with TestClient(app) as a, TestClient(app) as b:
        a_csrf = create_owner(a, inbox, "owner-a@example.com")
        b_csrf = create_owner(b, inbox, "owner-b@example.com")
        payload = {"name": "Agency A", "contact_name": "Owner A", "contact_email": "a@example.com"}
        created = post(a, "/api/agencies", payload, a_csrf)
        assert created.status_code == 201, created.text
        agency_id = created.json()["id"]
        assert post(a, "/api/agencies", payload, a_csrf).status_code == 409
        assert b.get(f"/api/agencies/{agency_id}").status_code == 404
        assert (
            b.put(
                f"/api/agencies/{agency_id}",
                json=payload,
                headers={"Origin": ORIGIN, "X-CSRF-Token": b_csrf},
            ).status_code
            == 404
        )
        assert b.get("/api/agencies/me").json() is None
        assert a.get(f"/api/agencies/{agency_id}").json()["name"] == "Agency A"


def test_reset_is_one_use_expires_and_revokes_all_sessions(inbox):
    with TestClient(app) as client, TestClient(app) as second:
        create_owner(client, inbox, "owner@example.com")
        csrf = pre_csrf(second)
        login = post(
            second,
            "/api/auth/login",
            {"email": "owner@example.com", "password": "long-safe-password-123"},
            csrf,
        )
        assert login.status_code == 200
        reset_request = post(
            client, "/api/auth/forgot-password", {"email": "owner@example.com"}, pre_csrf(client)
        )
        assert reset_request.status_code == 200
        reset_token = token_from(inbox)
        changed = post(
            client,
            "/api/auth/reset-password",
            {"token": reset_token, "password": "new-long-safe-password-456"},
            pre_csrf(client),
        )
        assert changed.status_code == 200
        assert (
            post(
                client,
                "/api/auth/reset-password",
                {"token": reset_token, "password": "another-long-password"},
                pre_csrf(client),
            ).status_code
            == 400
        )
        assert second.get("/api/auth/me").status_code == 401
        csrf = pre_csrf(second)
        assert (
            post(
                second,
                "/api/auth/login",
                {"email": "owner@example.com", "password": "long-safe-password-123"},
                csrf,
            ).status_code
            == 401
        )
        assert (
            post(
                second,
                "/api/auth/login",
                {"email": "owner@example.com", "password": "new-long-safe-password-456"},
                csrf,
            ).status_code
            == 200
        )
        post(client, "/api/auth/forgot-password", {"email": "owner@example.com"}, pre_csrf(client))
        expired = token_from(inbox)
        with SessionLocal() as db:
            record = db.execute(
                select(EmailToken).where(EmailToken.token_hash == auth.digest(expired))
            ).scalar_one()
            record.expires_at = utcnow() - timedelta(seconds=1)
            db.commit()
        assert (
            post(
                client,
                "/api/auth/reset-password",
                {"token": expired, "password": "another-long-password"},
                pre_csrf(client),
            ).status_code
            == 400
        )


def test_resend_invalidates_old_link_and_recovery_is_limited(inbox):
    with TestClient(app) as client:
        csrf = pre_csrf(client)
        credentials = {"email": "resend@example.com", "password": "long-safe-password-123"}
        assert post(client, "/api/auth/register", credentials, csrf).status_code == 201
        old_link = token_from(inbox)
        assert (
            post(
                client, "/api/auth/resend-verification", {"email": credentials["email"]}, csrf
            ).status_code
            == 200
        )
        assert post(client, "/api/auth/verify", {"token": old_link}, csrf).status_code == 400
        assert (
            post(client, "/api/auth/verify", {"token": token_from(inbox)}, csrf).status_code == 200
        )
        for _ in range(10):
            assert (
                post(
                    client, "/api/auth/forgot-password", {"email": "absent@example.com"}, csrf
                ).status_code
                == 200
            )
        assert (
            post(
                client, "/api/auth/forgot-password", {"email": "absent@example.com"}, csrf
            ).status_code
            == 429
        )


def test_email_failure_reports_retry_without_claiming_delivery(monkeypatch):
    with TestClient(app) as client:
        csrf = pre_csrf(client)

        def fail(*_args):
            raise OSError("mail sink unavailable")

        monkeypatch.setattr(auth, "send_mail", fail)
        response = post(
            client,
            "/api/auth/register",
            {"email": "mail-failure@example.com", "password": "long-safe-password-123"},
            csrf,
        )
        assert response.status_code == 503
        assert "retry" in response.json()["detail"].lower()
