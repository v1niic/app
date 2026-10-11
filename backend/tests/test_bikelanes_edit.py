"""Traçado de ciclovias: só a conta dev cria/apaga; qualquer um lê."""
import httpx

from tests.conftest import API_URL

LANE = {"name": "Teste Tscheck", "kind": "ciclofaixa", "waypoints": [[-3.7300, -38.5200], [-3.7310, -38.5210]]}


def test_list_is_public():
    r = httpx.get(f"{API_URL}/bikelanes", timeout=30.0)
    assert r.status_code == 200
    assert all("coordinates" in x for x in r.json())


def test_visitor_and_regular_user_cannot_create_or_delete():
    anon = httpx.Client(base_url=API_URL, timeout=30.0)
    assert anon.post("/bikelanes", json=LANE).status_code == 401
    assert anon.delete("/bikelanes/qualquer").status_code == 401
    import uuid

    u = httpx.Client(base_url=API_URL, timeout=30.0)
    assert u.post("/auth/register", json={"name": "Comum", "email": f"t_{uuid.uuid4().hex[:8]}@example.com", "password": "senha123"}).status_code == 200
    assert u.post("/bikelanes", json=LANE).status_code == 403
    assert u.delete("/bikelanes/qualquer").status_code == 403
