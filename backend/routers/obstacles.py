import uuid
from datetime import datetime, timezone

import base64
import re

from bson import Binary
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pymongo import ReturnDocument

from lib.auth import get_current_user, require_user
from lib.db import db
from lib.dates import utc_aware
from lib.game import apply_badges, level_for_xp, user_from_doc
from lib.roles import is_moderator
from models.game import BadgeDef
from models.obstacle import Obstacle, ObstacleCreate, ReportResult

router = APIRouter(prefix="/obstacles", tags=["obstacles"])

XP_REPORT = 50
XP_CONFIRM = 25
MAX_PENDING_PER_USER = 10  # evita encher a fila de análise
PUBLIC_STATUSES = ["ativo", "resolvido"]  # o que qualquer pessoa pode ver no mapa


PHOTO_RE = re.compile(r"^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$")
PHOTO_MAX_CHARS = 450_000  # ~330 KB por foto; o navegador envia ~100-250 KB
_MAGIC = {"jpeg": (b"\xff\xd8\xff",), "png": (b"\x89PNG",), "webp": (b"RIFF",)}


def _decode_photos(photos: list[str]) -> list[tuple[str, bytes]]:
    """Valida e decodifica as fotos ANTES de criar o alerta: formato, tamanho e assinatura real do arquivo."""
    out: list[tuple[str, bytes]] = []
    for p in photos:
        m = PHOTO_RE.match(p) if len(p) <= PHOTO_MAX_CHARS else None
        if not m:
            raise HTTPException(status_code=422, detail="Foto inválida ou grande demais")
        kind = m.group(1)
        try:
            raw = base64.b64decode(m.group(2), validate=True)
        except Exception:  # noqa: BLE001
            raise HTTPException(status_code=422, detail="Foto inválida")
        if not raw.startswith(_MAGIC[kind]) or (kind == "webp" and raw[8:12] != b"WEBP"):
            raise HTTPException(status_code=422, detail="O arquivo enviado não é uma imagem válida")
        out.append((f"image/{kind}", raw))
    return out


async def _delete_photos(obstacle_id: str) -> None:
    await db.obstacle_photos.delete_many({"obstacle_id": obstacle_id})


@router.get("/photos/{photo_id}")
async def get_photo(photo_id: str):
    """Foto de comprovação. O endereço é um código aleatório impossível de adivinhar (vale também para alertas em análise)."""
    doc = await db.obstacle_photos.find_one({"id": photo_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Foto não encontrada")
    return Response(
        content=bytes(doc["data"]),
        media_type=doc["content_type"],
        headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"},
    )


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
    """Mapa público: só alertas aprovados (ativo) e resolvidos. Alertas em análise ou recusados são
    visíveis apenas para quem os enviou (`mine=1`) e para a conta dev (rotas /moderation)."""
    q: dict = {}
    if mine:
        if user is None:
            raise HTTPException(status_code=401, detail="Faça login para ver seus alertas")
        q["user_id"] = user["id"]
        if status != "todos":
            q["status"] = status
    elif status == "todos":
        q["status"] = {"$in": PUBLIC_STATUSES}
    elif status in PUBLIC_STATUSES:
        q["status"] = status
    else:
        raise HTTPException(status_code=403, detail="Esses alertas só aparecem para quem os enviou e para a equipe")
    if type:
        q["type"] = type
    docs = await db.obstacles.find(q).sort("created_at", -1).to_list(1000)
    return [_from_doc(d) for d in docs]


@router.post("", response_model=ReportResult)
async def create_obstacle(req: ObstacleCreate, user: dict = Depends(require_user)):
    """Todo alerta novo entra como `pendente` e só vai ao mapa depois de aprovado pela conta dev.
    O XP também só vem na aprovação. Alertas da própria conta dev são publicados direto."""
    auto_publish = is_moderator(user)
    if not auto_publish:
        pending = await db.obstacles.count_documents({"user_id": user["id"], "status": "pendente"})
        if pending >= MAX_PENDING_PER_USER:
            raise HTTPException(
                status_code=429,
                detail="Você já tem 10 alertas aguardando análise. Espere a aprovação para enviar mais",
            )
    photos = _decode_photos(req.photos)
    now = datetime.now(timezone.utc)
    obstacle_id = str(uuid.uuid4())
    photo_ids: list[str] = []
    for content_type, raw in photos:
        pid = uuid.uuid4().hex
        photo_ids.append(pid)
        await db.obstacle_photos.insert_one(
            {"id": pid, "obstacle_id": obstacle_id, "user_id": user["id"], "content_type": content_type, "data": Binary(raw), "created_at": now}
        )
    doc = {
        "id": obstacle_id,
        "photo_ids": photo_ids,
        "user_id": user["id"],
        "user_name": user["name"],  # fica registrado no alerta e aparece no mapa depois de aprovado
        "type": req.type,
        "severity": req.severity,
        "description": req.description.strip(),
        "lat": req.lat,
        "lng": req.lng,
        "status": "ativo" if auto_publish else "pendente",
        "confirms": 0,
        "created_at": now,
        "reject_reason": "",
        "reviewed_at": now if auto_publish else None,
    }
    await db.obstacles.insert_one(doc)
    if auto_publish:
        updated, new_badges = await _award_xp(user["id"], XP_REPORT, {"reports_count": 1})
    else:
        updated, new_badges = user, []
    return ReportResult(
        obstacle=_from_doc(doc),
        user=user_from_doc(updated),
        new_badges=[BadgeDef(**b) for b in new_badges],
    )


@router.delete("/{id}")
async def withdraw_obstacle(id: str, user: dict = Depends(require_user)):
    """O autor retira um alerta que ainda não foi aprovado (em análise ou recusado).

    A conta dev (moderação) remove qualquer alerta, inclusive os já publicados no mapa (ex.: o buraco foi consertado).
    O XP já concedido a quem reportou não é desfeito.
    """
    query: dict = {"id": id}
    if not is_moderator(user):
        query.update({"user_id": user["id"], "status": {"$in": ["pendente", "recusado"]}})
    res = await db.obstacles.delete_one(query)
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Alerta não encontrado ou já publicado")
    await _delete_photos(id)
    return {"ok": True}


@router.post("/{id}/confirm", response_model=ReportResult)
async def confirm_obstacle(id: str, user: dict = Depends(require_user)):
    doc = await db.obstacles.find_one({"id": id})
    if not doc or doc.get("status") != "ativo":
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
        {"id": id, "user_id": user["id"], "status": "ativo"},
        {"$set": {"status": "resolvido"}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Alerta não encontrado ou não é seu")
    return _from_doc(doc)
