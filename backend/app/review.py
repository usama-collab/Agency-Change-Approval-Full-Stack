"""Mailbox-gated client review and final decisions."""

import secrets
import smtplib
from datetime import timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.mail import send_mail
from app.models import (
    ChangeRequest,
    EmailChallenge,
    ReviewAccessToken,
    ReviewSession,
    utcnow,
)
from app.requests import effective_status, event, expire_locked, locked_project
from app.security import (
    digest,
    equal,
    limit,
    password_hash,
    random_token,
    require_origin,
    require_prelogin_csrf,
)

router = APIRouter(prefix="/api/review", tags=["review"])
Db = Annotated[Session, Depends(get_db)]


class LinkInput(BaseModel):
    token: str = Field(min_length=30, max_length=256)


class CodeInput(LinkInput):
    code: str = Field(pattern=r"^[0-9]{6}$")


class DecisionInput(BaseModel):
    decision: Literal["approved", "rejected"]
    name: str = Field(min_length=1, max_length=120)
    agreement: bool = False
    reason: str | None = Field(default=None, max_length=1000)


def masked(email: str) -> str:
    local, domain = email.rsplit("@", 1)
    return f"{local[0]}***@{domain[0]}***"


def by_token(db: Session, raw: str) -> ChangeRequest:
    access = db.scalar(select(ReviewAccessToken).where(ReviewAccessToken.token_hash == digest(raw)))
    if access is None:
        raise HTTPException(404, "Review link is invalid")
    record = db.get(ChangeRequest, access.request_id)
    if record is None:
        raise HTTPException(404, "Review link is invalid")
    return record


