import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import func, select

from app.auth import Current, WriteCurrent
from app.models import Client, Project
from app.records import Db, agency_for, commit, owned
from app.schemas import Page, ProjectInput, ProjectOutput

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=Page[ProjectOutput])
def list_records(
    current: Current,
    db: Db,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=1000000)] = 0,
    client_id: uuid.UUID | None = None,
) -> dict:
    agency_id = agency_for(db, current[0].id)
    query = select(Project).where(Project.agency_id == agency_id)
    if client_id is not None:
        owned(db, Client, client_id, agency_id)
        query = query.where(Project.client_id == client_id)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = db.scalars(
        query.order_by(Project.created_at.desc(), Project.id.desc()).limit(limit).offset(offset)
    ).all()
    return {"items": items, "total": total}


@router.post("", status_code=201, response_model=ProjectOutput)
def create(payload: ProjectInput, current: WriteCurrent, db: Db) -> Project:
    agency_id = agency_for(db, current[0].id)
    owned(db, Client, payload.client_id, agency_id)
    record = Project(
        agency_id=agency_id,
        **payload.model_dump(),
        current_price_minor=payload.original_price_minor,
        current_delivery_date=payload.delivery_date,
    )
    db.add(record)
    commit(db)
    return record


@router.get("/{record_id}", response_model=ProjectOutput)
def detail(record_id: uuid.UUID, current: Current, db: Db) -> Project:
    return owned(db, Project, record_id, agency_for(db, current[0].id))


@router.put("/{record_id}", response_model=ProjectOutput)
def update(record_id: uuid.UUID, payload: ProjectInput, current: WriteCurrent, db: Db) -> Project:
    agency_id = agency_for(db, current[0].id)
    record = db.scalar(
        select(Project)
        .where(Project.id == record_id, Project.agency_id == agency_id)
        .with_for_update()
    )
    if record is None:
        raise HTTPException(404, "Project not found")
    owned(db, Client, payload.client_id, agency_id)
    locked_fields = (
        "client_id",
        "baseline_deliverables",
        "exclusions",
        "original_price_minor",
        "currency",
        "delivery_date",
    )
    if record.first_issued_at and any(
        getattr(record, field) != getattr(payload, field) for field in locked_fields
    ):
        raise HTTPException(
            409, "Project baseline and client are locked after the first request is issued"
        )
    if not record.first_issued_at and any(
        getattr(record, field) != getattr(payload, field) for field in locked_fields
    ):
        record.current_price_minor = payload.original_price_minor
        record.current_delivery_date = payload.delivery_date
        record.terms_version += 1
    for key, value in payload.model_dump().items():
        setattr(record, key, value)
    commit(db)
    return record


@router.delete("/{record_id}", status_code=204)
def remove(record_id: uuid.UUID, current: WriteCurrent, db: Db) -> Response:
    record = owned(db, Project, record_id, agency_for(db, current[0].id))
    db.delete(record)
    commit(db, "The project changed. Refresh and retry.")
    return Response(status_code=204)
