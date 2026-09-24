"""PostgreSQL approval workflow tests, including competing transactions."""

import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app import review
from app.db import SessionLocal
from app.main import app
from app.models import ChangeRequest, EmailChallenge, Project, RequestEvent, utcnow
from tests.support import ORIGIN, create_owner, post, pre_csrf


def setup(browser, inbox, email="owner@example.com"):
    csrf = create_owner(browser, inbox, email)
    agency = post(
        browser,
        "/api/agencies",
        {"name": "Agency", "contact_name": "Owner", "contact_email": email},
        csrf,
    )
    assert agency.status_code == 201
    client = post(
        browser, "/api/clients", {"name": "Approver", "email": "approver@example.com"}, csrf
    ).json()
    project = post(
        browser,
        "/api/projects",
        {
            "client_id": client["id"],
            "title": "Site",
            "baseline_deliverables": "Three pages",
            "original_price_minor": 10001,
            "currency": "USD",
            "delivery_date": "2026-11-01",
        },
        csrf,
    ).json()
    return csrf, client, project


def draft_payload(price=2500):
    return {
        "description": "Add a booking page",
        "reason": "New requirement",
        "extra_deliverables": "Booking form",
        "additional_price_minor": price,
        "proposed_delivery_date": "2026-11-15",
    }


def issue(browser, csrf, project):
    draft = post(browser, f"/api/projects/{project['id']}/requests", draft_payload(), csrf)
    assert draft.status_code == 201, draft.text
    issued = post(browser, f"/api/requests/{draft.json()['id']}/issue", {}, csrf)
    assert issued.status_code == 200, issued.text
    return issued.json()


def client_write(browser, path, body):
    csrf = pre_csrf(browser)
    return post(browser, f"/api/review/{path}", body, csrf)


def verify(browser, raw, messages):
    assert client_write(browser, "code", {"token": raw}).status_code == 200
    code = re.search(r"\b\d{6}\b", messages[-1][2]).group()
    result = client_write(browser, "verify", {"token": raw, "code": code})
    assert result.status_code == 200, result.text
    return browser.cookies["review_csrf"], code


def decision(browser, csrf, action="approved", name="Client", reason=None):
    return post(
        browser,
        "/api/review/decision",
        {
            "decision": action,
            "name": name,
            "agreement": action == "approved",
            "reason": reason,
        },
        csrf,
    )


def test_issue_verify_approve_retry_and_frozen_snapshot(inbox, monkeypatch):
    messages = []
    monkeypatch.setattr(
        review, "send_mail", lambda to, subject, body: messages.append((to, subject, body))
    )
    with TestClient(app) as owner, TestClient(app) as visitor:
        csrf, client, project = setup(owner, inbox)
        draft = post(owner, f"/api/projects/{project['id']}/requests", draft_payload(), csrf).json()
        preview = owner.get(f"/api/requests/{draft['id']}/preview").json()
        assert (preview["current_price_minor"], preview["new_total_minor"]) == (10001, 12501)
        issued = post(owner, f"/api/requests/{draft['id']}/issue", {}, csrf).json()
        raw = issued["review_link"].split("#token=")[1]
        assert owner.get(f"/api/projects/{project['id']}").json()["first_issued_at"]
        assert post(owner, f"/api/requests/{draft['id']}/issue", {}, csrf).status_code == 409
        assert (
            owner.put(
                f"/api/projects/{project['id']}",
                json={
                    "client_id": client["id"],
                    "title": "Site",
                    "baseline_deliverables": "Changed",
                    "original_price_minor": 10001,
                    "currency": "USD",
                    "delivery_date": "2026-11-01",
                },
                headers={"Origin": ORIGIN, "X-CSRF-Token": csrf},
            ).status_code
            == 409
        )
        assert (
            owner.delete(
                f"/api/projects/{project['id']}", headers={"Origin": ORIGIN, "X-CSRF-Token": csrf}
            ).status_code
            == 409
        )
        assert (
            post(
                owner, f"/api/projects/{project['id']}/requests", draft_payload(), csrf
            ).status_code
            == 201
        )
        second = owner.get(f"/api/projects/{project['id']}/requests").json()["items"][0]
        assert post(owner, f"/api/requests/{second['id']}/issue", {}, csrf).status_code == 409
        owner.put(
            f"/api/clients/{client['id']}",
            json={"name": "Changed", "email": "changed@example.com"},
            headers={"Origin": ORIGIN, "X-CSRF-Token": csrf},
        )
        access = client_write(visitor, "access", {"token": raw})
        assert access.status_code == 200
        assert "10001" not in access.text and "approver@example.com" not in access.text
        assert visitor.get("/api/review/proposal").status_code == 401
        review_csrf, code = verify(visitor, raw, messages)
        assert messages[-1][0] == "approver@example.com"
        assert client_write(visitor, "verify", {"token": raw, "code": code}).status_code == 400
        assert client_write(visitor, "code", {"token": raw}).status_code == 429
        proposal = visitor.get("/api/review/proposal").json()
        assert proposal["snapshot"]["client_name"] == "Approver"
        assert proposal["snapshot"]["approver_email"] == "approver@example.com"
        assert proposal["snapshot"]["new_total_minor"] == 12501
        assert decision(visitor, review_csrf, name=" ").status_code == 422
        assert (
            post(
                visitor,
                "/api/review/decision",
                {"decision": "approved", "name": "Client", "agreement": False},
                review_csrf,
            ).status_code
            == 422
        )
        first = decision(visitor, review_csrf)
        assert first.status_code == 200, first.text
        assert first.json()["status"] == "approved"
        assert decision(visitor, review_csrf).status_code == 200
        assert decision(visitor, review_csrf, "rejected").status_code == 409
        current = owner.get(f"/api/projects/{project['id']}").json()
        assert (current["current_price_minor"], current["current_delivery_date"]) == (
            12501,
            "2026-11-15",
        )
        with SessionLocal() as db:
            assert (
                db.scalar(
                    select(func.count())
                    .select_from(RequestEvent)
                    .where(
                        RequestEvent.request_id == draft["id"], RequestEvent.action == "approved"
                    )
                )
                == 1
            )


