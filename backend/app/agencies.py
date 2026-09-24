import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import Current, WriteCurrent
from app.db import get_db
from app.models import Agency

router = APIRouter(prefix="/api/agencies", tags=["agencies"])
Db = Annotated[Session, Depends(get_db)]


class AgencyInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    contact_name: str = Field(min_length=2, max_length=120)
    contact_email: EmailStr


def detail(agency: Agency) -> dict:
    return {
        "id": str(agency.id),
        "name": agency.name,
        "contact_name": agency.contact_name,
        "contact_email": agency.contact_email,
    }


def owned(db: Session, agency_id: uuid.UUID, owner_id: uuid.UUID) -> Agency:
    agency = db.execute(
        select(Agency).where(Agency.id == agency_id, Agency.owner_id == owner_id)
    ).scalar_one_or_none()
    if not agency:
        raise HTTPException(404, "Agency not found")
    return agency


@router.get("/me")
def my_agency(current: Current, db: Db):
    agency = db.execute(select(Agency).where(Agency.owner_id == current[0].id)).scalar_one_or_none()
    return detail(agency) if agency else None


@router.post("", status_code=201)
def create(payload: AgencyInput, current: WriteCurrent, db: Db):
    agency = Agency(owner_id=current[0].id, **payload.model_dump())
    db.add(agency)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "You already have an agency") from exc
    return detail(agency)


@router.get("/{agency_id}")
def get_agency(agency_id: uuid.UUID, current: Current, db: Db):
    return detail(owned(db, agency_id, current[0].id))


@router.put("/{agency_id}")
def update_agency(agency_id: uuid.UUID, payload: AgencyInput, current: WriteCurrent, db: Db):
    agency = owned(db, agency_id, current[0].id)
    for key, value in payload.model_dump().items():
        setattr(agency, key, value)
    db.commit()
    return detail(agency)
