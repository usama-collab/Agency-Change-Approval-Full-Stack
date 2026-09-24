import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError

from app.db import SessionLocal
from app.main import app
from app.models import Client, Project
from tests.support import ORIGIN, create_owner, post


def write(client, csrf, method, path, payload=None):
    return client.request(
        method, path, json=payload, headers={"Origin": ORIGIN, "X-CSRF-Token": csrf}
    )


def setup(client, inbox, email):
    csrf = create_owner(client, inbox, email)
    agency = post(
        client,
        "/api/agencies",
        {"name": "Agency", "contact_name": "Owner", "contact_email": email},
        csrf,
    )
    assert agency.status_code == 201
    return csrf


def client_payload(name="Client"):
    return {"name": name, "company": "Company", "email": "client@example.com"}


def project_payload(client_id, price=10001):
    return {
        "client_id": client_id,
        "title": "Website",
        "baseline_deliverables": "Three pages",
        "exclusions": "Hosting",
        "original_price_minor": price,
        "currency": "PKR",
        "delivery_date": "2020-01-01",
    }


def test_two_owner_crud_and_isolation(inbox):
    with TestClient(app) as a, TestClient(app) as b:
        ca = setup(a, inbox, "a@example.com")
        cb = setup(b, inbox, "b@example.com")
        records = []
        for browser, csrf in ((a, ca), (b, cb)):
            c = post(browser, "/api/clients", client_payload(), csrf)
            assert c.status_code == 201
            c = c.json()
            p = post(browser, "/api/projects", project_payload(c["id"]), csrf)
            assert p.status_code == 201
            records.append((c, p.json()))
        for browser, csrf, own, foreign in (
            (a, ca, records[0], records[1]),
            (b, cb, records[1], records[0]),
        ):
            for kind, obj, other, payload in (
                ("clients", own[0], foreign[0], client_payload("Updated")),
                ("projects", own[1], foreign[1], project_payload(own[0]["id"], 12345)),
            ):
                base = f"/api/{kind}"
                listing = browser.get(base).json()
                assert listing["total"] == 1
                assert listing["items"][0]["id"] == obj["id"]
                assert browser.get(f"{base}/{obj['id']}").status_code == 200
                assert browser.get(f"{base}/{other['id']}").status_code == 404
                assert (
                    write(browser, csrf, "PUT", f"{base}/{other['id']}", payload).status_code == 404
                )
                assert write(browser, csrf, "DELETE", f"{base}/{other['id']}").status_code == 404
                assert browser.get(f"{base}/{uuid.uuid4()}").status_code == 404
                updated = write(browser, csrf, "PUT", f"{base}/{obj['id']}", payload)
                assert updated.status_code == 200
                assert updated.json()["updated_at"] >= obj["updated_at"]
                assert browser.get(base + "?limit=0").status_code == 422
                assert browser.get(base + "?limit=101").status_code == 422
                assert browser.get(base + "?offset=-1").status_code == 422
                assert browser.get(base + "?offset=1").json()["items"] == []
            assert browser.get("/api/projects?client_id=" + foreign[0]["id"]).status_code == 404
            assert browser.get("/api/projects?client_id=" + own[0]["id"]).json()["total"] == 1
            assert (
                post(browser, "/api/projects", project_payload(foreign[0]["id"]), csrf).status_code
                == 404
            )
            assert (
                write(
                    browser,
                    csrf,
                    "PUT",
                    "/api/projects/" + own[1]["id"],
                    project_payload(foreign[0]["id"]),
                ).status_code
                == 404
            )
        for browser, csrf, (c, p) in ((a, ca, records[0]), (b, cb, records[1])):
            assert write(browser, csrf, "DELETE", "/api/clients/" + c["id"]).status_code == 409
            assert write(browser, csrf, "DELETE", "/api/projects/" + p["id"]).status_code == 204
            assert write(browser, csrf, "DELETE", "/api/clients/" + c["id"]).status_code == 204
            assert browser.get("/api/projects").json()["total"] == 0


