from datetime import datetime
from uuid import uuid4

from pydantic import BaseModel, EmailStr, Field


def _uuid() -> str:
    return str(uuid4())


class User(BaseModel):
    id: str = Field(default_factory=_uuid)
    name: str
    email: EmailStr
    bio: str = ""
    bike_type: str = "urbana"
    city: str = "Fortaleza"
    xp: int = 0
    level: int = 1
    total_km: float = 0.0
    reports_count: int = 0
    confirms_count: int = 0
    badge_ids: list[str] = Field(default_factory=list)
    created_at: datetime


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    email: EmailStr
    password: str = Field(min_length=6, max_length=100)
    bike_type: str = "urbana"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdate(BaseModel):
    name: str | None = None
    bio: str | None = None
    bike_type: str | None = None
