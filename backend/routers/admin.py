"""Manutenção do deploy: popular o banco sem precisar de terminal. Só funciona com SEED_TOKEN definido na Vercel."""

import os
import secrets

from fastapi import APIRouter, HTTPException

from lib.db import db
from lib.routing import polyline_length_m
from lib.snap import looks_sane, nearest_point_on_polyline, snap_waypoints

router = APIRouter(prefix="/admin", tags=["admin"])


def _check(token: str) -> None:
    expected = os.environ.get("SEED_TOKEN", "")
    if not expected:  # sem a variável, a rota nem "existe"
        raise HTTPException(status_code=404, detail="Not Found")
    if not secrets.compare_digest(token.encode(), expected.encode()):
        raise HTTPException(status_code=403, detail="Token inválido")


async def _counts() -> dict:
    return {
        "bikelanes": await db.bikelanes.count_documents({}),
        "bikelanes_ajustadas_as_ruas": await db.bikelanes.count_documents({"snapped": True}),
        "obstacles": await db.obstacles.count_documents({}),
        "users": await db.users.count_documents({}),
    }


@router.get("/seed")
async def run_seed(token: str):
    """Cria ciclovias, alertas de exemplo e contas demo (idempotente — pode abrir mais de uma vez)."""
    _check(token)
    from seed import main  # import tardio: só carrega os dados quando a rota é usada

    await main(snap=False)  # ajustar às ruas chama um serviço externo e pode demorar: fica em /admin/snap
    return {"ok": True, **await _counts()}


@router.get("/snap")
async def run_snap(token: str, force: int = 0):
    """Cola as ciclovias nas ruas reais (roteador de bike). Idempotente; repita até `pendentes` chegar a 0.

    Para cada ciclovia que não colou, diz o motivo. `force=1` aceita o resultado do roteador mesmo quando ele
    parece grande demais (só use se o motivo for `resultado_suspeito` e o desenho no mapa ficar bom).
    """
    _check(token)
    detalhes: list[dict] = []
    done = 0
    async for lane in db.bikelanes.find({"snapped": {"$ne": True}}):
        waypoints = lane.get("waypoints") or lane["coordinates"]
        snapped = await snap_waypoints(waypoints)
        info: dict = {"id": lane["id"], "pontos_originais": len(waypoints)}
        if not snapped:
            info["motivo"] = "roteador_indisponivel"  # o OSRM público não respondeu: tente de novo em instantes
        elif not looks_sane(waypoints, snapped) and not force:
            info["motivo"] = "resultado_suspeito"
            info["km_linha_original"] = round(polyline_length_m(waypoints) / 1000, 2)
            info["km_pelas_ruas"] = round(polyline_length_m(snapped) / 1000, 2)
        else:
            km = round(polyline_length_m(snapped) / 1000, 2)
            await db.bikelanes.update_one(
                {"id": lane["id"]},
                {"$set": {"coordinates": snapped, "waypoints": waypoints, "snapped": True, "length_km": km}},
            )
            # alertas de exemplo passam a ficar exatamente sobre a via, como no ajuste automático
            async for o in db.obstacles.find({"id": {"$regex": f"^seed-{lane['id']}-"}}):
                lat, lng = nearest_point_on_polyline((o["lat"], o["lng"]), snapped)
                await db.obstacles.update_one({"id": o["id"]}, {"$set": {"lat": lat, "lng": lng}})
            done += 1
            continue
        detalhes.append(info)
    pending = await db.bikelanes.count_documents({"snapped": {"$ne": True}})
    return {"ok": True, "ajustadas_agora": done, "pendentes": pending, "detalhes": detalhes}


# ---- oficinas, borracharias e pontos de autorreparo (OpenStreetMap) ----

OVERPASS_URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
FORTALEZA_BBOX = "-3.92,-38.65,-3.68,-38.40"  # sul, oeste, norte, leste
OVERPASS_QUERY = f"""[out:json][timeout:40];
(
  nwr["shop"="bicycle"]({FORTALEZA_BBOX});
  nwr["shop"="tyres"]({FORTALEZA_BBOX});
  nwr["amenity"="bicycle_repair_station"]({FORTALEZA_BBOX});
  nwr["craft"="bicycle_repair"]({FORTALEZA_BBOX});
);
out center tags 400;"""


def _shop_from_osm(el: dict) -> dict | None:
    tags = el.get("tags") or {}
    lat = el.get("lat") or (el.get("center") or {}).get("lat")
    lng = el.get("lon") or (el.get("center") or {}).get("lon")
    if lat is None or lng is None:
        return None
    name = (tags.get("name") or "").strip()
    if tags.get("amenity") == "bicycle_repair_station":
        kind, name = "autoreparo", name or "Ponto de autorreparo"
    elif tags.get("shop") == "tyres" or "borrach" in name.lower():
        kind, name = "borracharia", name or "Borracharia"
    else:
        kind, name = "oficina", name or "Oficina de bicicletas"
    street = " ".join(x for x in [tags.get("addr:street", ""), tags.get("addr:housenumber", "")] if x)
    address = ", ".join(x for x in [street, tags.get("addr:suburb", "")] if x)
    return {
        "name": name[:80],
        "kind": kind,
        "lat": float(lat),
        "lng": float(lng),
        "address": address[:160],
        "phone": (tags.get("phone") or tags.get("contact:phone") or tags.get("contact:mobile") or "")[:20],
        "hours": (tags.get("opening_hours") or "")[:120],
        "website": (tags.get("website") or tags.get("contact:website") or "")[:200],
    }


@router.get("/import-shops")
async def import_shops(token: str):
    """Importa do OpenStreetMap as oficinas de bike, borracharias e pontos de autorreparo de Fortaleza.

    Idempotente: repetir atualiza os dados vindos do mapa e mantém avaliações e locais criados pela comunidade.
    """
    _check(token)
    import httpx
    from datetime import datetime, timezone

    elements: list[dict] | None = None
    last_error = ""
    async with httpx.AsyncClient(timeout=60, headers={"User-Agent": "VaiDeBike/1.0 (cycling safety app)"}) as client:
        for url in OVERPASS_URLS:
            try:
                r = await client.post(url, data={"data": OVERPASS_QUERY})
                r.raise_for_status()
                elements = r.json().get("elements", [])
                break
            except Exception as exc:  # noqa: BLE001
                last_error = type(exc).__name__
    if elements is None:
        return {"ok": False, "erro": "overpass_indisponivel", "detalhe": last_error}

    novos = atualizados = 0
    for el in elements:
        data = _shop_from_osm(el)
        if not data:
            continue
        osm_id = f"{el.get('type', 'node')}/{el.get('id')}"
        res = await db.shops.update_one(
            {"osm_id": osm_id},
            {
                "$set": data,
                "$setOnInsert": {
                    "id": f"osm-{osm_id.replace('/', '-')}",
                    "status": "ativo",
                    "source": "osm",
                    "added_by": "",
                    "added_by_name": "",
                    "description": "",
                    "rating_avg": 0.0,
                    "rating_count": 0,
                    "created_at": datetime.now(timezone.utc),
                },
            },
            upsert=True,
        )
        if res.upserted_id is not None:
            novos += 1
        else:
            atualizados += 1
    return {"ok": True, "encontrados": len(elements), "novos": novos, "atualizados": atualizados, "total_no_mapa": await db.shops.count_documents({"status": "ativo"})}
