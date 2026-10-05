from typing import Literal

from pydantic import BaseModel, Field


class BikeLane(BaseModel):
    id: str
    name: str
    kind: Literal["ciclovia", "ciclofaixa"]
    length_km: float = Field(ge=0)
    notes: str = ""
    coordinates: list[list[float]]  # pares [lat, lng]
