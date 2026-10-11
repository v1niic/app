"""Sino de notificações: novo seguidor, leitura e limpeza."""
import uuid

import httpx

from tests.conftest import API_URL


def _new_user() -> tuple[httpx.Client, dict]:
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    r = c.post("/auth/register", json={"name": f"Ciclista {uuid.uuid4().hex[:5]}", "email": f"n_{uuid.uuid4().hex[:8]}@example.com", "password": "senha123"})
    assert r.status_code == 200, r.text
    return c, r.json()


def test_follow_creates_one_notification_and_read_all():
    a, ua = _new_user()
    b, ub = _new_user()
    a.post(f"/social/people/{ub['id']}/follow")
    a.post(f"/social/people/{ub['id']}/follow")  # repetir não avisa de novo
    feed = b.get("/notifications").json()
    follows = [i for i in feed["items"] if i["kind"] == "follow"]
    assert len(follows) == 1 and follows[0]["link"] == f"/ciclistas/{ua['id']}"
    assert b.get("/notifications/unread-count").json()["unread"] >= 1
    assert b.post("/notifications/read-all").status_code == 200
    assert b.get("/notifications/unread-count").json()["unread"] == 0
    assert b.delete("/notifications").status_code == 200
    assert b.get("/notifications").json()["items"] == [] or all(i["kind"] == "announcement" for i in b.get("/notifications").json()["items"])


def test_notifications_require_login_and_announce_is_moderator_only():
    assert httpx.Client(base_url=API_URL, timeout=30.0).get("/notifications").status_code == 401
    c, _ = _new_user()
    assert c.post("/notifications/announcements", json={"title": "Aviso de teste"}).status_code == 403
