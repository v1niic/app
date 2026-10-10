import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pymongo import ReturnDocument

from lib.auth import require_user
from lib.db import db
from lib.game import apply_badges, level_for_xp, user_from_doc
from models.game import BadgeDef, RideCreate, RideEntry, RideResult

router = APIRouter(tags=["rides"])

XP_PER_KM = 10


@router.post("/rides", response_model=RideResult)
async def log_ride(req: RideCreate, user: dict = Depends(require_user)):
    km = round(req.km, 2)
    xp_gain = int(km * XP_PER_KM)
    updated = await db.users.find_one_and_update(
        {"id": user["id"]},
        {"$inc": {"total_km": km, "xp": xp_gain}},
        return_document=ReturnDocument.AFTER,
    )
    await db.rides.insert_one(
        {"id": str(uuid.uuid4()), "user_id": user["id"], "km": km, "xp": xp_gain, "created_at": datetime.now(timezone.utc)}
    )
    updated["level"] = level_for_xp(updated["xp"])
    await db.users.update_one({"id": updated["id"]}, {"$set": {"level": updated["level"]}})
    updated, new_badges = await apply_badges(updated)
    return RideResult(user=user_from_doc(updated), new_badges=[BadgeDef(**b) for b in new_badges])


@router.get("/rides", response_model=list[RideEntry])
async def my_rides(limit: int = 30, user: dict = Depends(require_user)):
    """Histórico de pedais do usuário logado, do mais recente para o mais antigo."""
    docs = await db.rides.find({"user_id": user["id"]}).sort("created_at", -1).to_list(max(1, min(limit, 100)))
    return [RideEntry(**d) for d in docs]
