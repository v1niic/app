"""Gamification engine: XP, níveis, emblemas (selos) e missões."""

from lib.db import db
from lib.dates import utc_aware
from models.game import MissionProgress
from models.user import User

LEVEL_STEP = 500  # a cada 500 XP, um novo nível

BADGE_DEFS: list[dict] = [
    {"id": "calouro_pedal", "name": "Calouro do Pedal", "desc": "Cadastro realizado no VaiDeBike Fortaleza", "tier": "Bronze", "icon": "Bike"},
    {"id": "olho_de_aguia", "name": "Olho de Águia", "desc": "Reportou o 1º obstáculo na via", "tier": "Prata", "icon": "Eye"},
    {"id": "guardiao_da_beira_mar", "name": "Guardião da Beira-Mar", "desc": "Pedalou 25 km nas ciclovias de Fortaleza", "tier": "Ouro", "icon": "Waves"},
    {"id": "mestre_do_asfalto", "name": "Mestre do Asfalto", "desc": "Ajudou a mapear 10 pontos de alerta", "tier": "Platina", "icon": "ShieldCheck"},
    {"id": "centuriao_cearense", "name": "Centurião Cearense", "desc": "Completou 100 km monitorados", "tier": "Diamante", "icon": "Trophy"},
]

MISSION_DEFS: list[dict] = [
    {"id": "m1", "title": "Primeiro Alerta Cidadão", "desc": "Ajude outros ciclistas reportando 1 obstáculo, buraco ou obra", "target": 1, "metric": "reports", "reward_xp": 150, "badge_id": "olho_de_aguia"},
    {"id": "m2", "title": "Tour das Ciclovias", "desc": "Ative o modo GPS e percorra 15 km em Fortaleza", "target": 15, "metric": "km", "reward_xp": 300, "badge_id": "guardiao_da_beira_mar"},
    {"id": "m3", "title": "Sentinela Noturna", "desc": "Confirme 3 alertas de outros ciclistas na via", "target": 3, "metric": "confirms", "reward_xp": 250, "badge_id": "mestre_do_asfalto"},
]

_CONDITIONS: dict[str, object] = {
    "calouro_pedal": lambda u: True,
    "olho_de_aguia": lambda u: u.get("reports_count", 0) >= 1,
    "guardiao_da_beira_mar": lambda u: u.get("total_km", 0) >= 25,
    "mestre_do_asfalto": lambda u: u.get("reports_count", 0) >= 10,
    "centuriao_cearense": lambda u: u.get("total_km", 0) >= 100,
}

_METRICS: dict[str, object] = {
    "reports": lambda u: u.get("reports_count", 0),
    "km": lambda u: u.get("total_km", 0.0),
    "confirms": lambda u: u.get("confirms_count", 0),
}


def level_for_xp(xp: int) -> int:
    return xp // LEVEL_STEP + 1


def user_from_doc(doc: dict) -> User:
    data = dict(doc)
    created = utc_aware(data.get("created_at"))
    data["created_at"] = created if created else data.get("created_at")
    return User(**data)


async def apply_badges(user_doc: dict) -> tuple[dict, list[dict]]:
    """Check badge conditions and persist newly earned ones. Returns (doc, new_defs)."""
    earned = set(user_doc.get("badge_ids", []))
    new_defs: list[dict] = []
    for bd in BADGE_DEFS:
        if bd["id"] in earned:
            continue
        if _CONDITIONS[bd["id"]](user_doc):
            earned.add(bd["id"])
            new_defs.append(bd)
    if not new_defs:
        return user_doc, []
    user_doc["badge_ids"] = sorted(earned)
    await db.users.update_one({"id": user_doc["id"]}, {"$set": {"badge_ids": user_doc["badge_ids"]}})
    return user_doc, new_defs


def mission_progress(user_doc: dict | None) -> list[MissionProgress]:
    out: list[MissionProgress] = []
    for m in MISSION_DEFS:
        current = float(_METRICS[m["metric"]](user_doc)) if user_doc else 0.0
        out.append(
            MissionProgress(
                id=m["id"],
                title=m["title"],
                desc=m["desc"],
                target=float(m["target"]),
                metric=m["metric"],
                reward_xp=m["reward_xp"],
                badge_id=m["badge_id"],
                progress=current,
                completed=current >= m["target"],
            )
        )
    return out
