"""Recuperação de senha: a resposta nunca revela se o e-mail existe, e links inválidos são recusados."""
import uuid

import httpx

from tests.conftest import API_URL


def _client() -> httpx.Client:
    return httpx.Client(base_url=API_URL, timeout=30.0)


def test_forgot_same_answer_for_unknown_and_known_email():
    c = _client()
    email = f"tscheck_{uuid.uuid4().hex[:8]}@example.com"
    c.post("/auth/register", json={"name": "Reset Teste", "email": email, "password": "senha123"})
    known = c.post("/auth/forgot", json={"email": email})
    unknown = c.post("/auth/forgot", json={"email": f"nao_{uuid.uuid4().hex[:8]}@example.com"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()


def test_reset_with_invalid_token_is_rejected():
    c = _client()
    r = c.post("/auth/reset", json={"token": "x" * 43, "new_password": "novasenha1"})
    assert r.status_code == 400


def test_reset_rejects_short_password():
    c = _client()
    r = c.post("/auth/reset", json={"token": "x" * 43, "new_password": "123"})
    assert r.status_code == 422
