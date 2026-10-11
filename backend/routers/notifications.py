"""Sino de notificações: novos seguidores, resultado dos alertas/locais enviados e avisos do app."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from lib.auth import require_moderator, require_user
from lib.dates import utc_aware
from lib.db import db

router = APIRouter(prefix="/notifications", tags=["notifications"])

LIMIT = 40


class NotificationItem(BaseModel):
    id: str
    kind: str  # follow | alert_ok | alert_no | shop_ok | shop_no | announcement
    title: str
    body: str = ""
    link: str = ""
    read: bool = False
    created_at: datetime


class NotificationFeed(BaseModel):
    unread: int
    items: list[NotificationItem]


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    body: str = Field(default="", max_length=240)
    link: str = Field(default="", max_length=200)


async def _seen_at(user: dict) -> datetime:
    """Avisos do app são para todos: contam como "não lidos" se forem mais novos que a última vez que a pessoa marcou tudo como lido."""
    seen = user.get("notif_seen_at") or user.get("created_at") or datetime.now(timezone.utc)
    return utc_aware(seen)


async def _unread(user: dict) -> int:
    seen = await _seen_at(user)
    personal = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    broadcast = await db.announcements.count_documents({"created_at": {"$gt": seen}})
    return personal + broadcast


@router.get("/unread-count")
async def unread_count(user: dict = Depends(require_user)):
    return {"unread": await _unread(user)}


@router.get("", response_model=NotificationFeed)
async def feed(user: dict = Depends(require_user)):
    seen = await _seen_at(user)
    personal = await db.notifications.find({"user_id": user["id"]}).sort("created_at", -1).to_list(LIMIT)
    ann = await db.announcements.find({}).sort("created_at", -1).to_list(10)
    items = [
        NotificationItem(
            id=d["id"], kind=d["kind"], title=d["title"], body=d.get("body", ""), link=d.get("link", ""),
            read=bool(d.get("read")), created_at=utc_aware(d["created_at"]),
        )
        for d in personal
    ] + [
        NotificationItem(
            id=d["id"], kind="announcement", title=d["title"], body=d.get("body", ""), link=d.get("link", ""),
            read=utc_aware(d["created_at"]) <= seen, created_at=utc_aware(d["created_at"]),
        )
        for d in ann
    ]
    items.sort(key=lambda i: i.created_at, reverse=True)
    return NotificationFeed(unread=await _unread(user), items=items[:LIMIT])


@router.post("/read-all")
async def read_all(user: dict = Depends(require_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    await db.users.update_one({"id": user["id"]}, {"$set": {"notif_seen_at": datetime.now(timezone.utc)}})
    return {"ok": True}


@router.post("/{notification_id}/read")
async def read_one(notification_id: str, user: dict = Depends(require_user)):
    await db.notifications.update_one({"id": notification_id, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


@router.delete("")
async def clear(user: dict = Depends(require_user)):
    """Limpa as notificações pessoais (os avisos do app ficam, mas ficam como lidos)."""
    await db.notifications.delete_many({"user_id": user["id"]})
    await db.users.update_one({"id": user["id"]}, {"$set": {"notif_seen_at": datetime.now(timezone.utc)}})
    return {"ok": True}


@router.post("/announcements")
async def announce(body: AnnouncementCreate, mod: dict = Depends(require_moderator)):
    """Aviso do app para todos os ciclistas (só a conta de gestão)."""
    import uuid

    doc = {"id": uuid.uuid4().hex, "title": body.title.strip(), "body": body.body.strip(), "link": body.link.strip(), "by": mod["id"], "created_at": datetime.now(timezone.utc)}
    await db.announcements.insert_one(doc)
    return {"ok": True, "id": doc["id"]}


@router.delete("/announcements/{announcement_id}")
async def delete_announcement(announcement_id: str, _mod: dict = Depends(require_moderator)):
    res = await db.announcements.delete_one({"id": announcement_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Aviso não encontrado")
    return {"ok": True}
