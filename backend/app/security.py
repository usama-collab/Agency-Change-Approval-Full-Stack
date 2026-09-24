import hashlib
import hmac
import secrets
from datetime import timedelta

from fastapi import HTTPException, Request
from pwdlib import PasswordHash
from sqlalchemy import case
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import settings
from app.models import RateLimit, utcnow

password_hash = PasswordHash.recommended()


def random_token() -> str:
    return secrets.token_urlsafe(32)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def equal(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)


def require_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin != settings.app_origin:
        raise HTTPException(403, "Invalid origin")


def require_prelogin_csrf(request: Request) -> None:
    require_origin(request)
    cookie = request.cookies.get("pre_csrf", "")
    header = request.headers.get("x-csrf-token", "")
    if not cookie or not header or not equal(cookie, header):
        raise HTTPException(403, "Invalid CSRF token")


def limit(db: Session, request: Request, action: str, email: str = "") -> None:
    # Both source and account buckets are enforced. Never trust client-supplied IP headers.
    source = request.client.host if request.client else "unknown"
    now = utcnow()
    identities = [(f"ip:{source}", 30)]
    if email:
        identities.append((f"email:{email}", 10))
    for identity, maximum in identities:
        key = digest(f"{action}:{identity}")
        stmt = insert(RateLimit).values(key=key, window_start=now, count=1)
        expired = RateLimit.window_start < now - timedelta(minutes=15)
        stmt = stmt.on_conflict_do_update(
            index_elements=[RateLimit.key],
            set_={
                "window_start": case((expired, now), else_=RateLimit.window_start),
                "count": case((expired, 1), else_=RateLimit.count + 1),
            },
        ).returning(RateLimit.window_start, RateLimit.count)
        _, count = db.execute(stmt).one()
        if count > maximum:
            db.commit()
            raise HTTPException(429, "Too many attempts. Try again later")
    db.commit()
