from fastapi import APIRouter

from lib.db import db
from models.bikelane import BikeLane

router = APIRouter(prefix="/bikelanes", tags=["bikelanes"])


@router.get("", response_model=list[BikeLane])
async def list_bikelanes():
    docs = await db.bikelanes.find().sort("length_km", -1).to_list(200)
    return [BikeLane(**d) for d in docs]
