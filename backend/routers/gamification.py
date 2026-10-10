from fastapi import APIRouter, Depends

from lib.auth import get_current_user
from lib.db import db
from lib.game import BADGE_DEFS, mission_progress
from models.game import BadgeDef, LeaderboardEntry, MissionProgress, StatsPublic

router = APIRouter(tags=["gamification"])


@router.get("/badges", response_model=list[BadgeDef])
async def list_badges():
    return [BadgeDef(**b) for b in BADGE_DEFS]


@router.get("/missions", response_model=list[MissionProgress])
async def list_missions(user: dict | None = Depends(get_current_user)):
    return mission_progress(user)


# Contas de demonstração do seed (id "seed-...") existem só para apresentar o app: não entram no placar nem na contagem.
REAL_USERS = {"id": {"$not": {"$regex": "^seed-"}}}


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def leaderboard():
    docs = await db.users.find(REAL_USERS).sort("xp", -1).to_list(10)
    return [
        LeaderboardEntry(
            rank=i + 1,
            name=d.get("name", "Ciclista"),
            level=d.get("level", 1),
            xp=d.get("xp", 0),
            reports_count=d.get("reports_count", 0),
            badge_count=len(d.get("badge_ids", [])),
        )
        for i, d in enumerate(docs)
    ]


@router.get("/stats", response_model=StatsPublic)
async def stats():
    lanes = await db.bikelanes.count_documents({})
    ativos = await db.obstacles.count_documents({"status": "ativo"})
    total = await db.obstacles.count_documents({})
    ciclistas = await db.users.count_documents(REAL_USERS)
    return StatsPublic(bikelanes=lanes, obstacles_ativos=ativos, reports_total=total, ciclistas=ciclistas)
