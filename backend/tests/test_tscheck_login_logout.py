"""Criterion: login demo + logout cleans session (GET /auth/me reflects state)."""
import httpx

from tests.conftest import API_URL


def test_login_demo_then_logout_clears_session():
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        # visitor -> me is 200/null
        me_before = c.get("/auth/me")
        assert me_before.status_code == 200
        assert me_before.json() is None

        login = c.post("/auth/login", json={"email": "demo@vaidebike.app", "password": "senha123"})
        assert login.status_code == 200, login.text
        user = login.json()
        assert user["email"] == "demo@vaidebike.app"
        assert user["level"] >= 2  # demo seed is Nível 2; never asserted as an exact
        # upper bound here since other criteria intentionally award demo XP via the API

        me_after = c.get("/auth/me")
        assert me_after.status_code == 200
        assert me_after.json()["email"] == "demo@vaidebike.app"

        logout = c.post("/auth/logout")
        assert logout.status_code == 200, logout.text

        me_final = c.get("/auth/me")
        assert me_final.status_code == 200
        assert me_final.json() is None
