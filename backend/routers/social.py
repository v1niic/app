"""Ciclistas: buscar, ver o perfil público e seguir. E-mail nunca aparece aqui."""

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError

from lib.auth import require_user
from lib.db import db
from lib.notify import notify
from models.user import PublicUser

router = APIRouter(prefix="/social", tags=["social"])

# contas de demonstração (id "seed-…") e desativadas não aparecem para ninguém
VISIBLE = {"id": {"$not": {"$regex": "^seed-"}}, "deactivated": {"$ne": True}}
LIST_LIMIT = 60


async def _public(docs: list[dict], me_id: str) -> list[PublicUser]:
    """Monta os cartões com contadores e a relação com quem está olhando (poucas consultas, não uma por pessoa)."""
    ids = [d["id"] for d in docs]
    if not ids:
        return []
    followers: dict[str, int] = {}
    following: dict[str, int] = {}
    async for row in db.follows.aggregate([{"$match": {"followee_id": {"$in": ids}}}, {"$group": {"_id": "$followee_id", "n": {"$sum": 1}}}]):
        followers[row["_id"]] = row["n"]
    async for row in db.follows.aggregate([{"$match": {"follower_id": {"$in": ids}}}, {"$group": {"_id": "$follower_id", "n": {"$sum": 1}}}]):
        following[row["_id"]] = row["n"]
    i_follow = {r["followee_id"] async for r in db.follows.find({"follower_id": me_id, "followee_id": {"$in": ids}})}
    follow_me = {r["follower_id"] async for r in db.follows.find({"followee_id": me_id, "follower_id": {"$in": ids}})}
    return [
        PublicUser(
            id=d["id"],
            name=d.get("name", "Ciclista"),
            avatar=d.get("avatar", ""),
            bio=d.get("bio", ""),
            bike_type=d.get("bike_type", "urbana"),
            level=d.get("level", 1),
            xp=d.get("xp", 0),
            total_km=d.get("total_km", 0.0),
            reports_count=d.get("reports_count", 0),
            badge_ids=d.get("badge_ids", []),
            followers_count=followers.get(d["id"], 0),
            following_count=following.get(d["id"], 0),
            is_following=d["id"] in i_follow,
            follows_me=d["id"] in follow_me,
        )
        for d in docs
    ]


async def _users_by_ids(ids: list[str]) -> list[dict]:
    found = {d["id"]: d async for d in db.users.find({"id": {"$in": ids}, **VISIBLE})}
    return [found[i] for i in ids if i in found]  # mantém a ordem (mais recentes primeiro)


@router.get("/people", response_model=list[PublicUser])
async def search_people(q: str = "", me: dict = Depends(require_user)):
    """Sem busca: os ciclistas mais ativos (sugestões). Com `q`: nomes que contêm o texto."""
    query: dict = {**VISIBLE}
    query["id"] = {"$not": {"$regex": "^seed-"}, "$ne": me["id"]}
    q = q.strip()[:40]
    if q:
        query["name"] = {"$regex": re.escape(q), "$options": "i"}
    docs = await db.users.find(query).sort("xp", -1).to_list(LIST_LIMIT)
    return await _public(docs, me["id"])


@router.get("/people/{user_id}", response_model=PublicUser)
async def person(user_id: str, me: dict = Depends(require_user)):
    doc = await db.users.find_one({"id": user_id, **{k: v for k, v in VISIBLE.items() if k != "id"}})
    if not doc or (doc["id"].startswith("seed-") and doc["id"] != me["id"]):
        raise HTTPException(status_code=404, detail="Ciclista não encontrado")
    return (await _public([doc], me["id"]))[0]


@router.get("/people/{user_id}/followers", response_model=list[PublicUser])
async def followers(user_id: str, me: dict = Depends(require_user)):
    rows = await db.follows.find({"followee_id": user_id}).sort("created_at", -1).to_list(LIST_LIMIT)
    return await _public(await _users_by_ids([r["follower_id"] for r in rows]), me["id"])


@router.get("/people/{user_id}/following", response_model=list[PublicUser])
async def following(user_id: str, me: dict = Depends(require_user)):
    rows = await db.follows.find({"follower_id": user_id}).sort("created_at", -1).to_list(LIST_LIMIT)
    return await _public(await _users_by_ids([r["followee_id"] for r in rows]), me["id"])


@router.post("/people/{user_id}/follow", response_model=PublicUser)
async def follow(user_id: str, me: dict = Depends(require_user)):
    if user_id == me["id"]:
        raise HTTPException(status_code=400, detail="Você não pode seguir a si mesmo")
    target = await db.users.find_one({"id": user_id, "deactivated": {"$ne": True}})
    if not target or user_id.startswith("seed-"):
        raise HTTPException(status_code=404, detail="Ciclista não encontrado")
    try:
        await db.follows.insert_one({"follower_id": me["id"], "followee_id": user_id, "created_at": datetime.now(timezone.utc)})
        await notify(user_id, "follow", f"{me.get('name', 'Um ciclista')} começou a seguir você", link=f"/ciclistas/{me['id']}", actor_id=me["id"])
    except DuplicateKeyError:
        pass  # já seguia: tudo bem, o resultado é o mesmo (e não avisa de novo)
    return (await _public([target], me["id"]))[0]


@router.delete("/people/{user_id}/follow", response_model=PublicUser)
async def unfollow(user_id: str, me: dict = Depends(require_user)):
    await db.follows.delete_one({"follower_id": me["id"], "followee_id": user_id})
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="Ciclista não encontrado")
    return (await _public([target], me["id"]))[0]
