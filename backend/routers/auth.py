import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from lib.auth import (
    token_from,
    end_session,
    get_current_user,
    hash_password,
    start_session,
    verify_password,
)
from lib.db import db
from lib.game import apply_badges, level_for_xp, user_from_doc
from models.user import AccountDelete, LoginRequest, OnboardingUpdate, PasswordChange, ProfileUpdate, RegisterRequest, User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=User)
async def register(req: RegisterRequest, response: Response):
    email = req.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Este e-mail já está cadastrado")
    doc = {
        "id": str(uuid.uuid4()),
        "name": req.name.strip(),
        "email": email,
        "bio": "",
        "bike_type": req.bike_type or "urbana",
        "avatar": "",
        "onboarded": False,
        "city": "Fortaleza",
        "xp": 0,
        "level": 1,
        "total_km": 0.0,
        "reports_count": 0,
        "confirms_count": 0,
        "badge_ids": [],
        "password_hash": hash_password(req.password),
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(doc)
    doc, _ = await apply_badges(doc)  # emblema "Calouro do Pedal" vem de graça no cadastro
    await start_session(response, doc["id"])
    return user_from_doc(doc)


@router.post("/login", response_model=User)
async def login(req: LoginRequest, response: Response):
    user = await db.users.find_one({"email": req.email.lower()})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    await start_session(response, user["id"])
    return user_from_doc(user)


@router.post("/logout")
async def logout(request: Request, response: Response):
    await end_session(request, response)
    return {"ok": True}


@router.get("/me", response_model=User | None)
async def me(user: dict | None = Depends(get_current_user)):
    """200 com `null` para visitantes — a página inicial não deve encher o console de 401s."""
    return user_from_doc(user) if user else None


@router.put("/me", response_model=User)
async def update_me(req: ProfileUpdate, user: dict = Depends(get_current_user)):
    if user is None:
        raise HTTPException(status_code=401, detail="Não autenticado")
    updates: dict = {}
    if req.name is not None and req.name.strip():
        updates["name"] = req.name.strip()
    if req.bio is not None:
        updates["bio"] = req.bio.strip()[:280]
    if req.bike_type is not None:
        updates["bike_type"] = req.bike_type
    if req.avatar is not None:
        updates["avatar"] = req.avatar
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    fresh = await db.users.find_one({"id": user["id"]})
    return user_from_doc(fresh)


@router.post("/password")
async def change_password(req: PasswordChange, request: Request, user: dict = Depends(get_current_user)):
    if user is None:
        raise HTTPException(status_code=401, detail="Não autenticado")
    if not verify_password(req.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="A senha atual está incorreta")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(req.new_password)}})
    # encerra os outros aparelhos; esta sessão continua ativa
    await db.sessions.delete_many({"user_id": user["id"], "token": {"$ne": token_from(request)}})
    return {"ok": True}


@router.post("/delete-account")
async def delete_account(req: AccountDelete, request: Request, response: Response, user: dict = Depends(get_current_user)):
    """Exclusão definitiva (LGPD): apaga conta, sessões e histórico de pedais. Alertas reportados ficam para a comunidade."""
    if user is None:
        raise HTTPException(status_code=401, detail="Não autenticado")
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Senha incorreta")
    await db.sessions.delete_many({"user_id": user["id"]})
    await db.rides.delete_many({"user_id": user["id"]})
    await db.chat_messages.delete_many({"user_id": user["id"]})
    await db.meetups.delete_many({"user_id": user["id"]})
    await db.meetups.update_many(
        {"going_ids": user["id"]}, {"$pull": {"going_ids": user["id"], "going_names": user["name"]}}
    )
    await db.users.delete_one({"id": user["id"]})
    response.delete_cookie("vdb_session", path="/")
    return {"ok": True}


@router.post("/onboarding", response_model=User)
async def set_onboarding(req: OnboardingUpdate, user: dict = Depends(get_current_user)):
    """Marca a tela de boas-vindas como vista (`done=true`) ou manda mostrar de novo (`done=false`)."""
    if user is None:
        raise HTTPException(status_code=401, detail="Não autenticado")
    await db.users.update_one({"id": user["id"]}, {"$set": {"onboarded": req.done}})
    return user_from_doc(await db.users.find_one({"id": user["id"]}))
