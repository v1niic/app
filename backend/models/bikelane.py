from typing import Literal

from pydantic import BaseModel, Field


class BikeLane(BaseModel):
    id: str
    name: str
    kind: Literal["ciclovia", "ciclofaixa"]
    length_km: float = Field(ge=0)
    notes: str = ""
    coordinates: list[list[float]]  # pares [lat, lng]; após o snap, polilinha densa que segue as ruas
    snapped: bool = False  # True quando `coordinates` já foi ajustada às ruas reais
