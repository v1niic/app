"""Criterion: reportar obstaculo grava o alerta como pendente (em analise): sem XP e fora do mapa publico ate a conta dev aprovar."""
import uuid

import httpx

from tests.conftest import API_URL


def _register_fresh(c):
    """Use a freshly registered account (never the shared demo seed) so we
    don't mutate demo's XP/level across reruns."""
    email = f"tscheck-reportxp-{uuid.uuid4().hex[:8]}@vaidebike.app"
    r = c.post(
        "/auth/register",
        json={"name": "TSCheck ReportXP", "email": email, "password": "senha123", "bike_type": "urbana"},
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_report_obstacle_goes_to_review_queue_without_xp():
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        before = _register_fresh(c)
        desc = f"tscheck-report-{uuid.uuid4().hex[:6]} buraco grande perto da ciclovia"
        resp = c.post(
            "/obstacles",
            json={
                "type": "buraco",
                "severity": "alta",
                "description": desc,
                "lat": -3.7319,
                "lng": -38.5267,
            },
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["obstacle"]["description"] == desc
        assert data["obstacle"]["status"] == "pendente"
        assert data["obstacle"]["user_name"] == before["name"]  # o nome de quem reportou fica registrado
        # XP so vem na aprovacao
        assert data["user"]["xp"] == before["xp"]
        assert data["user"]["reports_count"] == before["reports_count"]

        # fora do mapa publico...
        public_ids = [o["id"] for o in c.get("/obstacles").json()]
        assert data["obstacle"]["id"] not in public_ids
        assert data["obstacle"]["id"] not in [o["id"] for o in c.get("/obstacles?status=todos").json()]
        # ...mas o autor acompanha o status
        mine = c.get("/obstacles?mine=1&status=todos").json()
        assert [o["status"] for o in mine if o["id"] == data["obstacle"]["id"]] == ["pendente"]

        # o autor pode retirar enquanto nao foi aprovado
        assert c.delete(f"/obstacles/{data['obstacle']['id']}").status_code == 200
        assert c.get("/obstacles?mine=1&status=todos").json() == []


def test_public_list_hides_pending_and_rejected_status_queries():
    with httpx.Client(base_url=API_URL, timeout=30.0) as visitor:
        assert visitor.get("/obstacles?status=pendente").status_code == 403
        assert visitor.get("/obstacles?status=recusado").status_code == 403


def test_pending_alerts_limit_per_user():
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        _register_fresh(c)
        body = {"type": "outros", "severity": "baixa", "description": "tscheck limite de fila", "lat": -3.73, "lng": -38.52}
        codes = [c.post("/obstacles", json=body).status_code for _ in range(11)]
        assert codes[:10] == [200] * 10 and codes[10] == 429


def test_report_obstacle_requires_auth():
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        resp = c.post(
            "/obstacles",
            json={
                "type": "buraco",
                "severity": "baixa",
                "description": "sem login tscheck",
                "lat": -3.73,
                "lng": -38.52,
            },
        )
        assert resp.status_code in (401, 403)


def test_report_with_photo_and_reject_fake_image():
    import base64
    import uuid

    import httpx

    from tests.conftest import API_URL

    c = httpx.Client(base_url=API_URL, timeout=30.0)
    c.post("/auth/register", json={"name": "Foto Teste", "email": f"foto_{uuid.uuid4().hex[:8]}@example.com", "password": "senha123"})
    body = {"type": "buraco", "severity": "media", "description": "tscheck com foto", "lat": -3.74, "lng": -38.5}
    jpeg = b"\xff\xd8\xff\xe0" + b"0" * 64
    ok = c.post("/obstacles", json={**body, "photos": ["data:image/jpeg;base64," + base64.b64encode(jpeg).decode()]})
    assert ok.status_code == 200, ok.text
    ids = ok.json()["obstacle"]["photo_ids"]
    assert len(ids) == 1
    got = httpx.get(f"{API_URL}/obstacles/photos/{ids[0]}", timeout=30.0)
    assert got.status_code == 200 and got.headers["content-type"] == "image/jpeg" and got.content == jpeg
    fake = c.post("/obstacles", json={**body, "photos": ["data:image/jpeg;base64," + base64.b64encode(b"<html>").decode()]})
    assert fake.status_code == 422
    too_many = c.post("/obstacles", json={**body, "photos": ["data:image/jpeg;base64,AAAA"] * 4})
    assert too_many.status_code == 422
    # retirar o alerta apaga a foto
    assert c.delete(f"/obstacles/{ok.json()['obstacle']['id']}").status_code == 200
    assert httpx.get(f"{API_URL}/obstacles/photos/{ids[0]}", timeout=30.0).status_code == 404
