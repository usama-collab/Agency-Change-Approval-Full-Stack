import re
import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Work = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class ClientInput(BaseModel):
    name: Name
    company: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None
    email: EmailStr


class ProjectInput(BaseModel):
    client_id: uuid.UUID
    title: Name
    baseline_deliverables: Work
    exclusions: str | None = None
    original_price_minor: Annotated[int, Field(strict=True, ge=0, le=9007199254740991)]
    currency: Literal["PKR", "USD", "GBP", "EUR"]
    delivery_date: date

    @field_validator("delivery_date", mode="before")
    @classmethod
    def date_text(cls, value: object) -> object:
        if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ValueError("Use YYYY-MM-DD")
        return value


class RecordOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    agency_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class ClientOutput(ClientInput, RecordOutput):
    pass


class ProjectOutput(RecordOutput):
    client_id: uuid.UUID
    title: str
    baseline_deliverables: str
    exclusions: str | None
    original_price_minor: int
    currency: str
    delivery_date: date
    current_price_minor: int
    current_delivery_date: date
    terms_version: int
    first_issued_at: datetime | None


class Page[T](BaseModel):
    items: list[T]
    total: int
