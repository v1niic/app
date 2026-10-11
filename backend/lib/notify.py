"""Cria notificações para um ciclista. Nunca derruba a ação principal: se falhar, só registra no log."""

import logging
import uuid
from datetime import datetime, timezone

from lib.db import db

logger = logging.getLogger(__name__)


async def notify(user_id: str, kind: str, title: str, body: str = "", link: str = "", actor_id: str | None = None) -> None:
    if not user_id or user_id.startswith("seed-"):
        return
    try:
        await db.notifications.insert_one(
            {
                "id": uuid.uuid4().hex,
                "user_id": user_id,
                "kind": kind,
                "title": title[:120],
                "body": body[:240],
                "link": link[:200],
                "actor_id": actor_id,
                "read": False,
                "created_at": datetime.now(timezone.utc),
            }
        )
    except Exception:  # noqa: BLE001 — notificação é "bônus"
        logger.exception("falha ao criar notificação")