def test_code_limits_rotation_rejection_and_tenant_isolation(inbox, monkeypatch):
    messages = []
    monkeypatch.setattr(
        review, "send_mail", lambda to, subject, body: messages.append((to, subject, body))
    )
    with TestClient(app) as owner, TestClient(app) as outsider, TestClient(app) as visitor:
        csrf, _, project = setup(owner, inbox)
        other_csrf, _, _ = setup(outsider, inbox, "other@example.com")
        issued = issue(owner, csrf, project)
        rid = issued["request"]["id"]
        assert outsider.get(f"/api/requests/{rid}").status_code == 404
        assert post(outsider, f"/api/requests/{rid}/withdraw", {}, other_csrf).status_code == 404
        raw = issued["review_link"].split("#token=")[1]
        assert client_write(visitor, "code", {"token": raw}).status_code == 200
        assert client_write(visitor, "code", {"token": raw}).status_code == 429
        old_code = re.search(r"\b\d{6}\b", messages[-1][2]).group()
        with SessionLocal() as db:
            challenge = db.get(EmailChallenge, uuid.UUID(rid))
            challenge.sent_at = utcnow() - timedelta(seconds=61)
            db.commit()
        monkeypatch.setattr(
            review.secrets, "randbelow", lambda maximum: (int(old_code) + 1) % maximum
        )
        assert client_write(visitor, "code", {"token": raw}).status_code == 200
        assert client_write(visitor, "verify", {"token": raw, "code": old_code}).status_code == 400
        actual = re.search(r"\b\d{6}\b", messages[-1][2]).group()
        wrong = "000000" if actual != "000000" else "999999"
        for _ in range(4):
            assert client_write(visitor, "verify", {"token": raw, "code": wrong}).status_code == 400
        assert client_write(visitor, "verify", {"token": raw, "code": actual}).status_code == 400
        rotated = (
            post(owner, f"/api/requests/{rid}/rotate-link", {}, csrf)
            .json()["review_link"]
            .split("#token=")[1]
        )
        assert client_write(visitor, "access", {"token": raw}).status_code == 404
        with SessionLocal() as db:
            challenge = db.get(EmailChallenge, uuid.UUID(rid))
            challenge.sent_at = utcnow() - timedelta(seconds=61)
            db.commit()
        review_csrf, _ = verify(visitor, rotated, messages)
        assert decision(visitor, review_csrf, "rejected", reason="No budget").status_code == 200
        assert owner.get(f"/api/projects/{project['id']}").json()["current_price_minor"] == 10001
        assert post(owner, f"/api/requests/{rid}/withdraw", {}, csrf).status_code == 409


