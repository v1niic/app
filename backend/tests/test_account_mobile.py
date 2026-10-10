"""Conta e app móvel: login por Bearer token, troca de senha, histórico de pedais, exclusão de conta, health."""
import uuid

import httpx

from tests.conftest import API_URL


def _register(c: httpx.Client) -> tuple[dict, str, str]:
    email = f"teste-{uuid.uuid4().hex[:10]}@vaidebike.app"
    res = c.post("/auth/register", json={"name": "Teste Conta", "email": email, "password": "senha123"})
    assert res.status_code == 200, res.text
    return res.json(), email, res.headers["x-session-token"]


def test_health_reports_database():
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        body = c.get("/health").json()
        assert body["ok"] is True and body["db"] == "up"


def test_bearer_token_replaces_cookie_for_mobile():
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        _, _, token = _register(c)
    with httpx.Client(base_url=API_URL, timeout=30.0) as fresh:  # sem cookie algum
        assert fresh.get("/auth/me").json() is None
        me = fresh.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.json()["name"] == "Teste Conta"
        assert fresh.post("/auth/logout", headers={"Authorization": f"Bearer {token}"}).status_code == 200
        assert fresh.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).json() is None


def test_change_password_then_login_with_new_one():
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        _, email, _ = _register(c)
        wrong = c.post("/auth/password", json={"current_password": "errada", "new_password": "novasenha1"})
        assert wrong.status_code == 400
        ok = c.post("/auth/password", json={"current_password": "senha123", "new_password": "novasenha1"})
        assert ok.status_code == 200, ok.text
    with httpx.Client(base_url=API_URL, timeout=30.0) as c2:
        assert c2.post("/auth/login", json={"email": email, "password": "senha123"}).status_code == 401
        assert c2.post("/auth/login", json={"email": email, "password": "novasenha1"}).status_code == 200


def test_ride_history_and_delete_account():
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        _, email, _ = _register(c)
        assert c.post("/rides", json={"km": 3.2}).status_code == 200
        rides = c.get("/rides").json()
        assert len(rides) == 1 and rides[0]["km"] == 3.2 and rides[0]["xp"] == 32

        assert c.post("/auth/delete-account", json={"password": "errada"}).status_code == 400
        assert c.post("/auth/delete-account", json={"password": "senha123"}).status_code == 200
        assert c.get("/auth/me").json() is None
        assert c.post("/auth/login", json={"email": email, "password": "senha123"}).status_code == 401


_PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="


def test_avatar_upload_validation_and_removal():
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        user, _, _ = _register(c)
        assert user["avatar"] == ""
        ok = c.put("/auth/me", json={"avatar": _PIXEL})
        assert ok.status_code == 200 and ok.json()["avatar"] == _PIXEL
        assert c.get("/auth/me").json()["avatar"] == _PIXEL
        # só imagens pequenas em data URL são aceitas
        assert c.put("/auth/me", json={"avatar": "https://exemplo.com/foto.png"}).status_code == 422
        assert c.put("/auth/me", json={"avatar": "data:image/png;base64," + "A" * 200_000}).status_code == 422
        assert c.put("/auth/me", json={"avatar": ""}).json()["avatar"] == ""


def test_onboarding_flag_roundtrip():
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        user, _, _ = _register(c)
        assert user["onboarded"] is False
        assert c.post("/auth/onboarding", json={"done": True}).json()["onboarded"] is True
        assert c.get("/auth/me").json()["onboarded"] is True
        assert c.post("/auth/onboarding", json={"done": False}).json()["onboarded"] is False
    with httpx.Client(base_url=API_URL, timeout=30.0) as visitor:
        assert visitor.post("/auth/onboarding", json={"done": True}).status_code == 401
