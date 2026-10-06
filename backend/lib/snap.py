"""Ajusta (snap) as ciclovias às ruas reais.

As ciclovias do seed têm só 3–6 pontos digitados à mão; ligados em linha reta eles cortam quarteirões
e o mar (os "traços longos" no mapa). Aqui pedimos ao roteador de bike a geometria real passando por
esses pontos e guardamos a polilinha densa em `coordinates`. Os pontos originais ficam em `waypoints`.
"""

import logging

from lib.db import db
from lib.routing import bike_route, haversine_m, polyline_length_m

logger = logging.getLogger(__name__)

MAX_WAYPOINTS_PER_REQUEST = 25


def nearest_point_on_polyline(point: tuple[float, float], line: list[list[float]]) -> tuple[float, float]:
    """Ponto da polilinha mais próximo de `point` (projeção em plano local — suficiente para distâncias de cidade)."""
    import math

    lat0 = math.radians(point[0])
    kx = 111320.0 * math.cos(lat0)  # metros por grau de longitude
    ky = 110540.0  # metros por grau de latitude
    px, py = point[1] * kx, point[0] * ky
    best = (line[0][0], line[0][1])
    best_d = float("inf")
    for a, b in zip(line, line[1:]):
        ax, ay, bx, by = a[1] * kx, a[0] * ky, b[1] * kx, b[0] * ky
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        t = 0.0 if seg2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
        cx, cy = ax + t * dx, ay + t * dy
        d = (px - cx) ** 2 + (py - cy) ** 2
        if d < best_d:
            best_d = d
            best = (cy / ky, cx / kx)
    return best


async def snap_waypoints(waypoints: list[list[float]]) -> list[list[float]] | None:
    """Rota de bike por todos os waypoints (em blocos, com 1 ponto de sobreposição). None se o roteador falhar."""
    pts = [(p[0], p[1]) for p in waypoints]
    if len(pts) < 2:
        return None
    merged: list[list[float]] = []
    i = 0
    while i < len(pts) - 1:
        chunk = pts[i : i + MAX_WAYPOINTS_PER_REQUEST]
        route = await bike_route(chunk)
        if not route or len(route["coordinates"]) < 2:
            return None
        coords = route["coordinates"]
        merged.extend(coords if not merged else coords[1:])
        i += len(chunk) - 1
    return merged


def looks_sane(raw: list[list[float]], snapped: list[list[float]]) -> bool:
    """Descarta um snap absurdo (ex.: desvio enorme): o comprimento não pode passar de ~2,5x o da linha reta."""
    raw_len = polyline_length_m(raw)
    if raw_len <= 0:
        return False
    return polyline_length_m(snapped) <= raw_len * 2.5 + 200 and haversine_m(
        (raw[0][0], raw[0][1]), (snapped[0][0], snapped[0][1])
    ) < 500


async def snap_lane_doc(lane: dict) -> bool:
    """Ajusta uma ciclovia do banco. Retorna True se gravou geometria nova."""
    waypoints = lane.get("waypoints") or lane["coordinates"]
    snapped = await snap_waypoints(waypoints)
    if not snapped or not looks_sane(waypoints, snapped):
        logger.warning("snap da ciclovia %s não aplicado (roteador indisponível ou resultado suspeito)", lane["id"])
        return False
    km = round(polyline_length_m(snapped) / 1000, 2)
    await db.bikelanes.update_one(
        {"id": lane["id"]},
        {"$set": {"coordinates": snapped, "waypoints": waypoints, "snapped": True, "length_km": km}},
    )
    # alertas de exemplo (ids "seed-<lane>-<tipo>") passam a ficar exatamente sobre a via
    async for o in db.obstacles.find({"id": {"$regex": f"^seed-{lane['id']}-"}}):
        lat, lng = nearest_point_on_polyline((o["lat"], o["lng"]), snapped)
        await db.obstacles.update_one({"id": o["id"]}, {"$set": {"lat": lat, "lng": lng}})
    logger.info("ciclovia %s ajustada às ruas: %d pontos, %.2f km", lane["id"], len(snapped), km)
    return True


async def snap_pending_lanes() -> int:
    """Ajusta todas as ciclovias ainda não ajustadas. Melhor esforço — nunca levanta exceção."""
    done = 0
    try:
        async for lane in db.bikelanes.find({"snapped": {"$ne": True}}):
            if await snap_lane_doc(lane):
                done += 1
    except Exception as exc:
        logger.warning("snap_pending_lanes interrompido: %s", exc)
    return done
