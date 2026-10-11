from typing import Literal

from pydantic import BaseModel, Field


class BikeLane(BaseModel):
    id: str
    name: str
    kind: Literal["ciclovia", "ciclofaixa"]
    length_km: float = Field(ge=0)
    notes: str = ""
    coordinates: list[list[float]]  # pares [lat, lng]; após o snap, polilinha densa que segue as ruas
    source: Literal["seed", "osm", "comunidade"] = "seed"  # osm = importada do OpenStreetMap (© colaboradores)
    snapped: bool = False  # True quando `coordinates` já foi ajustada às ruas reais


class BikeLaneCreate(BaseModel):
    """Traçado desenhado pela conta dev: pontos tocados no mapa; o servidor cola nas ruas."""

    name: str = Field(min_length=2, max_length=80)
    kind: Literal["ciclovia", "ciclofaixa"] = "ciclofaixa"
    notes: str = Field(default="", max_length=200)
    waypoints: list[list[float]] = Field(min_length=2, max_length=60)
