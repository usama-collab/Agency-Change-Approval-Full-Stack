"""Agency overview and cross-project request browsing."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from sqlalchemy import case, func, select

from app.auth import Current
from app.models import ChangeRequest, Client, Project, utcnow
from app.records import Db, agency_for, owned
from app.requests import effective_status

router = APIRouter(tags=["dashboard"])
CURRENCIES = ("PKR", "USD", "GBP", "EUR")
STATUSES = ("draft", "pending", "approved", "rejected", "withdrawn", "expired")
Status = Literal["draft", "pending", "approved", "rejected", "withdrawn", "expired"]
Currency = Literal["PKR", "USD", "GBP", "EUR"]


@router.get("/api/dashboard")
def dashboard(current: Current, db: Db):
    agency_id = agency_for(db, current[0].id)
    cutoff = utcnow()
    projects = db.execute(
        select(
            Project.currency,
            func.count(Project.id),
            func.sum(Project.original_price_minor),
            func.sum(Project.current_price_minor),
        )
        .where(Project.agency_id == agency_id)
        .group_by(Project.currency)
    ).all()
    pending = db.execute(
        select(Project.currency, func.sum(ChangeRequest.additional_price_minor))
        .join(Project, Project.id == ChangeRequest.project_id)
        .where(
            ChangeRequest.agency_id == agency_id,
            Project.agency_id == agency_id,
            ChangeRequest.status == "pending",
            ChangeRequest.expires_at > cutoff,
        )
        .group_by(Project.currency)
    ).all()
    by_currency = {
        currency: {
            "currency": currency,
            "project_count": 0,
            "original_minor": "0",
            "approved_minor": "0",
            "current_minor": "0",
            "pending_minor": "0",
        }
        for currency in CURRENCIES
    }
    for currency, count, original, agreed in projects:
        summary = by_currency[currency]
        summary.update(
            project_count=count,
            original_minor=str(original),
            approved_minor=str(agreed - original),
            current_minor=str(agreed),
        )
    for currency, amount in pending:
        by_currency[currency]["pending_minor"] = str(amount)
    effective = case(
        (
            (ChangeRequest.status == "pending") & (ChangeRequest.expires_at <= cutoff),
            "expired",
        ),
        else_=ChangeRequest.status,
    )
    counts = dict(
        db.execute(
            select(effective, func.count(ChangeRequest.id))
            .where(ChangeRequest.agency_id == agency_id)
            .group_by(effective)
        ).all()
    )
    return {
        "as_of": cutoff,
        "status_counts": {status: counts.get(status, 0) for status in STATUSES},
        "currencies": list(by_currency.values()),
    }


@router.get("/api/requests")
def list_agency_requests(
    current: Current,
    db: Db,
    status: Status | None = None,
    project_id: uuid.UUID | None = None,
    currency: Currency | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=1000000)] = 0,
):
    agency_id = agency_for(db, current[0].id)
    if project_id is not None:
        owned(db, Project, project_id, agency_id)
    cutoff = utcnow()
    effective = case(
        (
            (ChangeRequest.status == "pending") & (ChangeRequest.expires_at <= cutoff),
            "expired",
        ),
        else_=ChangeRequest.status,
    )
    query = (
        select(ChangeRequest, Project, Client)
        .join(Project, Project.id == ChangeRequest.project_id)
        .join(Client, Client.id == Project.client_id)
        .where(
            ChangeRequest.agency_id == agency_id,
            Project.agency_id == agency_id,
            Client.agency_id == agency_id,
        )
    )
    if status is not None:
        query = query.where(effective == status)
    if project_id is not None:
        query = query.where(ChangeRequest.project_id == project_id)
    if currency is not None:
        query = query.where(Project.currency == currency)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.execute(
        query.order_by(ChangeRequest.created_at.desc(), ChangeRequest.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return {
        "items": [
            {
                "id": request.id,
                "project_id": request.project_id,
                "project_title": request.snapshot["project_title"]
                if request.snapshot
                else project.title,
                "client_name": request.snapshot["client_name"] if request.snapshot else client.name,
                "description": request.description,
                "currency": project.currency,
                "additional_price_minor": request.additional_price_minor,
                "status": effective_status(request),
                "created_at": request.created_at,
                "issued_at": request.issued_at,
                "expires_at": request.expires_at,
                "decided_at": request.decided_at,
            }
            for request, project, client in rows
        ],
        "total": total,
    }
