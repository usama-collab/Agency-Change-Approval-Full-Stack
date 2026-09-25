"""Dashboard accounting, immutable records, and tenant-scoped history."""

import re
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app import review
from app.db import SessionLocal
from app.main import app
from app.models import ChangeRequest, RequestEvent, utcnow
from tests.support import ORIGIN, post
from tests.test_m3 import client_write, decision, draft_payload, issue, setup, verify


def test_dashboard_totals_filters_history_and_frozen_record(inbox, monkeypatch):
    messages = []
    monkeypatch.setattr(review, "send_mail", lambda *args: messages.append(args))
    with TestClient(app) as owner, TestClient(app) as other, TestClient(app) as visitor:
        csrf, client, project = setup(owner, inbox)
        foreign_csrf, _, foreign_project = setup(other, inbox, "other@example.com")
        issued = issue(owner, csrf, project)
        request_id = issued["request"]["id"]
        raw = issued["review_link"].split("#token=")[1]
        assert client_write(visitor, "access", {"token": raw}).status_code == 200
        verify(visitor, raw, messages)
        assert decision(visitor, visitor.cookies["review_csrf"]).status_code == 200
        assert decision(visitor, visitor.cookies["review_csrf"]).status_code == 200
        assert (
            post(other, f"/api/requests/{request_id}/withdraw", {}, foreign_csrf).status_code == 404
        )
        assert other.get(f"/api/requests/{request_id}/events").status_code == 404
        assert other.get(f"/api/requests?project_id={project['id']}").status_code == 404
        assert owner.get(f"/api/requests?project_id={foreign_project['id']}").status_code == 404

        second = post(
            owner,
            "/api/projects",
            {
                "client_id": client["id"],
                "title": "Another site",
                "baseline_deliverables": "Work",
                "original_price_minor": 9007199254740000,
                "currency": "USD",
                "delivery_date": "2026-12-01",
            },
            csrf,
        ).json()
        pending_draft = post(
            owner, f"/api/projects/{second['id']}/requests", draft_payload(500), csrf
        ).json()
        pending = post(owner, f"/api/requests/{pending_draft['id']}/issue", {}, csrf).json()
        third = post(
            owner,
            "/api/projects",
            {
                "client_id": client["id"],
                "title": "Local site",
                "baseline_deliverables": "Work",
                "original_price_minor": 200,
                "currency": "PKR",
                "delivery_date": "2026-12-01",
            },
            csrf,
        ).json()
        # A draft must not change pending or approved totals.
        post(owner, f"/api/projects/{third['id']}/requests", draft_payload(), csrf)
        dashboard = owner.get("/api/dashboard").json()
        usd = next(item for item in dashboard["currencies"] if item["currency"] == "USD")
        pkr = next(item for item in dashboard["currencies"] if item["currency"] == "PKR")
        assert usd["original_minor"] == str(9007199254750001)
        assert usd["approved_minor"] == "2500"
        assert usd["current_minor"] == str(9007199254752501)
        assert usd["pending_minor"] == "500"
        assert pkr["original_minor"] == "200"
        assert pkr["pending_minor"] == "0"
        assert dashboard["status_counts"]["approved"] == 1
        assert dashboard["status_counts"]["pending"] == 1
        assert dashboard["status_counts"]["draft"] == 1
        assert other.get("/api/dashboard").json()["currencies"][1]["project_count"] == 1

        filtered = owner.get("/api/requests?status=approved&currency=USD").json()
        assert filtered["total"] == 1 and filtered["items"][0]["id"] == request_id
        assert owner.get("/api/requests?status=approved&currency=PKR").json()["total"] == 0
        assert owner.get("/api/requests?status=unknown").status_code == 422
        events = owner.get(f"/api/requests/{request_id}/events").json()
        assert [event["action"] for event in events["items"]] == [
            "draft_created",
            "issued",
            "approved",
        ]
        assert (
            owner.get(f"/api/requests/{request_id}/events?limit=1&offset=2").json()["items"][0][
                "action"
            ]
            == "approved"
        )

        owner.put(
            f"/api/clients/{client['id']}",
            json={"name": "Changed", "email": "changed@example.com"},
            headers={"Origin": ORIGIN, "X-CSRF-Token": csrf},
        )
        record = owner.get(f"/api/requests/{request_id}").json()
        assert record["snapshot"]["client_name"] == "Approver"
        assert record["snapshot"]["approver_email"] == "approver@example.com"
        assert "token" not in str(record).lower()
        assert "code" not in str(events).lower()

        with SessionLocal() as db:
            item = db.scalar(
                select(ChangeRequest).where(ChangeRequest.id == pending["request"]["id"])
            )
            item.expires_at = utcnow() - timedelta(seconds=1)
            before = db.query(RequestEvent).count()
            db.commit()
        assert owner.get("/api/dashboard").json()["currencies"][1]["pending_minor"] == "0"
        assert owner.get("/api/requests?status=expired").json()["total"] == 1
        with SessionLocal() as db:
            assert db.query(RequestEvent).count() == before


def test_client_record_requires_review_session(inbox, monkeypatch):
    messages = []
    monkeypatch.setattr(review, "send_mail", lambda *args: messages.append(args))
    with TestClient(app) as owner, TestClient(app) as visitor:
        csrf, _, project = setup(owner, inbox)
        issued = issue(owner, csrf, project)
        raw = issued["review_link"].split("#token=")[1]
        assert visitor.get("/api/review/proposal").status_code == 401
        assert client_write(visitor, "access", {"token": raw}).status_code == 200
        assert visitor.get("/api/review/proposal").status_code == 401
        verify(visitor, raw, messages)
        proposal = visitor.get("/api/review/proposal").json()
        assert proposal["id"] == issued["request"]["id"]
        assert re.fullmatch(r"[0-9a-f-]{36}", proposal["id"])
