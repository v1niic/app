"""Borracharias, oficinas e pontos de autorreparo no mapa, com telefone e avaliações dos ciclistas.

Os pontos vêm do OpenStreetMap (importação em /admin/import-shops) e de sugestões da comunidade, que só aparecem no
mapa depois que a conta dev aprova (mesma lógica da caixa de alertas).
"""

import math
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import require_moderator, require_user
from lib.db import db
from lib.roles import is_moderator
from models.shop import ReviewCreate, Shop, ShopCreate, ShopDetail, ShopReject, ShopReview

router = APIRouter(prefix="/shops", tags=["shops"])

MAX_PENDING_PER_USER = 5
MAP_LIMIT = 800
REVIEWS_SHOWN = 30
DUPLICATE_M = 40


def _public(doc: dict) -> Shop:
    return Shop(**{k: v for k, v in doc.items() if k in Shop.model_fields})


def _meters(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


async def recompute_rating(shop_id: str) -> None:
    rows = await db.shop_reviews.aggregate(
        [{"$match": {"shop_id": shop_id}}, {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "n": {"$sum": 1}}}]
    ).to_list(1)
    avg, n = (round(rows[0]["avg"], 2), rows[0]["n"]) if rows else (0.0, 0)
    await db.shops.update_one({"id": shop_id}, {"$set": {"rating_avg": avg, "rating_count": n}})


@router.get("", response_model=list[Shop])
async def list_shops():
    docs = await db.shops.find({"status": "ativo"}).limit(MAP_LIMIT).to_list(MAP_LIMIT)
    return [_public(d) for d in docs]


@router.post("", response_model=Shop)
async def suggest_shop(req: ShopCreate, user: dict = Depends(require_user)):
    """Qualquer ciclista sugere um local; ele fica em análise até a equipe aprovar. A conta dev publica direto."""
    mod = is_moderator(user)
    if not mod and await db.shops.count_documents({"added_by": user["id"], "status": "pendente"}) >= MAX_PENDING_PER_USER:
        raise HTTPException(status_code=429, detail="Você já tem locais demais em análise. Aguarde a equipe revisar.")
    async for other in db.shops.find({"status": {"$in": ["ativo", "pendente"]}, "lat": {"$gt": req.lat - 0.001, "$lt": req.lat + 0.001}}):
        if _meters((req.lat, req.lng), (other["lat"], other["lng"])) < DUPLICATE_M and other["name"].strip().lower() == req.name.strip().lower():
            raise HTTPException(status_code=409, detail="Este local já está cadastrado (ou em análise).")
    doc = {
        "id": str(uuid.uuid4()),
        **req.model_dump(),
        "name": req.name.strip(),
        "status": "ativo" if mod else "pendente",
        "source": "comunidade",
        "added_by": user["id"],
        "added_by_name": user.get("name", ""),
        "rating_avg": 0.0,
        "rating_count": 0,
        "created_at": datetime.now(timezone.utc),
    }
    await db.shops.insert_one(doc)
    return _public(doc)


# ---- moderação (conta dev) — rotas fixas antes de /{shop_id} ----


@router.get("/moderation/queue", response_model=list[Shop])
async def moderation_queue(_: dict = Depends(require_moderator)):
    docs = await db.shops.find({"status": "pendente"}).sort("created_at", 1).to_list(100)
    return [_public(d) for d in docs]


@router.post("/{shop_id}/approve", response_model=Shop)
async def approve_shop(shop_id: str, _: dict = Depends(require_moderator)):
    doc = await db.shops.find_one_and_update(
        {"id": shop_id, "status": {"$in": ["pendente", "recusado"]}}, {"$set": {"status": "ativo"}}, return_document=True
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Local não encontrado ou já publicado")
    return _public(doc)


@router.post("/{shop_id}/reject")
async def reject_shop(shop_id: str, req: ShopReject, _: dict = Depends(require_moderator)):
    res = await db.shops.delete_one({"id": shop_id, "status": "pendente"})  # recusado = removido (nada a reconsiderar)
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Local não encontrado ou já analisado")
    return {"ok": True}


# ---- detalhes e avaliações ----


@router.get("/{shop_id}", response_model=ShopDetail)
async def shop_detail(shop_id: str, user: dict = Depends(require_user)):
    doc = await db.shops.find_one({"id": shop_id, "status": "ativo"})
    if not doc:
        raise HTTPException(status_code=404, detail="Local não encontrado")
    rows = await db.shop_reviews.find({"shop_id": shop_id}).sort("created_at", -1).to_list(REVIEWS_SHOWN)
    reviews = [ShopReview(**{k: v for k, v in r.items() if k in ShopReview.model_fields}) for r in rows]
    mine = next((r for r in reviews if r.user_id == user["id"]), None)
    if mine is None:
        own = await db.shop_reviews.find_one({"shop_id": shop_id, "user_id": user["id"]})
        mine = ShopReview(**{k: v for k, v in own.items() if k in ShopReview.model_fields}) if own else None
    can_delete = is_moderator(user) or (bool(doc.get("added_by")) and doc.get("added_by") == user["id"])
    return ShopDetail(**_public(doc).model_dump(), reviews=reviews, my_review=mine, can_delete=can_delete)


@router.delete("/{shop_id}")
async def delete_shop(shop_id: str, user: dict = Depends(require_user)):
    """Remove o local do mapa (e as avaliações dele). Só quem o sugeriu ou a conta dev."""
    doc = await db.shops.find_one({"id": shop_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Local não encontrado")
    if not (is_moderator(user) or (doc.get("added_by") and doc.get("added_by") == user["id"])):
        raise HTTPException(status_code=403, detail="Só quem adicionou o local ou a equipe pode removê-lo")
    await db.shop_reviews.delete_many({"shop_id": shop_id})
    await db.shops.delete_one({"id": shop_id})
    return {"ok": True}


@router.put("/{shop_id}/review", response_model=ShopDetail)
async def review_shop(shop_id: str, req: ReviewCreate, user: dict = Depends(require_user)):
    """Uma avaliação por pessoa e por local: avaliar de novo substitui a anterior."""
    if not await db.shops.find_one({"id": shop_id, "status": "ativo"}):
        raise HTTPException(status_code=404, detail="Local não encontrado")
    await db.shop_reviews.update_one(
        {"shop_id": shop_id, "user_id": user["id"]},
        {
            "$set": {
                "user_name": user.get("name", "Ciclista"),
                "user_avatar": "",  # foto não é copiada: evita guardar imagens grandes em cada avaliação
                "rating": req.rating,
                "comment": req.comment.strip(),
                "created_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )
    await recompute_rating(shop_id)
    return await shop_detail(shop_id, user)


@router.delete("/{shop_id}/review", response_model=ShopDetail)
async def delete_review(shop_id: str, user: dict = Depends(require_user)):
    await db.shop_reviews.delete_one({"shop_id": shop_id, "user_id": user["id"]})
    await recompute_rating(shop_id)
    return await shop_detail(shop_id, user)
