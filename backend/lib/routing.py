"""Roteamento de bicicleta (OSRM público do OpenStreetMap, perfil bike) + geocodificação (Nominatim).

Tudo é "melhor esforço": se o serviço externo estiver fora do ar ou bloqueado, as funções devolvem
None / lista vazia e quem chamou cai num fallback (linha reta). Nunca levantam exceção para a API.
"""

import logging
import math
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BIKE_ROUTER = "https://routing.openstreetmap.de/routed-bike/route/v1/driving"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "VaiDeBike-Fortaleza/1.0 (app de seguranca ciclista)"
TIMEOUT = httpx.Timeout(12.0, connect=6.0)

# Fortaleza (viewbox: oeste, norte, leste, sul) — enviesa a busca de endereços para a cidade.
FORTALEZA_VIEWBOX = "-38.65,-3.65,-38.40,-3.90"

_MODIFIERS_PT = {
    "left": "à esquerda",
    "right": "à direita",
    "slight left": "levemente à esquerda",
    "slight right": "levemente à direita",
    "sharp left": "acentuadamente à esquerda",
    "sharp right": "acentuadamente à direita",
    "straight": "em frente",
    "uturn": "retorno",
}

_cache: dict[str, tuple[float, Any]] = {}
CACHE_TTL_S = 600


def _cache_get(key: str) -> Any | None:
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_TTL_S:
        return hit[1]
    _cache.pop(key, None)
    return None


def _cache_put(key: str, value: Any) -> None:
    if len(_cache) > 500:  # evita crescer sem limite
        _cache.clear()
    _cache[key] = (time.monotonic(), value)


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6371000.0
    d_lat = math.radians(b[0] - a[0])
    d_lng = math.radians(b[1] - a[1])
    s = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(d_lng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(s))


def polyline_length_m(coords: list[list[float]]) -> float:
    return sum(haversine_m((a[0], a[1]), (b[0], b[1])) for a, b in zip(coords, coords[1:]))


def _instruction(step: dict) -> str:
    """Texto pt-BR da manobra a partir do `maneuver` do OSRM."""
    m = step.get("maneuver", {})
    kind = m.get("type", "")
    mod = _MODIFIERS_PT.get(m.get("modifier", ""), "")
    name = step.get("name") or ""
    onto = f" na {name}" if name else ""
    if kind == "depart":
        return f"Siga{(' pela ' + name) if name else ' em frente'}"
    if kind == "arrive":
        return "Você chegou ao destino"
    if kind in ("roundabout", "rotary", "roundabout turn"):
        return f"Entre na rotatória{onto}"
    if kind == "continue" or (kind == "turn" and m.get("modifier") == "straight"):
        return f"Continue em frente{onto}"
    if kind in ("turn", "end of road", "fork", "merge", "on ramp", "off ramp", "new name") and mod:
        verb = "Mantenha-se" if kind == "fork" else "Vire"
        return f"{verb} {mod}{onto}"
    return f"Siga em frente{onto}"


async def bike_route(points: list[tuple[float, float]]) -> dict | None:
    """Rota de bike passando por `points` ([(lat,lng), ...]). Retorna coordenadas [lat,lng], distância, duração e manobras."""
    if len(points) < 2:
        return None
    path = ";".join(f"{lng:.6f},{lat:.6f}" for lat, lng in points)
    key = f"route:{path}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    params = {"overview": "full", "geometries": "geojson", "steps": "true", "continue_straight": "false"}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}) as http:
            res = await http.get(f"{BIKE_ROUTER}/{path}", params=params)
        res.raise_for_status()
        data = res.json()
        route = data["routes"][0]
    except Exception as exc:  # rede/serviço indisponível, resposta inesperada, etc.
        logger.warning("bike_route falhou (%s): %s", type(exc).__name__, exc)
        return None

    coords = [[lat, lng] for lng, lat in route["geometry"]["coordinates"]]
    steps = []
    for leg in route.get("legs", []):
        for st in leg.get("steps", []):
            loc = st.get("maneuver", {}).get("location")
            if not loc:
                continue
            steps.append(
                {
                    "instruction": _instruction(st),
                    "name": st.get("name") or "",
                    "type": st.get("maneuver", {}).get("type", ""),
                    "modifier": st.get("maneuver", {}).get("modifier", ""),
                    "distance_m": round(st.get("distance", 0.0)),
                    "lat": loc[1],
                    "lng": loc[0],
                }
            )
    result = {
        "coordinates": coords,
        "distance_m": round(route.get("distance", polyline_length_m(coords))),
        "duration_s": round(route.get("duration", 0)),
        "steps": steps,
    }
    _cache_put(key, result)
    return result


async def geocode(query: str, limit: int = 5) -> list[dict]:
    """Busca de endereços/lugares em Fortaleza (Nominatim). Use com submit explícito, não autocomplete (política de uso)."""
    q = query.strip()
    if len(q) < 3:
        return []
    key = f"geo:{q.lower()}:{limit}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    params = {
        "q": q,
        "format": "jsonv2",
        "limit": str(limit),
        "countrycodes": "br",
        "viewbox": FORTALEZA_VIEWBOX,
        "bounded": "1",
        "accept-language": "pt-BR",
    }
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}) as http:
            res = await http.get(NOMINATIM, params=params)
        res.raise_for_status()
        items = res.json()
    except Exception as exc:
        logger.warning("geocode falhou (%s): %s", type(exc).__name__, exc)
        return []
    out = [
        {
            "name": (it.get("name") or it.get("display_name", "").split(",")[0]).strip(),
            "label": it.get("display_name", ""),
            "lat": float(it["lat"]),
            "lng": float(it["lon"]),
        }
        for it in items
        if "lat" in it and "lon" in it
    ]
    _cache_put(key, out)
    return out
