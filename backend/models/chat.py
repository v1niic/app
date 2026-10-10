from datetime import datetime

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    id: str
    user_id: str
    user_name: str
    user_level: int = 1
    text: str
    created_at: datetime


class ChatCreate(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class Meetup(BaseModel):
    id: str
    user_id: str
    user_name: str
    title: str
    place: str
    description: str = ""
    starts_at: datetime
    going_count: int = 0
    going: bool = False  # o usuário logado confirmou presença
    going_names: list[str] = Field(default_factory=list)  # até 5 primeiros nomes


class MeetupCreate(BaseModel):
    title: str = Field(min_length=3, max_length=80)
    place: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=300)
    starts_at: datetime
