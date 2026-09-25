"""Owner-managed change requests and immutable issuance."""

import re
import uuid
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.auth import Current, WriteCurrent
from app.config import settings
from app.models import (
    Agency,
    ChangeRequest,
    Client,
    EmailChallenge,
    Project,
    RequestEvent,
    ReviewAccessToken,
    ReviewSession,
    utcnow,
)
from app.records import Db, agency_for, commit, owned
from app.security import digest, random_token

router = APIRouter(tags=["requests"])
MAX_MONEY = 9007199254740991


class RequestInput(BaseModel):
    description: str = Field(min_length=1, max_length=10000)
    reason: str = Field(min_length=1, max_length=10000)
    extra_deliverables: str = Field(min_length=1, max_length=10000)
    additional_price_minor: int = Field(strict=True, ge=0, le=MAX_MONEY)
    proposed_delivery_date: date

    @field_validator("description", "reason", "extra_deliverables")
    @classmethod
    def nonblank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Cannot be blank")
        return value

    @field_validator("proposed_delivery_date", mode="before")
    @classmethod
    def date_text(cls, value: object) -> object:
        if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ValueError("Use YYYY-MM-DD")
        return value

    @classmethod
    def from_record(cls, record: ChangeRequest) -> "RequestInput":
        return cls.model_validate(
            {
                key: getattr(record, key).isoformat()
                if key == "proposed_delivery_date"
                else getattr(record, key)
                for key in cls.model_fields
            }
        )


def locked_project(db: Session, project_id: uuid.UUID, agency_id: uuid.UUID) -> Project:
    project = db.scalar(
        select(Project)
        .where(Project.id == project_id, Project.agency_id == agency_id)
        .with_for_update()
    )
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


