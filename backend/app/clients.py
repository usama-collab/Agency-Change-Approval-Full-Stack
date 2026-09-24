import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Response
from sqlalchemy import func, select

from app.auth import Current, WriteCurrent
from app.models import Client
from app.records import Db, agency_for, commit, owned
from app.schemas import ClientInput, ClientOutput, Page

router = APIRouter(prefix="/api/clients", tags=["clients"])


@router.get("", response_model=Page[ClientOutput])
def list_records(
    current: Current,
    db: Db,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0, le=1000000)] = 0,
) -> dict:
    agency_id = agency_for(db, current[0].id)
    query = select(Client).where(Client.agency_id == agency_id)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = db.scalars(
        query.order_by(Client.created_at.desc(), Client.id.desc()).limit(limit).offset(offset)
    ).all()
    return {"items": items, "total": total}


@router.post("", status_code=201, response_model=ClientOutput)
def create(payload: ClientInput, current: WriteCurrent, db: Db) -> Client:
    agency_id = agency_for(db, current[0].id)
    record = Client(agency_id=agency_id, **payload.model_dump())
    db.add(record)
    commit(db)
    return record


@router.get("/{record_id}", response_model=ClientOutput)
def detail(record_id: uuid.UUID, current: Current, db: Db) -> Client:
    return owned(db, Client, record_id, agency_for(db, current[0].id))


@router.put("/{record_id}", response_model=ClientOutput)
def update(record_id: uuid.UUID, payload: ClientInput, current: WriteCurrent, db: Db) -> Client:
    agency_id = agency_for(db, current[0].id)
    record = owned(db, Client, record_id, agency_id)
    for key, value in payload.model_dump().items():
        setattr(record, key, value)
    commit(db)
    return record


@router.delete("/{record_id}", status_code=204)
def remove(record_id: uuid.UUID, current: WriteCurrent, db: Db) -> Response:
    record = owned(db, Client, record_id, agency_for(db, current[0].id))
    db.delete(record)
    commit(db, "Delete this client’s projects before deleting the client.")
    return Response(status_code=204)
