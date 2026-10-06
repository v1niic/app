from fastapi import APIRouter, Query
from pydantic import BaseModel

from lib.routing import bike_route, geocode, haversine_m, polyline_length_m

router = APIRouter(tags=["routing"])

BIKE_SPEED_MS = 15 / 3.6  # fallback quando o roteador não responde: 15 km/h


class RouteStep(BaseModel):
    instruction: str
    name: str = ""
    type: str = ""
    modifier: str = ""
    distance_m: int
    lat: float
    lng: float


class RouteResult(BaseModel):
    coordinates: list[list[float]]  # pares [lat, lng]
    distance_m: int
    duration_s: int
    steps: list[RouteStep]
    source: str  # "bike" = rota real por ruas; "straight" = fallback em linha reta


class Place(BaseModel):
    name: str
    label: str
    lat: float
    lng: float


@router.get("/route", response_model=RouteResult)
async def get_route(
    from_lat: float = Query(ge=-90, le=90),
    from_lng: float = Query(ge=-180, le=180),
    to_lat: float = Query(ge=-90, le=90),
    to_lng: float = Query(ge=-180, le=180),
):
    route = await bike_route([(from_lat, from_lng), (to_lat, to_lng)])
    if route:
        return RouteResult(**route, source="bike")
    # Fallback: linha reta, para o app seguir funcionando mesmo sem o roteador externo.
    coords = [[from_lat, from_lng], [to_lat, to_lng]]
    dist = round(haversine_m((from_lat, from_lng), (to_lat, to_lng)))
    return RouteResult(
        coordinates=coords,
        distance_m=dist,
        duration_s=round(dist / BIKE_SPEED_MS),
        steps=[
            RouteStep(instruction="Siga em direção ao destino", distance_m=dist, lat=from_lat, lng=from_lng, type="depart"),
            RouteStep(instruction="Você chegou ao destino", distance_m=0, lat=to_lat, lng=to_lng, type="arrive"),
        ],
        source="straight",
    )


@router.get("/geocode", response_model=list[Place])
async def search_places(q: str = Query(min_length=3, max_length=120)):
    return [Place(**p) for p in await geocode(q)]
