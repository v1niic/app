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
