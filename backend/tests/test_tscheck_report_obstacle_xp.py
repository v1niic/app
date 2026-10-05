"""Criterion: reportar obstaculo grava alerta e da +50 XP."""
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


def test_report_obstacle_awards_50_xp_and_appears_in_list():
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
        assert data["obstacle"]["status"] == "ativo"
        assert data["user"]["xp"] == before["xp"] + 50
        assert data["user"]["reports_count"] == before["reports_count"] + 1

        listing = c.get("/obstacles")
        assert listing.status_code == 200
        ids = [o["id"] for o in listing.json()]
        assert data["obstacle"]["id"] in ids


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
