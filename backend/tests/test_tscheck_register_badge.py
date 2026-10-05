"""Criterion: Cadastro de novo ciclista concede o emblema inicial."""
import uuid

import pytest


def test_register_new_user_gets_calouro_badge(client):
    email = f"tscheck-register-{uuid.uuid4().hex[:8]}@vaidebike.app"
    resp = client.post(
        "/auth/register",
        json={
            "name": "Tester TSCheck",
            "email": email,
            "password": "senha123",
            "bike_type": "urbana",
        },
    )
    assert resp.status_code == 200, resp.text
    user = resp.json()
    assert user["email"] == email
    assert user["level"] == 1
    assert "calouro_pedal" in user["badge_ids"]
    assert len(user["badge_ids"]) == 1


def test_register_duplicate_email_rejected(client):
    email = f"tscheck-register-dup-{uuid.uuid4().hex[:8]}@vaidebike.app"
    body = {
        "name": "Tester Dup",
        "email": email,
        "password": "senha123",
        "bike_type": "urbana",
    }
    r1 = client.post("/auth/register", json=body)
    assert r1.status_code == 200, r1.text
    r2 = client.post("/auth/register", json=body)
    assert r2.status_code >= 400
