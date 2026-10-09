from datetime import datetime

from pydantic import BaseModel, Field

from models.user import User


class BadgeDef(BaseModel):
    id: str
    name: str
    desc: str
    tier: str
    icon: str


class MissionProgress(BaseModel):
    id: str
    title: str
    desc: str
    target: float
    metric: str
    reward_xp: int
    badge_id: str
    progress: float
    completed: bool


class LeaderboardEntry(BaseModel):
    rank: int
    name: str
    level: int
    xp: int
    reports_count: int
    badge_count: int


class StatsPublic(BaseModel):
    bikelanes: int
    obstacles_ativos: int
    reports_total: int
    ciclistas: int


class RideCreate(BaseModel):
    km: float = Field(gt=0, le=300)


class RideResult(BaseModel):
    user: User
    new_badges: list[BadgeDef] = Field(default_factory=list)


class RideEntry(BaseModel):
    id: str
    km: float
    xp: int
    created_at: datetime
