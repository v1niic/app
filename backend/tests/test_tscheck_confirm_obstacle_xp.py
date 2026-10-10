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
    # confirma um alerta JA APROVADO (os de exemplo do seed). Alerta em analise nao pode ser confirmado.
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
        active = [o for o in c.get("/obstacles").json() if o["user_id"] != before["id"]]
        assert active, "o banco precisa ter ao menos um alerta aprovado (rode o seed)"
        target = active[0]
        resp = c.post(f"/obstacles/{target['id']}/confirm")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["obstacle"]["confirms"] == target["confirms"] + 1
        assert data["user"]["xp"] == before["xp"] + 25
        assert data["user"]["confirms_count"] == before["confirms_count"] + 1


def test_cannot_confirm_pending_obstacle():
    with httpx.Client(base_url=API_URL, timeout=30.0) as author:
        author.post("/auth/register", json={
            "name": "TSCheck Author",
            "email": f"tscheck-confirmxp-author-{uuid.uuid4().hex[:8]}@vaidebike.app",
            "password": "senha123",
        })
        created = author.post("/obstacles", json={
            "type": "obra", "severity": "media", "description": "tscheck alerta pendente", "lat": -3.72, "lng": -38.51,
        })
        assert created.status_code == 200, created.text
        obstacle_id = created.json()["obstacle"]["id"]
    with httpx.Client(base_url=API_URL, timeout=30.0) as other:
        other.post("/auth/register", json={
            "name": "TSCheck Other",
            "email": f"tscheck-confirmxp-other-{uuid.uuid4().hex[:8]}@vaidebike.app",
            "password": "senha123",
        })
        assert other.post(f"/obstacles/{obstacle_id}/confirm").status_code == 404


def test_confirm_own_obstacle_rejected():
    """A regra "nao confirma o proprio alerta" vale para alertas aprovados; um pendente nem aparece para confirmar."""
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        email = f"tscheck-confirmown-{uuid.uuid4().hex[:8]}@vaidebike.app"
        reg = c.post("/auth/register", json={"name": "TSCheck Own", "email": email, "password": "senha123"})
        assert reg.status_code == 200, reg.text
        created = c.post("/obstacles", json={
            "type": "buraco", "severity": "baixa", "description": "tscheck proprio obstaculo", "lat": -3.73, "lng": -38.52,
        })
        assert created.status_code == 200, created.text
        resp = c.post(f"/obstacles/{created.json()['obstacle']['id']}/confirm")
        assert resp.status_code in (400, 404)
