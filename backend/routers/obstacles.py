import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo import ReturnDocument

from lib.auth import get_current_user, require_user
from lib.db import db
from lib.dates import utc_aware
from lib.game import apply_badges, level_for_xp, user_from_doc
from models.game import BadgeDef
from models.obstacle import Obstacle, ObstacleCreate, ReportResult

router = APIRouter(prefix="/obstacles", tags=["obstacles"])

XP_REPORT = 50
XP_CONFIRM = 25


def _from_doc(d: dict) -> Obstacle:
    data = dict(d)
    data["created_at"] = utc_aware(data.get("created_at"))
    return Obstacle(**data)


async def _award_xp(user_id: str, xp: int, inc: dict) -> dict:
    updated = await db.users.find_one_and_update(
        {"id": user_id}, {"$inc": {"xp": xp, **inc}}, return_document=ReturnDocument.AFTER
    )
    updated["level"] = level_for_xp(updated["xp"])
    await db.users.update_one({"id": user_id}, {"$set": {"level": updated["level"]}})
    updated, new_badges = await apply_badges(updated)
    return updated, new_badges


@router.get("", response_model=list[Obstacle])
async def list_obstacles(
    type: str | None = Query(None),
    status: str = Query("ativo"),
    mine: bool = Query(False),
    user: dict | None = Depends(get_current_user),
):
    q: dict = {}
    if status != "todos":
        q["status"] = status
    if type:
        q["type"] = type
    if mine:
        if user is None:
            raise HTTPException(status_code=401, detail="Faça login para ver seus alertas")
        q["user_id"] = user["id"]
    docs = await db.obstacles.find(q).sort("created_at", -1).to_list(1000)
    return [_from_doc(d) for d in docs]


@router.post("", response_model=ReportResult)
async def create_obstacle(req: ObstacleCreate, user: dict = Depends(require_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user["name"],
        "type": req.type,
        "severity": req.severity,
        "description": req.description.strip(),
        "lat": req.lat,
        "lng": req.lng,
        "status": "ativo",
        "confirms": 0,
        "created_at": datetime.now(timezone.utc),
    }
    await db.obstacles.insert_one(doc)
    updated, new_badges = await _award_xp(user["id"], XP_REPORT, {"reports_count": 1})
    return ReportResult(
        obstacle=_from_doc(doc),
        user=user_from_doc(updated),
        new_badges=[BadgeDef(**b) for b in new_badges],
    )


@router.post("/{id}/confirm", response_model=ReportResult)
async def confirm_obstacle(id: str, user: dict = Depends(require_user)):
    doc = await db.obstacles.find_one({"id": id})
    if not doc:
        raise HTTPException(status_code=404, detail="Alerta não encontrado")
    if doc["user_id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Você não pode confirmar o seu próprio alerta")
    await db.obstacles.update_one({"id": id}, {"$inc": {"confirms": 1}})
    doc["confirms"] = doc.get("confirms", 0) + 1
    updated, new_badges = await _award_xp(user["id"], XP_CONFIRM, {"confirms_count": 1})
    return ReportResult(
        obstacle=_from_doc(doc),
        user=user_from_doc(updated),
        new_badges=[BadgeDef(**b) for b in new_badges],
    )


@router.post("/{id}/resolve", response_model=Obstacle)
async def resolve_obstacle(id: str, user: dict = Depends(require_user)):
    doc = await db.obstacles.find_one_and_update(
        {"id": id, "user_id": user["id"]},
        {"$set": {"status": "resolvido"}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Alerta não encontrado ou não é seu")
    return _from_doc(doc)