def test_validation_money_reassignment_and_order(inbox):
    with TestClient(app) as browser:
        csrf = setup(browser, inbox, "a@example.com")
        c = post(browser, "/api/clients", client_payload(), csrf).json()
        second = post(browser, "/api/clients", client_payload("Second"), csrf).json()
        assert browser.get("/api/clients?limit=1").json()["items"][0]["id"] == second["id"]
        for patch in (
            {"name": "  "},
            {"name": "a" * 121},
            {"company": "a" * 121},
            {"email": "bad"},
        ):
            assert (
                post(browser, "/api/clients", {**client_payload(), **patch}, csrf).status_code
                == 422
            )
        for amount in (0, 1, 10001, 9007199254740991):
            p = post(browser, "/api/projects", project_payload(c["id"], amount), csrf)
            assert p.status_code == 201, p.text
            assert p.json()["original_price_minor"] == amount
            assert type(p.json()["original_price_minor"]) is int
            persisted = browser.get("/api/projects/" + p.json()["id"])
            assert persisted.status_code == 200
            assert persisted.json()["original_price_minor"] == amount
            updated = write(
                browser,
                csrf,
                "PUT",
                "/api/projects/" + p.json()["id"],
                {**project_payload(second["id"], amount), "currency": "EUR"},
            )
            assert updated.status_code == 200
            assert updated.json()["original_price_minor"] == amount
        for patch in (
            *({"original_price_minor": v} for v in (-1, 1.5, 1.0, True, "100", 9007199254740992)),
            {"currency": "CAD"},
            {"delivery_date": "2026-02-30"},
            {"delivery_date": "2026-01-01T00:00:00"},
            {"delivery_date": 0},
            {"title": " "},
            {"baseline_deliverables": "\n"},
        ):
            assert (
                post(
                    browser, "/api/projects", {**project_payload(c["id"]), **patch}, csrf
                ).status_code
                == 422
            )
        for currency in ("PKR", "USD", "GBP", "EUR"):
            assert (
                post(
                    browser,
                    "/api/projects",
                    {**project_payload(c["id"]), "currency": currency},
                    csrf,
                ).status_code
                == 201
            )


def test_missing_agency_and_write_guards(inbox):
    with TestClient(app) as browser:
        csrf = create_owner(browser, inbox, "a@example.com")
        for path, payload in (
            ("/api/clients", client_payload()),
            ("/api/projects", project_payload(str(uuid.uuid4()))),
        ):
            assert browser.get(path).status_code == 409
            assert post(browser, path, payload, csrf).status_code == 409
        post(
            browser,
            "/api/agencies",
            {"name": "Agency", "contact_name": "Owner", "contact_email": "a@example.com"},
            csrf,
        )
        c = post(browser, "/api/clients", client_payload(), csrf).json()
        p = post(browser, "/api/projects", project_payload(c["id"]), csrf).json()
        for base, obj, payload in (
            ("/api/clients", c, client_payload()),
            ("/api/projects", p, project_payload(c["id"])),
        ):
            for method, path in (
                ("POST", base),
                ("PUT", base + "/" + obj["id"]),
                ("DELETE", base + "/" + obj["id"]),
            ):
                for headers in (
                    {"Origin": ORIGIN},
                    {"Origin": "https://foreign.example", "X-CSRF-Token": csrf},
                    {"X-CSRF-Token": csrf},
                ):
                    assert (
                        browser.request(method, path, json=payload, headers=headers).status_code
                        == 403
                    )
        post(browser, "/api/auth/logout", {}, csrf)
        assert browser.get("/api/clients").status_code == 401
        assert browser.get("/api/projects").status_code == 401


def test_database_enforces_tenant_link_and_delete_restriction(inbox):
    with TestClient(app) as a, TestClient(app) as b:
        ca = setup(a, inbox, "a@example.com")
        cb = setup(b, inbox, "b@example.com")
        one = post(a, "/api/clients", client_payload(), ca).json()
        two = post(b, "/api/clients", client_payload(), cb).json()
        with SessionLocal() as db:
            db.add(
                Project(
                    agency_id=uuid.UUID(one["agency_id"]),
                    client_id=uuid.UUID(two["id"]),
                    title="Bad link",
                    baseline_deliverables="Work",
                    original_price_minor=0,
                    currency="USD",
                    delivery_date=date(2026, 1, 1),
                )
            )
            with pytest.raises(IntegrityError):
                db.commit()
            db.rollback()
        post(a, "/api/projects", project_payload(one["id"]), ca)
        with SessionLocal() as db:
            with pytest.raises(IntegrityError):
                db.execute(delete(Client).where(Client.id == uuid.UUID(one["id"])))
                db.commit()
            db.rollback()
