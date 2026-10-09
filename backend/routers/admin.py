"""Manutenção do deploy: popular o banco sem precisar de terminal. Só funciona com SEED_TOKEN definido na Vercel."""

import os
import secrets

from fastapi import APIRouter, HTTPException

from lib.db import db
from lib.snap import snap_pending_lanes

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
async def run_snap(token: str):
    """Cola as ciclovias nas ruas reais (roteador de bike). Idempotente; repita até `pendentes` chegar a 0."""
    _check(token)
    done = await snap_pending_lanes()
    pending = await db.bikelanes.count_documents({"snapped": {"$ne": True}})
    return {"ok": True, "ajustadas_agora": done, "pendentes": pending}