def locked_request(
    db: Session, record_id: uuid.UUID, agency_id: uuid.UUID
) -> tuple[Project, ChangeRequest]:
    reference = owned(db, ChangeRequest, record_id, agency_id)
    project = locked_project(db, reference.project_id, agency_id)
    record = db.scalar(
        select(ChangeRequest)
        .where(ChangeRequest.id == record_id, ChangeRequest.agency_id == agency_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if record is None:
        raise HTTPException(404, "Request not found")
    return project, record


def effective_status(record: ChangeRequest) -> str:
    if record.status == "pending" and record.expires_at and record.expires_at <= utcnow():
        return "expired"
    return record.status


def output(record: ChangeRequest) -> dict:
    return {
        "id": record.id,
        "project_id": record.project_id,
        "linked_from_id": record.linked_from_id,
        "description": record.description,
        "reason": record.reason,
        "extra_deliverables": record.extra_deliverables,
        "additional_price_minor": record.additional_price_minor,
        "proposed_delivery_date": record.proposed_delivery_date,
        "draft_terms_version": record.draft_terms_version,
        "status": effective_status(record),
        "snapshot": record.snapshot,
        "issued_at": record.issued_at,
        "expires_at": record.expires_at,
        "decided_at": record.decided_at,
        "decision_name": record.decision_name,
        "decision_email": record.decision_email,
        "decision_reason": record.decision_reason,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


def event(
    db: Session, record: ChangeRequest, action: str, actor: str, email: str | None = None
) -> None:
    db.add(RequestEvent(request_id=record.id, action=action, actor=actor, actor_email=email))


def expire_locked(db: Session, record: ChangeRequest) -> bool:
    if record.status == "pending" and record.expires_at and record.expires_at <= utcnow():
        record.status = "expired"
        event(db, record, "expired", "system")
        db.flush()
        return True
    return False


def revoke_review(db: Session, record: ChangeRequest) -> None:
    db.execute(
        update(ReviewSession)
        .where(ReviewSession.request_id == record.id, ReviewSession.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    challenge = db.get(EmailChallenge, record.id)
    if challenge:
        challenge.consumed_at = utcnow()


@router.get("/api/projects/{project_id}/requests")
def list_requests(
    project_id: uuid.UUID,
    current: Current,
    db: Db,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=1000000)] = 0,
):
    agency_id = agency_for(db, current[0].id)
    owned(db, Project, project_id, agency_id)
    query = select(ChangeRequest).where(
        ChangeRequest.project_id == project_id, ChangeRequest.agency_id == agency_id
    )
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    records = db.scalars(
        query.order_by(ChangeRequest.created_at.desc(), ChangeRequest.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return {"items": [output(record) for record in records], "total": total}


@router.post("/api/projects/{project_id}/requests", status_code=201)
def create_request(project_id: uuid.UUID, payload: RequestInput, current: WriteCurrent, db: Db):
    agency_id = agency_for(db, current[0].id)
    project = locked_project(db, project_id, agency_id)
    record = ChangeRequest(
        agency_id=agency_id,
        project_id=project.id,
        draft_terms_version=project.terms_version,
        **payload.model_dump(),
    )
    db.add(record)
    db.flush()
    event(db, record, "draft_created", "owner", current[0].email)
    commit(db)
    return output(record)


@router.get("/api/requests/{record_id}")
def request_detail(record_id: uuid.UUID, current: Current, db: Db):
    record = owned(db, ChangeRequest, record_id, agency_for(db, current[0].id))
    return output(record)


@router.get("/api/requests/{record_id}/events")
def request_events(
    record_id: uuid.UUID,
    current: Current,
    db: Db,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    offset: Annotated[int, Query(ge=0, le=1000000)] = 0,
):
    owned(db, ChangeRequest, record_id, agency_for(db, current[0].id))
    query = select(RequestEvent).where(RequestEvent.request_id == record_id)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    events = db.scalars(
        query.order_by(RequestEvent.occurred_at, RequestEvent.id).limit(limit).offset(offset)
    ).all()
    return {
        "items": [
            {
                "id": item.id,
                "action": item.action,
                "actor": item.actor,
                "actor_email": item.actor_email,
                "occurred_at": item.occurred_at,
            }
            for item in events
        ],
        "total": total,
    }


@router.put("/api/requests/{record_id}")
def update_request(record_id: uuid.UUID, payload: RequestInput, current: WriteCurrent, db: Db):
    project, record = locked_request(db, record_id, agency_for(db, current[0].id))
    if record.status != "draft":
        raise HTTPException(409, "Issued requests cannot be edited")
    for key, value in payload.model_dump().items():
        setattr(record, key, value)
    record.draft_terms_version = project.terms_version
    event(db, record, "draft_updated", "owner", current[0].email)
    commit(db)
    return output(record)


@router.delete("/api/requests/{record_id}", status_code=204)
def delete_request(record_id: uuid.UUID, current: WriteCurrent, db: Db):
    _, record = locked_request(db, record_id, agency_for(db, current[0].id))
    if record.status != "draft":
        raise HTTPException(409, "Issued requests cannot be deleted")
    db.query(RequestEvent).filter(RequestEvent.request_id == record.id).delete()
    db.delete(record)
    commit(db)
    return Response(status_code=204)


@router.get("/api/requests/{record_id}/preview")
def preview_request(record_id: uuid.UUID, current: Current, db: Db):
    agency_id = agency_for(db, current[0].id)
    record = owned(db, ChangeRequest, record_id, agency_id)
    project = owned(db, Project, record.project_id, agency_id)
    if record.status != "draft":
        raise HTTPException(409, "Only drafts can be previewed")
    client = owned(db, Client, project.client_id, agency_id)
    total = project.current_price_minor + record.additional_price_minor
    return {
        "request": output(record),
        "project_title": project.title,
        "client_name": client.name,
        "recipient_email": client.email,
        "currency": project.currency,
        "original_price_minor": project.original_price_minor,
        "current_price_minor": project.current_price_minor,
        "new_total_minor": total,
        "original_delivery_date": project.delivery_date,
        "current_delivery_date": project.current_delivery_date,
        "stale": record.draft_terms_version != project.terms_version,
        "amount_valid": total <= MAX_MONEY,
    }


@router.post("/api/requests/{record_id}/issue")
def issue_request(record_id: uuid.UUID, current: WriteCurrent, db: Db):
    agency_id = agency_for(db, current[0].id)
    project, record = locked_request(db, record_id, agency_id)
    if record.status != "draft":
        raise HTTPException(409, "Only drafts can be issued")
    pending = db.scalars(
        select(ChangeRequest)
        .where(ChangeRequest.project_id == project.id, ChangeRequest.status == "pending")
        .with_for_update()
    ).all()
    for old in pending:
        expire_locked(db, old)
    if any(old.status == "pending" for old in pending):
        raise HTTPException(409, "This project already has a pending request")
    if record.draft_terms_version != project.terms_version:
        raise HTTPException(409, "Project terms changed. Edit and preview the draft again")
    total = project.current_price_minor + record.additional_price_minor
    if total > MAX_MONEY:
        raise HTTPException(409, "New total exceeds the supported maximum")
    agency = db.get(Agency, agency_id)
    client = owned(db, Client, project.client_id, agency_id)
    now = utcnow()
    record.snapshot = {
        "agency_name": agency.name,
        "agency_contact_name": agency.contact_name,
        "agency_contact_email": agency.contact_email,
        "client_name": client.name,
        "client_company": client.company,
        "approver_email": client.email,
        "project_title": project.title,
        "baseline_deliverables": project.baseline_deliverables,
        "exclusions": project.exclusions,
        "currency": project.currency,
        "original_price_minor": project.original_price_minor,
        "original_delivery_date": project.delivery_date.isoformat(),
        "previously_approved_minor": project.current_price_minor - project.original_price_minor,
        "old_total_minor": project.current_price_minor,
        "old_deadline": project.current_delivery_date.isoformat(),
        "description": record.description,
        "reason": record.reason,
        "extra_deliverables": record.extra_deliverables,
        "additional_price_minor": record.additional_price_minor,
        "new_total_minor": total,
        "new_deadline": record.proposed_delivery_date.isoformat(),
    }
    record.status = "pending"
    record.issued_at = now
    record.expires_at = now + timedelta(days=14)
    if project.first_issued_at is None:
        project.first_issued_at = now
    raw = random_token()
    db.add(ReviewAccessToken(request_id=record.id, token_hash=digest(raw)))
    event(db, record, "issued", "owner", current[0].email)
    commit(db)
    return {"request": output(record), "review_link": f"{settings.app_origin}/review#token={raw}"}


@router.post("/api/requests/{record_id}/withdraw")
def withdraw_request(record_id: uuid.UUID, current: WriteCurrent, db: Db):
    _, record = locked_request(db, record_id, agency_for(db, current[0].id))
    if expire_locked(db, record):
        commit(db)
        raise HTTPException(409, "Request expired")
    if record.status != "pending":
        raise HTTPException(409, "Only pending requests can be withdrawn")
    record.status = "withdrawn"
    revoke_review(db, record)
    event(db, record, "withdrawn", "owner", current[0].email)
    commit(db)
    return output(record)


@router.post("/api/requests/{record_id}/duplicate", status_code=201)
def duplicate_request(record_id: uuid.UUID, current: WriteCurrent, db: Db):
    project, record = locked_request(db, record_id, agency_for(db, current[0].id))
    if record.status == "draft":
        raise HTTPException(409, "Edit this draft instead")
    duplicate = ChangeRequest(
        agency_id=record.agency_id,
        project_id=record.project_id,
        linked_from_id=record.id,
        draft_terms_version=project.terms_version,
        **RequestInput.from_record(record).model_dump(),
    )
    db.add(duplicate)
    db.flush()
    event(db, duplicate, "draft_created", "owner", current[0].email)
    commit(db)
    return output(duplicate)


@router.post("/api/requests/{record_id}/rotate-link")
def rotate_link(record_id: uuid.UUID, current: WriteCurrent, db: Db):
    _, record = locked_request(db, record_id, agency_for(db, current[0].id))
    if expire_locked(db, record):
        commit(db)
        raise HTTPException(409, "Request expired")
    if record.status != "pending":
        raise HTTPException(409, "Only pending requests have review links")
    raw = random_token()
    access = db.get(ReviewAccessToken, record.id)
    access.token_hash = digest(raw)
    access.rotated_at = utcnow()
    revoke_review(db, record)
    event(db, record, "link_rotated", "owner", current[0].email)
    commit(db)
    return {"review_link": f"{settings.app_origin}/review#token={raw}"}
