"""Caixa de alertas da conta dev: analisar, ajustar, aprovar ou recusar os alertas enviados pelos ciclistas.
Só quem está em MODERATOR_EMAILS acessa (ver lib/roles.py). Aprovar publica no mapa/radar, mantém o nome de
quem reportou e dá o XP ao autor."""

import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo import ReturnDocument

from lib.auth import require_moderator
from lib.dates import utc_aware
from lib.db import db
from models.obstacle import ModerationItem, ModerationSummary, Obstacle, ReviewEdit, ReviewReject
from routers.obstacles import XP_REPORT, _award_xp, _from_doc

router = APIRouter(prefix="/moderation", tags=["moderation"])

NEARBY_M = 60


def _dist_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


@router.get("/summary", response_model=ModerationSummary)
async def summary(_mod: dict = Depends(require_moderator)):
    return ModerationSummary(
        pendente=await db.obstacles.count_documents({"status": "pendente"}),
        recusado=await db.obstacles.count_documents({"status": "recusado"}),
        ativo=await db.obstacles.count_documents({"status": "ativo"}),
    )


@router.get("/queue", response_model=list[ModerationItem])
async def queue(status: str = Query("pendente"), _mod: dict = Depends(require_moderator)):
    """Fila de análise (mais antigos primeiro) ou lista de recusados (mais recentes primeiro)."""
    if status not in ("pendente", "recusado"):
        raise HTTPException(status_code=422, detail="Use status=pendente ou status=recusado")
    order = 1 if status == "pendente" else -1
    docs = await db.obstacles.find({"status": status}).sort("created_at", order).to_list(200)
    active = await db.obstacles.find({"status": "ativo"}, {"type": 1, "lat": 1, "lng": 1}).to_list(2000)
    items: list[ModerationItem] = []
    for d in docs:
        same = [
            _dist_m(d["lat"], d["lng"], a["lat"], a["lng"])
            for a in active
            if a["type"] == d["type"]
        ]
        close = sorted(x for x in same if x <= NEARBY_M)
        base = _from_doc(d).model_dump()
        items.append(
            ModerationItem(
                **base,
                nearby_same_type=len(close),
                nearest_same_type_m=round(min(same), 1) if same else None,
            )
        )
    return items


@router.post("/{id}/approve", response_model=Obstacle)
async def approve(id: str, edit: ReviewEdit | None = None, mod: dict = Depends(require_moderator)):
    """Publica o alerta no mapa. Troca atômica de status: aprovar duas vezes não dá XP em dobro."""
    changes = (edit.model_dump(exclude_none=True) if edit else {})
    if "description" in changes:
        changes["description"] = changes["description"].strip()
    doc = await db.obstacles.find_one_and_update(
        {"id": id, "status": {"$in": ["pendente", "recusado"]}},
        {
            "$set": {
                **changes,
                "status": "ativo",
                "reject_reason": "",
                "reviewed_at": datetime.now(timezone.utc),
                "reviewed_by": mod["id"],
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Alerta não encontrado ou já publicado")
    if await db.users.find_one({"id": doc["user_id"]}, {"id": 1}):  # autor pode ter excluído a conta
        await _award_xp(doc["user_id"], XP_REPORT, {"reports_count": 1})
    doc["created_at"] = utc_aware(doc["created_at"])
    return _from_doc(doc)


@router.post("/{id}/reject", response_model=Obstacle)
async def reject(id: str, body: ReviewReject | None = None, mod: dict = Depends(require_moderator)):
    reason = (body.reason if body else "").strip()
    doc = await db.obstacles.find_one_and_update(
        {"id": id, "status": "pendente"},
        {
            "$set": {
                "status": "recusado",
                "reject_reason": reason,
                "reviewed_at": datetime.now(timezone.utc),
                "reviewed_by": mod["id"],
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Alerta não encontrado ou já analisado")
    return _from_doc(doc)
