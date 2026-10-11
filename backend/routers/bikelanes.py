import uuid

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import require_moderator
from lib.db import db
from lib.routing import polyline_length_m
from lib.snap import looks_sane, snap_waypoints
from models.bikelane import BikeLane, BikeLaneCreate

router = APIRouter(prefix="/bikelanes", tags=["bikelanes"])

LIST_LIMIT = 3000
# Fortaleza e arredores: pontos fora disso são cliques errados
LAT_RANGE = (-4.2, -3.4)
LNG_RANGE = (-39.0, -38.1)


@router.get("", response_model=list[BikeLane])
async def list_bikelanes():
    docs = await db.bikelanes.find().sort("length_km", -1).to_list(LIST_LIMIT)
    return [BikeLane(**d) for d in docs]


@router.post("", response_model=BikeLane)
async def create_bikelane(req: BikeLaneCreate, _: dict = Depends(require_moderator)):
    """Cria uma ciclovia/ciclofaixa a partir dos pontos tocados no mapa, colada nas ruas (roteador de bike)."""
    for p in req.waypoints:
        if len(p) != 2 or not (LAT_RANGE[0] <= p[0] <= LAT_RANGE[1] and LNG_RANGE[0] <= p[1] <= LNG_RANGE[1]):
            raise HTTPException(status_code=422, detail="Há um ponto fora de Fortaleza")
    snapped = await snap_waypoints(req.waypoints)
    if snapped and looks_sane(req.waypoints, snapped):
        coords, ok = snapped, True
    elif snapped is None:
        raise HTTPException(status_code=503, detail="O roteador de bike não respondeu agora. Tente de novo em instantes.")
    else:
        coords, ok = req.waypoints, False  # resultado estranho: guarda a linha reta, marcada como aproximada
    doc = {
        "id": f"lane-{uuid.uuid4().hex[:10]}",
        "name": req.name.strip(),
        "kind": req.kind,
        "notes": req.notes.strip(),
        "length_km": round(polyline_length_m(coords) / 1000, 2),
        "coordinates": coords,
        "waypoints": req.waypoints,
        "source": "comunidade",
        "snapped": ok,
    }
    await db.bikelanes.insert_one(doc)
    return BikeLane(**doc)


@router.delete("/{lane_id}")
async def delete_bikelane(lane_id: str, _: dict = Depends(require_moderator)):
    res = await db.bikelanes.delete_one({"id": lane_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Traçado não encontrado")
    return {"ok": True}
