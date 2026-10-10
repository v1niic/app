"""Criterion: pagina de missoes - badges, missions progress, leaderboard (community)."""
import httpx

from tests.conftest import API_URL


def test_badges_list_has_five_definitions(client):
    resp = client.get("/badges")
    assert resp.status_code == 200, resp.text
    badges = resp.json()
    ids = {b["id"] for b in badges}
    assert len(badges) == 5
    assert {"calouro_pedal", "olho_de_aguia", "guardiao_da_beira_mar"} <= ids


def test_missions_progress_for_demo_user():
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        login = c.post("/auth/login", json={"email": "demo@vaidebike.app", "password": "senha123"})
        assert login.status_code == 200, login.text
        resp = c.get("/missions")
        assert resp.status_code == 200, resp.text
        missions = {m["id"]: m for m in resp.json()}
        assert set(missions) == {"m1", "m2", "m3"}
        assert missions["m1"]["completed"] is True
        assert missions["m2"]["completed"] is True


def test_leaderboard_hides_seed_demo_accounts(client):
    """As contas de demonstração do seed não aparecem no placar nem na contagem de ciclistas."""
    resp = client.get("/leaderboard")
    assert resp.status_code == 200, resp.text
    names = [e["name"] for e in resp.json()]
    assert "Maria Pedalante" not in names and "Ciclista Demo" not in names
    ranks = [e["rank"] for e in resp.json()]
    assert ranks == list(range(1, len(ranks) + 1))