def locked_by_token(db: Session, raw: str) -> ChangeRequest:
    reference = by_token(db, raw)
    locked_project(db, reference.project_id, reference.agency_id)
    record = db.scalar(
        select(ChangeRequest)
        .where(ChangeRequest.id == reference.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    # Rotation is serialized under the same project lock.
    access = db.scalar(
        select(ReviewAccessToken)
        .where(ReviewAccessToken.request_id == reference.id)
        .execution_options(populate_existing=True)
    )
    if access is None or access.token_hash != digest(raw):
        raise HTTPException(404, "Review link is invalid")
    return record


def review_session(request: Request, db: Db) -> tuple[ChangeRequest, ReviewSession]:
    raw = request.cookies.get("review_session", "")
    session = (
        db.scalar(select(ReviewSession).where(ReviewSession.token_hash == digest(raw)))
        if raw
        else None
    )
    if session is None or session.revoked_at or session.expires_at <= utcnow():
        raise HTTPException(401, "Verify your email to review this request")
    record = db.get(ChangeRequest, session.request_id)
    if record is None or record.snapshot["approver_email"] != session.email:
        raise HTTPException(401, "Verify your email to review this request")
    return record, session


CurrentReview = Annotated[tuple[ChangeRequest, ReviewSession], Depends(review_session)]


def write_review(request: Request, current: CurrentReview) -> tuple[ChangeRequest, ReviewSession]:
    require_origin(request)
    csrf = request.headers.get("x-csrf-token", "")
    if not csrf or not equal(digest(csrf), current[1].csrf_hash):
        raise HTTPException(403, "Invalid CSRF token")
    return current


WriteReview = Annotated[tuple[ChangeRequest, ReviewSession], Depends(write_review)]


@router.post("/access")
def access(payload: LinkInput, request: Request, db: Db):
    require_prelogin_csrf(request)
    record = by_token(db, payload.token)
    return {
        "request_id": record.id,
        "status": effective_status(record),
        "masked_email": masked(record.snapshot["approver_email"]),
        "expires_at": record.expires_at,
    }


@router.post("/code")
def send_code(payload: LinkInput, request: Request, db: Db):
    require_prelogin_csrf(request)
    reference = by_token(db, payload.token)
    limit(db, request, f"review-code:{reference.id}", str(reference.id))
    record = locked_by_token(db, payload.token)
    if expire_locked(db, record):
        db.commit()
        raise HTTPException(409, "Request expired")
    if record.status != "pending":
        raise HTTPException(409, "Request is no longer awaiting a decision")
    challenge = db.get(EmailChallenge, record.id)
    now = utcnow()
    if challenge and challenge.sent_at > now - timedelta(seconds=60):
        raise HTTPException(429, "Wait 60 seconds before requesting another code")
    code = f"{secrets.randbelow(1000000):06d}"
    if challenge is None:
        challenge = EmailChallenge(
            request_id=record.id, code_hash="", failed_attempts=0, sent_at=now, expires_at=now
        )
        db.add(challenge)
    hashed_code = password_hash.hash(code)
    challenge.code_hash = hashed_code
    challenge.failed_attempts = 0
    challenge.sent_at = now
    challenge.expires_at = min(now + timedelta(minutes=10), record.expires_at)
    challenge.consumed_at = None
    db.commit()
    try:
        send_mail(
            record.snapshot["approver_email"],
            "Your change request verification code",
            f"Your verification code is {code}. It expires in 10 minutes.\n",
        )
    except (OSError, smtplib.SMTPException) as exc:
        # Permit an immediate retry when SMTP did not accept the message.
        db.refresh(challenge)
        if challenge.code_hash == hashed_code:
            challenge.consumed_at = utcnow()
            challenge.sent_at = utcnow() - timedelta(seconds=61)
        db.commit()
        raise HTTPException(503, "Email unavailable. Please request another code shortly") from exc
    return {"message": "A verification code was sent"}


@router.post("/verify")
def verify_code(payload: CodeInput, request: Request, response: Response, db: Db):
    require_prelogin_csrf(request)
    reference = by_token(db, payload.token)
    limit(db, request, f"review-verify:{reference.id}", str(reference.id))
    record = locked_by_token(db, payload.token)
    if expire_locked(db, record):
        db.commit()
        raise HTTPException(409, "Request expired")
    if record.status != "pending":
        raise HTTPException(409, "Request is no longer awaiting a decision")
    challenge = db.get(EmailChallenge, record.id)
    if (
        challenge is None
        or challenge.consumed_at
        or challenge.expires_at <= utcnow()
        or challenge.failed_attempts >= 5
    ):
        raise HTTPException(400, "Code is invalid or expired")
    if not password_hash.verify(payload.code, challenge.code_hash):
        challenge.failed_attempts += 1
        if challenge.failed_attempts >= 5:
            challenge.consumed_at = utcnow()
        db.commit()
        raise HTTPException(400, "Code is invalid or expired")
    challenge.consumed_at = utcnow()
    raw, csrf_raw = random_token(), random_token()
    expires_at = min(utcnow() + timedelta(minutes=30), record.expires_at)
    db.add(
        ReviewSession(
            request_id=record.id,
            token_hash=digest(raw),
            csrf_hash=digest(csrf_raw),
            email=record.snapshot["approver_email"],
            expires_at=expires_at,
        )
    )
    db.commit()
    response.set_cookie(
        "review_session",
        raw,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/api/review",
        max_age=1800,
    )
    response.set_cookie(
        "review_csrf",
        csrf_raw,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
        max_age=1800,
    )
    return {"message": "Email verified"}


@router.get("/proposal")
def proposal(current: CurrentReview):
    record = current[0]
    return {
        "id": record.id,
        "status": effective_status(record),
        "snapshot": record.snapshot,
        "issued_at": record.issued_at,
        "expires_at": record.expires_at,
        "decided_at": record.decided_at,
        "decision_name": record.decision_name,
        "decision_email": record.decision_email,
        "decision_reason": record.decision_reason,
    }


@router.post("/decision")
def decide(payload: DecisionInput, current: WriteReview, db: Db):
    reference, session = current
    project = locked_project(db, reference.project_id, reference.agency_id)
    db.refresh(session)
    if session.revoked_at or session.expires_at <= utcnow():
        raise HTTPException(401, "Verify your email to review this request")
    record = db.scalar(
        select(ChangeRequest)
        .where(ChangeRequest.id == reference.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    name = payload.name.strip()
    reason = payload.reason.strip() if payload.reason else None
    if not name:
        raise HTTPException(422, "Name is required")
    if payload.decision == "approved" and not payload.agreement:
        raise HTTPException(422, "Explicit agreement is required")
    if record.status in ("approved", "rejected"):
        if (
            record.status == payload.decision
            and record.decision_name == name
            and record.decision_reason == reason
            and record.decision_email == session.email
        ):
            return proposal((record, session))
        raise HTTPException(409, "A different decision has already been recorded")
    if expire_locked(db, record):
        db.commit()
        raise HTTPException(409, "Request expired")
    if record.status != "pending":
        raise HTTPException(409, "Request is no longer awaiting a decision")
    if payload.decision == "approved":
        if (
            project.current_price_minor != record.snapshot["old_total_minor"]
            or project.current_delivery_date.isoformat() != record.snapshot["old_deadline"]
        ):
            raise HTTPException(409, "Project terms changed. Contact the agency")
        project.current_price_minor = record.snapshot["new_total_minor"]
        project.current_delivery_date = record.proposed_delivery_date
        project.terms_version += 1
    record.status = payload.decision
    record.decided_at = utcnow()
    record.decision_name = name
    record.decision_email = session.email
    record.decision_reason = reason
    event(db, record, payload.decision, "client", session.email)
    db.commit()
    return proposal((record, session))
