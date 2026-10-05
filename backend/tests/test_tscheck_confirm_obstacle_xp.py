"""Criterion: confirmar alerta de outro ciclista da +25 XP; confirmar o proprio e rejeitado."""
import uuid

import httpx

from tests.conftest import API_URL


def _register_fresh(c, label):
    """Fresh registered accounts for both author and confirmer so this test
    never mutates the shared demo seed account's XP/level."""
    email = f"tscheck-confirmxp-{label}-{uuid.uuid4().hex[:8]}@vaidebike.app"
    r = c.post(
        "/auth/register",
        json={"name": f"TSCheck {label}", "email": email, "password": "senha123", "bike_type": "urbana"},
    )
    assert r.status_code == 200, r.text
    return r.json(), email


def test_confirm_other_users_obstacle_awards_25_xp():
    # author registers a fresh account and creates a fresh obstacle
    with httpx.Client(base_url=API_URL, timeout=30.0) as author_c:
        author_c.post("/auth/register", json={
            "name": "TSCheck Author",
            "email": f"tscheck-confirmxp-author-{uuid.uuid4().hex[:8]}@vaidebike.app",
            "password": "senha123",
            "bike_type": "urbana",
        })
        desc = f"tscheck-confirm-{uuid.uuid4().hex[:6]} obstaculo para confirmacao"
        created = author_c.post(
            "/obstacles",
            json={
                "type": "obra",
                "severity": "media",
                "description": desc,
                "lat": -3.72,
                "lng": -38.51,
            },
        )
        assert created.status_code == 200, created.text
        obstacle_id = created.json()["obstacle"]["id"]
        author_c.post("/auth/logout")

    # confirmer is also a fresh account (not demo) to keep demo's seed state stable
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        confirmer_email = f"tscheck-confirmxp-confirmer-{uuid.uuid4().hex[:8]}@vaidebike.app"
        reg = c.post("/auth/register", json={
            "name": "TSCheck Confirmer",
            "email": confirmer_email,
            "password": "senha123",
            "bike_type": "urbana",
        })
        assert reg.status_code == 200, reg.text
        before = reg.json()
        resp = c.post(f"/obstacles/{obstacle_id}/confirm")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["obstacle"]["confirms"] == 1
        assert data["user"]["xp"] == before["xp"] + 25
        assert data["user"]["confirms_count"] == before["confirms_count"] + 1


def test_confirm_own_obstacle_rejected():
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        email = f"tscheck-confirmown-{uuid.uuid4().hex[:8]}@vaidebike.app"
        reg = c.post("/auth/register", json={
            "name": "TSCheck Own",
            "email": email,
            "password": "senha123",
            "bike_type": "urbana",
        })
        assert reg.status_code == 200, reg.text
        desc = f"tscheck-confirm-own-{uuid.uuid4().hex[:6]} proprio obstaculo"
        created = c.post(
            "/obstacles",
            json={
                "type": "buraco",
                "severity": "baixa",
                "description": desc,
                "lat": -3.73,
                "lng": -38.50,
            },
        )
        assert created.status_code == 200, created.text
        obstacle_id = created.json()["obstacle"]["id"]
        resp = c.post(f"/obstacles/{obstacle_id}/confirm")
        assert resp.status_code == 400