def test_approval_withdrawal_race_has_one_terminal_result(inbox, monkeypatch):
    messages = []
    monkeypatch.setattr(
        review, "send_mail", lambda to, subject, body: messages.append((to, subject, body))
    )
    with TestClient(app) as owner, TestClient(app) as visitor:
        csrf, _, project = setup(owner, inbox)
        issued = issue(owner, csrf, project)
        rid = issued["request"]["id"]
        raw = issued["review_link"].split("#token=")[1]
        review_csrf, _ = verify(visitor, raw, messages)
        gate = Barrier(2)

        def approve():
            gate.wait()
            return decision(visitor, review_csrf).status_code

        def withdraw():
            gate.wait()
            return post(owner, f"/api/requests/{rid}/withdraw", {}, csrf).status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            a = pool.submit(approve)
            w = pool.submit(withdraw)
            outcomes = (a.result(), w.result())
            assert outcomes.count(200) == 1
            assert set(outcomes) <= {200, 401, 409}
        with SessionLocal() as db:
            record = db.get(ChangeRequest, uuid.UUID(rid))
            current = db.get(Project, uuid.UUID(project["id"]))
            assert record.status in ("approved", "withdrawn")
            assert current.current_price_minor == (12501 if record.status == "approved" else 10001)
            assert (
                db.scalar(
                    select(func.count())
                    .select_from(RequestEvent)
                    .where(
                        RequestEvent.request_id == rid,
                        RequestEvent.action.in_(("approved", "withdrawn")),
                    )
                )
                == 1
            )


def test_stale_draft_expiry_and_email_failure(inbox, monkeypatch):
    messages = []
    with TestClient(app) as owner, TestClient(app) as visitor:
        csrf, client, project = setup(owner, inbox)
        draft = post(owner, f"/api/projects/{project['id']}/requests", draft_payload(), csrf).json()
        changed = owner.put(
            f"/api/projects/{project['id']}",
            json={
                "client_id": client["id"],
                "title": "Site",
                "baseline_deliverables": "Four pages",
                "original_price_minor": 10001,
                "currency": "USD",
                "delivery_date": "2026-11-01",
            },
            headers={"Origin": ORIGIN, "X-CSRF-Token": csrf},
        )
        assert changed.status_code == 200
        assert owner.get(f"/api/requests/{draft['id']}/preview").json()["stale"] is True
        assert post(owner, f"/api/requests/{draft['id']}/issue", {}, csrf).status_code == 409
        updated = owner.put(
            f"/api/requests/{draft['id']}",
            json=draft_payload(),
            headers={"Origin": ORIGIN, "X-CSRF-Token": csrf},
        )
        assert updated.status_code == 200
        issued = post(owner, f"/api/requests/{draft['id']}/issue", {}, csrf).json()
        raw = issued["review_link"].split("#token=")[1]

        def failed_mail(to, subject, body):
            raise OSError("local mail unavailable")

        monkeypatch.setattr(review, "send_mail", failed_mail)
        assert client_write(visitor, "code", {"token": raw}).status_code == 503
        monkeypatch.setattr(
            review, "send_mail", lambda to, subject, body: messages.append((to, subject, body))
        )
        assert client_write(visitor, "code", {"token": raw}).status_code == 200
        with SessionLocal() as db:
            record = db.get(ChangeRequest, uuid.UUID(draft["id"]))
            record.expires_at = utcnow() - timedelta(seconds=1)
            db.commit()
        assert client_write(visitor, "access", {"token": raw}).json()["status"] == "expired"
        assert (
            client_write(
                visitor,
                "verify",
                {"token": raw, "code": re.search(r"\b\d{6}\b", messages[-1][2]).group()},
            ).status_code
            == 409
        )
        new_draft = post(
            owner, f"/api/projects/{project['id']}/requests", draft_payload(), csrf
        ).json()
        assert post(owner, f"/api/requests/{new_draft['id']}/issue", {}, csrf).status_code == 200
        assert owner.get(f"/api/requests/{draft['id']}").json()["status"] == "expired"


def test_competing_client_decisions_change_terms_once(inbox, monkeypatch):
    messages = []
    monkeypatch.setattr(
        review, "send_mail", lambda to, subject, body: messages.append((to, subject, body))
    )
    with TestClient(app) as owner, TestClient(app) as visitor:
        csrf, _, project = setup(owner, inbox)
        issued = issue(owner, csrf, project)
        rid = issued["request"]["id"]
        review_csrf, _ = verify(visitor, issued["review_link"].split("#token=")[1], messages)
        gate = Barrier(2)

        def submit(kind):
            gate.wait()
            return decision(visitor, review_csrf, kind).status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            a = pool.submit(submit, "approved")
            b = pool.submit(submit, "rejected")
            assert sorted((a.result(), b.result())) == [200, 409]
        with SessionLocal() as db:
            record = db.get(ChangeRequest, uuid.UUID(rid))
            current = db.get(Project, uuid.UUID(project["id"]))
            assert current.current_price_minor == (12501 if record.status == "approved" else 10001)
            assert (
                db.scalar(
                    select(func.count())
                    .select_from(RequestEvent)
                    .where(
                        RequestEvent.request_id == rid,
                        RequestEvent.action.in_(("approved", "rejected")),
                    )
                )
                == 1
            )
