"""Caixa de alertas: só a conta dev analisa. Aprovar publica no mapa (com o nome de quem reportou) e dá o XP.

Os testes que precisam da conta dev leem MODERATOR_TEST_EMAIL e MODERATOR_TEST_PASSWORD (e o servidor precisa ter
MODERATOR_EMAILS com esse e-mail). Sem isso eles são ignorados, e os testes de acesso negado continuam rodando.
"""
import os
import uuid

import httpx
import pytest

from tests.conftest import API_URL

MOD_EMAIL = os.environ.get("MODERATOR_TEST_EMAIL", "")
MOD_PASSWORD = os.environ.get("MODERATOR_TEST_PASSWORD", "")

needs_moderator = pytest.mark.skipif(
    not (MOD_EMAIL and MOD_PASSWORD), reason="defina MODERATOR_TEST_EMAIL e MODERATOR_TEST_PASSWORD"
)

REPORT = {"type": "buraco", "severity": "media", "description": "tscheck alerta para analise", "lat": -3.7401, "lng": -38.5011}


def _author() -> tuple[httpx.Client, dict]:
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    r = c.post(
        "/auth/register",
        json={"name": "Autora Teste", "email": f"mod-{uuid.uuid4().hex[:10]}@vaidebike.app", "password": "senha123"},
    )
    assert r.status_code == 200, r.text
    return c, r.json()


def _moderator() -> httpx.Client:
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    r = c.post("/auth/login", json={"email": MOD_EMAIL, "password": MOD_PASSWORD})
    assert r.status_code == 200, r.text
    assert r.json()["is_moderator"] is True, "o e-mail precisa estar em MODERATOR_EMAILS (e a senha padrão trocada)"
    return c


def test_moderation_is_closed_to_visitors_and_regular_users():
    with httpx.Client(base_url=API_URL, timeout=30.0) as visitor:
        assert visitor.get("/moderation/queue").status_code == 401
        assert visitor.get("/moderation/summary").status_code == 401
    author, user = _author()
    try:
        assert user["is_moderator"] is False
        report = author.post("/obstacles", json=REPORT).json()["obstacle"]
        assert author.get("/moderation/queue").status_code == 403
        assert author.get("/moderation/summary").status_code == 403
        # nem o próprio autor consegue se aprovar
        assert author.post(f"/moderation/{report['id']}/approve").status_code == 403
        assert author.post(f"/moderation/{report['id']}/reject", json={"reason": "x"}).status_code == 403
    finally:
        author.close()


def test_demo_seed_account_is_not_moderator_with_default_password():
    """Trava de segurança: a conta demo tem senha pública, então só vira gestora depois de trocar a senha."""
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        r = c.post("/auth/login", json={"email": "demo@vaidebike.app", "password": "senha123"})
        if r.status_code != 200:
            pytest.skip("a senha da conta demo já foi trocada (o esperado em produção)")
        assert r.json()["is_moderator"] is False
        assert c.get("/moderation/queue").status_code == 403


@needs_moderator
def test_moderator_approves_report_publishes_it_and_awards_xp_once():
    author, user = _author()
    mod = _moderator()
    try:
        report = author.post("/obstacles", json=REPORT).json()["obstacle"]
        queue = mod.get("/moderation/queue").json()
        item = next(i for i in queue if i["id"] == report["id"])
        assert item["user_name"] == "Autora Teste"
        assert "nearby_same_type" in item

        approved = mod.post(f"/moderation/{report['id']}/approve", json={"severity": "alta"})
        assert approved.status_code == 200, approved.text
        body = approved.json()
        assert body["status"] == "ativo" and body["severity"] == "alta"
        assert body["user_name"] == "Autora Teste"  # o nome de quem reportou vai para o mapa

        # aparece no mapa público
        public = {o["id"]: o for o in httpx.get(f"{API_URL}/obstacles", timeout=30.0).json()}
        assert public[report["id"]]["user_name"] == "Autora Teste"

        # XP só uma vez
        me = author.get("/auth/me").json()
        assert me["xp"] == user["xp"] + 50 and me["reports_count"] == user["reports_count"] + 1
        assert mod.post(f"/moderation/{report['id']}/approve").status_code == 404
        assert author.get("/auth/me").json()["xp"] == user["xp"] + 50
    finally:
        author.close()
        mod.close()


@needs_moderator
def test_moderator_rejects_with_reason_then_can_reconsider():
    author, user = _author()
    mod = _moderator()
    try:
        report = author.post("/obstacles", json=REPORT).json()["obstacle"]
        rejected = mod.post(f"/moderation/{report['id']}/reject", json={"reason": "Local incorreto"})
        assert rejected.status_code == 200, rejected.text

        mine = {o["id"]: o for o in author.get("/obstacles?mine=1&status=todos").json()}
        assert mine[report["id"]]["status"] == "recusado"
        assert mine[report["id"]]["reject_reason"] == "Local incorreto"
        assert report["id"] not in [o["id"] for o in httpx.get(f"{API_URL}/obstacles", timeout=30.0).json()]
        assert author.get("/auth/me").json()["xp"] == user["xp"]  # recusado não dá XP

        # a recusa pode ser revista: aprovar um recusado publica e paga o XP
        assert mod.post(f"/moderation/{report['id']}/approve").status_code == 200
        assert author.get("/auth/me").json()["xp"] == user["xp"] + 50
    finally:
        author.close()
        mod.close()


@needs_moderator
def test_moderator_own_reports_are_published_directly():
    mod = _moderator()
    try:
        created = mod.post("/obstacles", json=REPORT)
        assert created.status_code == 200, created.text
        assert created.json()["obstacle"]["status"] == "ativo"
        # limpeza: marca como resolvido para não poluir o mapa de teste
        mod.post(f"/obstacles/{created.json()['obstacle']['id']}/resolve")
    finally:
        mod.close()
