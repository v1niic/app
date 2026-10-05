from fastapi import APIRouter, Depends
from pymongo import ReturnDocument

from lib.auth import require_user
from lib.db import db
from lib.game import apply_badges, level_for_xp, user_from_doc
from models.game import BadgeDef, RideCreate, RideResult

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
    updated["level"] = level_for_xp(updated["xp"])
    await db.users.update_one({"id": updated["id"]}, {"$set": {"level": updated["level"]}})
    updated, new_badges = await apply_badges(updated)
    return RideResult(user=user_from_doc(updated), new_badges=[BadgeDef(**b) for b in new_badges])
