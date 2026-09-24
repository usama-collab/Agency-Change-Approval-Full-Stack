import smtplib
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.mail import send_mail
from app.models import EmailToken, OwnerSession, User, utcnow
from app.security import (
    digest,
    equal,
    limit,
    password_hash,
    random_token,
    require_origin,
    require_prelogin_csrf,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
Db = Annotated[Session, Depends(get_db)]


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class EmailInput(BaseModel):
    email: EmailStr


class TokenInput(BaseModel):
    token: str = Field(min_length=30, max_length=256)


class ResetInput(TokenInput):
    password: str = Field(min_length=12, max_length=128)


def normalized(email: str) -> str:
    return email.strip().lower()


def issue_email_token(db: Session, user: User, purpose: str) -> str:
    # Serialize resends for one owner so only the newest link stays usable.
    db.execute(select(User.id).where(User.id == user.id).with_for_update()).scalar_one()
    now = utcnow()
    db.execute(
        update(EmailToken)
        .where(
            EmailToken.user_id == user.id,
            EmailToken.purpose == purpose,
            EmailToken.consumed_at.is_(None),
        )
        .values(consumed_at=now)
    )
    raw = random_token()
    db.add(
        EmailToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=digest(raw),
            expires_at=now + timedelta(minutes=30 if purpose == "verify" else 15),
        )
    )
    db.commit()
    return raw


def deliver(user: User, purpose: str, token: str) -> None:
    path = "verify" if purpose == "verify" else "reset"
    link = f"{settings.app_origin}/{path}?token={token}"
    try:
        send_mail(
            user.email,
            "Verify your email" if purpose == "verify" else "Reset your password",
            (
                f"Open this link to {path} your owner account:\n{link}\n\n"
                "This link expires soon and works once."
            ),
        )
    except (OSError, smtplib.SMTPException) as exc:
        raise HTTPException(
            503, "Email unavailable. Please retry sending the link shortly"
        ) from exc


def consume(db: Session, raw: str, purpose: str) -> User:
    token_hash = digest(raw)
    user_id = db.execute(
        select(EmailToken.user_id).where(
            EmailToken.token_hash == token_hash, EmailToken.purpose == purpose
        )
    ).scalar_one_or_none()
    if not user_id:
        raise HTTPException(400, "Invalid or expired link")
    user = db.execute(select(User).where(User.id == user_id).with_for_update()).scalar_one_or_none()
    if not user:
        raise HTTPException(400, "Invalid or expired link")
    token = db.execute(
        select(EmailToken)
        .where(EmailToken.token_hash == token_hash, EmailToken.purpose == purpose)
        .with_for_update()
    ).scalar_one_or_none()
    if not token or token.consumed_at or token.expires_at <= utcnow():
        raise HTTPException(400, "Invalid or expired link")
    token.consumed_at = utcnow()
    return user


def current_session(request: Request, db: Db) -> tuple[User, OwnerSession]:
    raw = request.cookies.get("session", "")
    if not raw:
        raise HTTPException(401, "Sign in required")
    session = db.execute(
        select(OwnerSession).where(OwnerSession.token_hash == digest(raw))
    ).scalar_one_or_none()
    if not session or session.revoked_at or session.expires_at <= utcnow():
        raise HTTPException(401, "Sign in required")
    user = db.get(User, session.user_id)
    if not user or not user.is_verified:
        raise HTTPException(401, "Sign in required")
    return user, session


Current = Annotated[tuple[User, OwnerSession], Depends(current_session)]


def require_session_csrf(request: Request, current: Current) -> tuple[User, OwnerSession]:
    require_origin(request)
    csrf = request.headers.get("x-csrf-token", "")
    if not csrf or not equal(digest(csrf), current[1].csrf_hash):
        raise HTTPException(403, "Invalid CSRF token")
    return current


WriteCurrent = Annotated[tuple[User, OwnerSession], Depends(require_session_csrf)]


@router.get("/csrf")
def csrf(response: Response):
    raw = random_token()
    response.set_cookie(
        "pre_csrf",
        raw,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/api",
        max_age=3600,
    )
    return {"csrf_token": raw}


@router.post("/register", status_code=201)
def register(payload: Credentials, request: Request, db: Db):
    require_prelogin_csrf(request)
    email = normalized(payload.email)
    limit(db, request, "register", email)
    user = User(email=email, password_hash=password_hash.hash(payload.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Account already exists") from exc
    deliver(user, "verify", issue_email_token(db, user, "verify"))
    return {"message": "Check your email for the verification link"}


@router.post("/resend-verification")
def resend(payload: EmailInput, request: Request, db: Db):
    require_prelogin_csrf(request)
    email = normalized(payload.email)
    limit(db, request, "resend", email)
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user and not user.is_verified:
        deliver(user, "verify", issue_email_token(db, user, "verify"))
    return {"message": "If this account needs verification, a link was sent"}


@router.post("/verify")
def verify(payload: TokenInput, request: Request, db: Db):
    require_prelogin_csrf(request)
    limit(db, request, "verify")
    user = consume(db, payload.token, "verify")
    user.is_verified = True
    db.commit()
    return {"message": "Email verified. You can sign in"}


@router.post("/login")
def login(payload: Credentials, request: Request, response: Response, db: Db):
    require_prelogin_csrf(request)
    email = normalized(payload.email)
    limit(db, request, "login", email)
    user = db.execute(
        select(User).where(User.email == email).with_for_update()
    ).scalar_one_or_none()
    valid = password_hash.verify(payload.password, user.password_hash) if user else False
    if not user or not valid:
        raise HTTPException(401, "Invalid credentials")
    if not user.is_verified:
        raise HTTPException(403, "Verify your email before signing in")
    raw, csrf_raw = random_token(), random_token()
    db.add(
        OwnerSession(
            user_id=user.id,
            token_hash=digest(raw),
            csrf_hash=digest(csrf_raw),
            expires_at=utcnow() + timedelta(days=7),
        )
    )
    db.commit()
    response.set_cookie(
        "session",
        raw,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/api",
        max_age=7 * 86400,
    )
    response.set_cookie(
        "csrf",
        csrf_raw,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
        max_age=7 * 86400,
    )
    response.delete_cookie("pre_csrf", path="/api")
    return {"csrf_token": csrf_raw, "email": user.email}


@router.get("/me")
def me(current: Current):
    return {"id": str(current[0].id), "email": current[0].email, "verified": current[0].is_verified}


@router.post("/logout")
def logout(current: WriteCurrent, response: Response, db: Db):
    current[1].revoked_at = utcnow()
    db.commit()
    response.delete_cookie("session", path="/api")
    response.delete_cookie("csrf", path="/")
    return {"message": "Signed out"}


@router.post("/forgot-password")
def forgot(payload: EmailInput, request: Request, db: Db):
    require_prelogin_csrf(request)
    email = normalized(payload.email)
    limit(db, request, "forgot", email)
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user and user.is_verified:
        deliver(user, "reset", issue_email_token(db, user, "reset"))
    return {"message": "If the account exists, a reset link was sent"}


@router.post("/reset-password")
def reset(payload: ResetInput, request: Request, response: Response, db: Db):
    require_prelogin_csrf(request)
    limit(db, request, "reset")
    user = consume(db, payload.token, "reset")
    user.password_hash = password_hash.hash(payload.password)
    db.execute(
        update(OwnerSession)
        .where(OwnerSession.user_id == user.id, OwnerSession.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    db.commit()
    response.delete_cookie("session", path="/api")
    response.delete_cookie("csrf", path="/")
    return {"message": "Password changed. Sign in again"}
