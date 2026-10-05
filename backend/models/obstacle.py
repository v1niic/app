from datetime import datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field

from models.game import BadgeDef
from models.user import User

ObstacleType = Literal["buraco", "obra", "trecho_inacabado", "falta_iluminacao", "outros"]
Severity = Literal["baixa", "media", "alta"]


class Obstacle(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    user_id: str
    user_name: str
    type: ObstacleType
    severity: Severity
    description: str
    lat: float
    lng: float
    status: str = "ativo"
    confirms: int = 0
    created_at: datetime


class ObstacleCreate(BaseModel):
    type: ObstacleType
    severity: Severity
    description: str = Field(min_length=3, max_length=280)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class ReportResult(BaseModel):
    obstacle: Obstacle
    user: User
    new_badges: list[BadgeDef] = Field(default_factory=list)
