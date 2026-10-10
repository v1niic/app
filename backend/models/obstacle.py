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
    # pendente = enviado, aguardando análise · ativo = aprovado, aparece no mapa/radar
    # recusado = não aprovado (com motivo) · resolvido = problema já corrigido
    status: str = "ativo"
    confirms: int = 0
    created_at: datetime
    reject_reason: str = ""
    reviewed_at: datetime | None = None


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


class ReviewEdit(BaseModel):
    """Ajustes opcionais do gestor antes de aprovar (o que não vier fica como o usuário enviou)."""

    type: ObstacleType | None = None
    severity: Severity | None = None
    description: str | None = Field(default=None, min_length=3, max_length=280)


class ReviewReject(BaseModel):
    reason: str = Field(default="", max_length=200)


class ModerationItem(Obstacle):
    # ajuda a achar duplicados: quantos alertas ATIVOS do mesmo tipo existem até 60 m e o mais próximo
    nearby_same_type: int = 0
    nearest_same_type_m: float | None = None


class ModerationSummary(BaseModel):
    pendente: int = 0
    recusado: int = 0
    ativo: int = 0
