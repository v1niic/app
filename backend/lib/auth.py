"""Cookie sessions + password hashing. Sessions live in the `sessions` collection."""

import os
import uuid
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, Response
from passlib.context import CryptContext

from lib.db import db
from lib.roles import is_moderator

COOKIE_NAME = "vdb_session"
COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 dias
TOKEN_HEADER = "X-Session-Token"
# Em produção (HTTPS) o cookie só viaja criptografado.
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "1" if os.environ.get("VERCEL") else "0") == "1"

# pbkdf2_sha256: pure-python, no native-binding surprises in the pod.
pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(raw: str) -> str:
    return pwd.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    return pwd.verify(raw, hashed)


def token_from(request: Request) -> str | None:
    """Web usa o cookie httpOnly; o app móvel (outra origem) manda `Authorization: Bearer <token>`."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer ") and auth[7:].strip():
        return auth[7:].strip()
    return request.cookies.get(COOKIE_NAME)


async def start_session(response: Response, user_id: str) -> None:
    token = str(uuid.uuid4())
    await db.sessions.insert_one(
        {"token": token, "user_id": user_id, "created_at": datetime.now(timezone.utc)}
    )
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        path="/",
    )
    response.headers[TOKEN_HEADER] = token  # lido pelo app móvel (CORS expõe este header)


async def end_session(request: Request, response: Response) -> None:
    token = token_from(request)
    if token:
        await db.sessions.delete_one({"token": token})
    response.delete_cookie(COOKIE_NAME, path="/")


async def get_current_user(request: Request) -> dict | None:
    token = token_from(request)
    if not token:
        return None
    session = await db.sessions.find_one({"token": token})
    if not session:
        return None
    return await db.users.find_one({"id": session["user_id"]})


async def require_user(user: dict | None = Depends(get_current_user)) -> dict:
    if user is None:
        raise HTTPException(status_code=401, detail="Faça login para continuar")
    return user


async def require_moderator(user: dict = Depends(require_user)) -> dict:
    """Só a conta dev (MODERATOR_EMAILS). 403 para qualquer outro usuário logado."""
    if not is_moderator(user):
        raise HTTPException(status_code=403, detail="Área restrita à equipe do VaiDeBike")
    return user
