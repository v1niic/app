"""Oficinas e borracharias: sugestão em análise, avaliação (uma por pessoa) e telefone validado."""
import uuid

import httpx

from tests.conftest import API_URL

SHOP = {"name": "Borracharia Teste Tscheck", "kind": "borracharia", "lat": -3.7305, "lng": -38.5201, "phone": "(85) 99999-0000"}


def _user() -> httpx.Client:
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    email = f"tscheck_{uuid.uuid4().hex[:8]}@example.com"
    assert c.post("/auth/register", json={"name": "Dono Teste", "email": email, "password": "senha123"}).status_code == 200
    return c


def test_suggestion_is_pending_and_hidden_from_map():
    c = _user()
    body = {**SHOP, "name": f"Oficina {uuid.uuid4().hex[:6]}"}
    r = c.post("/shops", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pendente"
    assert body["name"] not in [s["name"] for s in c.get("/shops").json()]
    assert c.get(f"/shops/{r.json()['id']}").status_code == 404  # ainda não publicado


def test_regular_user_cannot_moderate():
    c = _user()
    assert c.get("/shops/moderation/queue").status_code == 403
    assert c.post("/shops/qualquer/approve").status_code == 403


def test_invalid_phone_and_far_away_rejected():
    c = _user()
    assert c.post("/shops", json={**SHOP, "phone": "abc"}).status_code == 422
    assert c.post("/shops", json={**SHOP, "lat": 10.0}).status_code == 422


def test_shops_require_login_for_details():
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    assert c.get("/shops/qualquer").status_code == 401


def test_review_flow_on_any_active_shop():
    c = _user()
    shops = c.get("/shops").json()
    if not shops:  # banco sem importação ainda: nada a avaliar
        return
    sid = shops[0]["id"]
    d = c.put(f"/shops/{sid}/review", json={"rating": 5, "comment": "Atendimento rápido"}).json()
    assert d["my_review"]["rating"] == 5
    d2 = c.put(f"/shops/{sid}/review", json={"rating": 3}).json()  # substitui a anterior
    assert d2["my_review"]["rating"] == 3
    assert [r["rating"] for r in d2["reviews"] if r["user_id"] == d2["my_review"]["user_id"]] == [3]
    assert c.put(f"/shops/{sid}/review", json={"rating": 9}).status_code == 422
    assert c.delete(f"/shops/{sid}/review").json()["my_review"] is None


def test_only_author_or_moderator_can_delete():
    author = _user()
    other = _user()
    sid = author.post("/shops", json={**SHOP, "name": f"Remover {uuid.uuid4().hex[:6]}"}).json()["id"]
    assert other.delete(f"/shops/{sid}").status_code == 403
    assert author.delete(f"/shops/{sid}").status_code == 200
    assert author.delete(f"/shops/{sid}").status_code == 404
