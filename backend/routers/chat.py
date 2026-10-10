"""Chat global dos ciclistas + encontros (pedaladas marcadas). Tempo real por consulta frequente (polling):
a Vercel é serverless, sem WebSocket. Só usuários logados leem e escrevem."""

import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.auth import require_user
from lib.dates import utc_aware
from lib.db import db
from models.chat import ChatCreate, ChatMessage, Meetup, MeetupCreate

router = APIRouter(tags=["chat"])

RATE_WINDOW_S = 20
RATE_MAX_MESSAGES = 5
MAX_ACTIVE_MEETUPS_PER_USER = 5
MEETUP_VISIBLE_AFTER_START = timedelta(hours=3)  # o encontro continua na lista um pouco depois de começar
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _clean(text: str) -> str:
    text = _CTRL.sub("", text).strip()
    return re.sub(r"\n{3,}", "\n\n", text)


def _message(d: dict) -> ChatMessage:
    data = dict(d)
    data["created_at"] = utc_aware(data["created_at"])
    return ChatMessage(**data)


@router.get("/chat/messages", response_model=list[ChatMessage])
async def list_messages(
    limit: int = Query(60, ge=1, le=100),
    after: datetime | None = None,
    _user: dict = Depends(require_user),
):
    """Mais recentes em ordem cronológica. Com `after`, só o que chegou depois (use >= e descarte repetidos pelo id)."""
    if after is not None:
        docs = await db.chat_messages.find({"created_at": {"$gte": after}}).sort("created_at", 1).to_list(limit)
        return [_message(d) for d in docs]
    docs = await db.chat_messages.find({}).sort("created_at", -1).to_list(limit)
    return [_message(d) for d in reversed(docs)]


@router.post("/chat/messages", response_model=ChatMessage)
async def post_message(req: ChatCreate, user: dict = Depends(require_user)):
    text = _clean(req.text)
    if not text:
        raise HTTPException(status_code=422, detail="Escreva uma mensagem")
    since = datetime.now(timezone.utc) - timedelta(seconds=RATE_WINDOW_S)
    recent = await db.chat_messages.count_documents({"user_id": user["id"], "created_at": {"$gte": since}})
    if recent >= RATE_MAX_MESSAGES:
        raise HTTPException(status_code=429, detail="Calma, ciclista! Espere alguns segundos para enviar de novo")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user["name"],
        "user_level": user.get("level", 1),
        "text": text,
        "created_at": datetime.now(timezone.utc),
    }
    await db.chat_messages.insert_one(doc)
    return _message(doc)


@router.delete("/chat/messages/{message_id}")
async def delete_message(message_id: str, user: dict = Depends(require_user)):
    res = await db.chat_messages.delete_one({"id": message_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")
    return {"ok": True}


# ---------------------------------------------------------------- encontros


def _meetup(d: dict, me: str) -> Meetup:
    going_ids: list[str] = d.get("going_ids", [])
    names: list[str] = d.get("going_names", [])
    return Meetup(
        id=d["id"],
        user_id=d["user_id"],
        user_name=d["user_name"],
        title=d["title"],
        place=d["place"],
        description=d.get("description", ""),
        starts_at=utc_aware(d["starts_at"]),
        going_count=len(going_ids),
        going=me in going_ids,
        going_names=names[:5],
    )


@router.get("/meetups", response_model=list[Meetup])
async def list_meetups(user: dict = Depends(require_user)):
    """Encontros que ainda não terminaram, do mais próximo para o mais distante."""
    cutoff = datetime.now(timezone.utc) - MEETUP_VISIBLE_AFTER_START
    docs = await db.meetups.find({"starts_at": {"$gte": cutoff}}).sort("starts_at", 1).to_list(50)
    return [_meetup(d, user["id"]) for d in docs]


@router.post("/meetups", response_model=Meetup)
async def create_meetup(req: MeetupCreate, user: dict = Depends(require_user)):
    now = datetime.now(timezone.utc)
    starts = req.starts_at if req.starts_at.tzinfo else req.starts_at.replace(tzinfo=timezone.utc)
    if starts < now - timedelta(minutes=30):
        raise HTTPException(status_code=422, detail="Escolha um horário que ainda não passou")
    if starts > now + timedelta(days=90):
        raise HTTPException(status_code=422, detail="Marque encontros para os próximos 90 dias")
    active = await db.meetups.count_documents({"user_id": user["id"], "starts_at": {"$gte": now}})
    if active >= MAX_ACTIVE_MEETUPS_PER_USER:
        raise HTTPException(status_code=429, detail="Você já tem 5 encontros marcados. Cancele um para criar outro")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user["name"],
        "title": _clean(req.title),
        "place": _clean(req.place),
        "description": _clean(req.description),
        "starts_at": starts,
        "going_ids": [user["id"]],  # quem marca já vai
        "going_names": [user["name"]],
        "created_at": now,
    }
    await db.meetups.insert_one(doc)
    return _meetup(doc, user["id"])


@router.post("/meetups/{meetup_id}/join", response_model=Meetup)
async def toggle_join(meetup_id: str, user: dict = Depends(require_user)):
    """Confirma ou cancela a presença (alterna)."""
    doc = await db.meetups.find_one({"id": meetup_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Encontro não encontrado")
    if user["id"] in doc.get("going_ids", []):
        if doc["user_id"] == user["id"]:
            raise HTTPException(status_code=400, detail="Você organiza este encontro. Cancele-o se não for mais")
        await db.meetups.update_one({"id": meetup_id}, {"$pull": {"going_ids": user["id"], "going_names": user["name"]}})
    else:
        await db.meetups.update_one(
            {"id": meetup_id}, {"$addToSet": {"going_ids": user["id"], "going_names": user["name"]}}
        )
    return _meetup(await db.meetups.find_one({"id": meetup_id}), user["id"])


@router.delete("/meetups/{meetup_id}")
async def delete_meetup(meetup_id: str, user: dict = Depends(require_user)):
    res = await db.meetups.delete_one({"id": meetup_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Encontro não encontrado")
    return {"ok": True}
