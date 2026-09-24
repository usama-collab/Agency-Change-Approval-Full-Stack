"""Shared tenant lookup and transaction handling for owner records."""

import uuid
from typing import Annotated, TypeVar

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Agency, Client, Project

Db = Annotated[Session, Depends(get_db)]
Record = TypeVar("Record", Client, Project)


def agency_for(db: Session, owner_id: uuid.UUID) -> uuid.UUID:
    agency_id = db.scalar(select(Agency.id).where(Agency.owner_id == owner_id))
    if agency_id is None:
        raise HTTPException(409, "Set up your agency first")
    return agency_id


def owned(db: Session, model: type[Record], record_id: uuid.UUID, agency_id: uuid.UUID) -> Record:
    record = db.scalar(select(model).where(model.id == record_id, model.agency_id == agency_id))
    if record is None:
        raise HTTPException(404, f"{model.__name__} not found")
    return record


def commit(db: Session, message: str = "The linked record changed. Refresh and retry.") -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, message) from exc
