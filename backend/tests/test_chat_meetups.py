"""Chat global e encontros: só logados, limite de envio, apagar só o que é seu, presença nos encontros."""
import uuid
from datetime import datetime, timedelta, timezone

import httpx

from tests.conftest import API_URL


def _user(name: str) -> httpx.Client:
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    email = f"chat-{uuid.uuid4().hex[:10]}@vaidebike.app"
    assert c.post("/auth/register", json={"name": name, "email": email, "password": "senha123"}).status_code == 200
    return c


def _iso(hours: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def test_chat_requires_login():
    with httpx.Client(base_url=API_URL, timeout=30.0) as visitor:
        assert visitor.get("/chat/messages").status_code == 401
        assert visitor.post("/chat/messages", json={"text": "oi"}).status_code == 401
        assert visitor.get("/meetups").status_code == 401


def test_chat_send_read_and_delete_only_own():
    ana, bia = _user("Ana"), _user("Bia")
    try:
        marker = f"oi galera {uuid.uuid4().hex[:6]}"
        sent = ana.post("/chat/messages", json={"text": f"  {marker}  "})
        assert sent.status_code == 200, sent.text
        msg = sent.json()
        assert msg["text"] == marker and msg["user_name"] == "Ana"

        # outra pessoa vê a mensagem
        seen = bia.get("/chat/messages?limit=100").json()
        assert marker in [m["text"] for m in seen]

        # só quem escreveu apaga
        assert bia.delete(f"/chat/messages/{msg['id']}").status_code == 404
        assert ana.delete(f"/chat/messages/{msg['id']}").status_code == 200
        assert marker not in [m["text"] for m in bia.get("/chat/messages?limit=100").json()]

        # mensagem vazia / grande demais
        assert ana.post("/chat/messages", json={"text": "   "}).status_code == 422
        assert ana.post("/chat/messages", json={"text": "x" * 501}).status_code == 422
    finally:
        ana.close()
        bia.close()


def test_chat_rate_limit():
    c = _user("Spammer")
    try:
        codes = [c.post("/chat/messages", json={"text": f"msg {i}"}).status_code for i in range(7)]
        assert codes[:5] == [200] * 5
        assert 429 in codes[5:]
    finally:
        c.close()


def test_meetup_create_join_leave_and_cancel():
    org, guest = _user("Organizadora"), _user("Convidado")
    try:
        created = org.post(
            "/meetups",
            json={"title": "Pedal de domingo", "place": "Beira-Mar", "description": "ritmo leve", "starts_at": _iso(24)},
        )
        assert created.status_code == 200, created.text
        m = created.json()
        assert m["going_count"] == 1 and m["going"] is True

        listed = guest.get("/meetups").json()
        mine = next(x for x in listed if x["id"] == m["id"])
        assert mine["going"] is False

        joined = guest.post(f"/meetups/{m['id']}/join").json()
        assert joined["going"] is True and joined["going_count"] == 2
        left = guest.post(f"/meetups/{m['id']}/join").json()
        assert left["going"] is False and left["going_count"] == 1

        # organizador não sai do próprio encontro (cancela) e só ele cancela
        assert org.post(f"/meetups/{m['id']}/join").status_code == 400
        assert guest.delete(f"/meetups/{m['id']}").status_code == 404
        assert org.delete(f"/meetups/{m['id']}").status_code == 200
        assert m["id"] not in [x["id"] for x in guest.get("/meetups").json()]
    finally:
        org.close()
        guest.close()


def test_meetup_rejects_past_and_far_future_dates():
    c = _user("Datas")
    try:
        base = {"title": "Pedal teste", "place": "Praça"}
        assert c.post("/meetups", json={**base, "starts_at": _iso(-5)}).status_code == 422
        assert c.post("/meetups", json={**base, "starts_at": _iso(24 * 120)}).status_code == 422
    finally:
        c.close()
