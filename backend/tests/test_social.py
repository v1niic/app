"""Seguir ciclistas, trocar e-mail e desativar a conta."""
import uuid

import httpx

from tests.conftest import API_URL


def _new_user(prefix: str = "tscheck") -> tuple[httpx.Client, dict, str]:
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    email = f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"
    r = c.post("/auth/register", json={"name": f"Ciclista {uuid.uuid4().hex[:5]}", "email": email, "password": "senha123"})
    assert r.status_code == 200, r.text
    return c, r.json(), email


def test_follow_unfollow_and_counts():
    a, ua, _ = _new_user()
    b, ub, _ = _new_user()
    assert a.post(f"/social/people/{ub['id']}/follow").json()["is_following"] is True
    assert a.post(f"/social/people/{ub['id']}/follow").status_code == 200  # repetir não duplica
    pb = b.get(f"/social/people/{ub['id']}").json()
    assert pb["followers_count"] == 1
    assert [p["id"] for p in b.get(f"/social/people/{ub['id']}/followers").json()] == [ua["id"]]
    assert b.get(f"/social/people/{ua['id']}").json()["follows_me"] is True  # ela segue b
    assert a.get(f"/social/people/{ub['id']}").json()["follows_me"] is False
    assert b.get(f"/social/people/{ua['id']}").json()["is_following"] is False
    assert a.delete(f"/social/people/{ub['id']}/follow").json()["is_following"] is False
    assert b.get(f"/social/people/{ub['id']}").json()["followers_count"] == 0


def test_cannot_follow_self_and_public_profile_hides_email():
    a, ua, _ = _new_user()
    assert a.post(f"/social/people/{ua['id']}/follow").status_code == 400
    assert "email" not in a.get(f"/social/people/{ua['id']}").json()


def test_social_requires_login():
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    assert c.get("/social/people").status_code == 401


def test_change_email():
    a, _, old = _new_user()
    _, _, taken = _new_user()
    assert a.post("/auth/email", json={"new_email": taken, "password": "senha123"}).status_code == 400
    assert a.post("/auth/email", json={"new_email": f"n_{uuid.uuid4().hex[:8]}@example.com", "password": "errada"}).status_code == 400
    new = f"n_{uuid.uuid4().hex[:8]}@example.com"
    assert a.post("/auth/email", json={"new_email": new, "password": "senha123"}).json()["email"] == new
    fresh = httpx.Client(base_url=API_URL, timeout=30.0)
    assert fresh.post("/auth/login", json={"email": old, "password": "senha123"}).status_code == 401
    assert fresh.post("/auth/login", json={"email": new, "password": "senha123"}).status_code == 200


def test_deactivate_hides_account_and_login_reactivates():
    a, ua, email = _new_user()
    b, _, _ = _new_user()
    assert a.post("/auth/deactivate", json={"password": "errada"}).status_code == 400
    assert a.post("/auth/deactivate", json={"password": "senha123"}).status_code == 200
    assert b.get(f"/social/people/{ua['id']}").status_code == 404
    assert b.post(f"/social/people/{ua['id']}/follow").status_code == 404
    back = httpx.Client(base_url=API_URL, timeout=30.0)
    assert back.post("/auth/login", json={"email": email, "password": "senha123"}).status_code == 200
    assert b.get(f"/social/people/{ua['id']}").status_code == 200
