"""Criterion: bikelanes seed returns 7 Fortaleza ciclovias/ciclofaixas."""


def test_bikelanes_returns_seven_fortaleza_lanes(client):
    resp = client.get("/bikelanes")
    assert resp.status_code == 200, resp.text
    lanes = resp.json()
    assert len(lanes) == 7
    kinds = {l["kind"] for l in lanes}
    assert kinds <= {"ciclovia", "ciclofaixa"}
    for lane in lanes:
        assert len(lane["coordinates"]) >= 2
