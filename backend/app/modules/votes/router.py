from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.models import Answer, Problem, User, Vote

router = APIRouter(prefix="/votes", tags=["votes"])

# Reputacja autora za głos (jak na Stack Overflow, uproszczone)
REP = {("answer", 1): 10, ("answer", -1): -2, ("problem", 1): 5, ("problem", -1): -2}


class VoteIn(BaseModel):
    target_type: Literal["problem", "answer"]
    target_id: int
    value: Literal[-1, 0, 1]  # 0 = cofnięcie głosu


class VoteOut(BaseModel):
    target_type: str
    target_id: int
    score: int
    upvotes: int
    downvotes: int
    my_vote: int


def apply_vote(target, author: User, target_type: str, old: int, new: int) -> None:
    """Czysta aktualizacja liczników – testowalna bez bazy."""
    if old == new:
        return
    if old == 1:
        target.upvotes -= 1
    elif old == -1:
        target.downvotes -= 1
    if new == 1:
        target.upvotes += 1
    elif new == -1:
        target.downvotes += 1
    target.score = target.upvotes - target.downvotes
    author.reputation += REP.get((target_type, new), 0) - REP.get((target_type, old), 0)


@router.post("", response_model=VoteOut)
def vote(data: VoteIn, user: CurrentUser, db: DbSession):
    model = Problem if data.target_type == "problem" else Answer
    # Blokada wiersza (PG) chroni liczniki przed równoległymi głosami
    lock = {"of": model} if db.bind.dialect.name == "postgresql" else None
    target = db.get(model, data.target_id, with_for_update=lock)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nie znaleziono obiektu")
    if target.author_id == user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Nie można głosować na własny wpis")

    existing = db.scalar(select(Vote).where(
        Vote.user_id == user.id, Vote.target_type == data.target_type, Vote.target_id == data.target_id))
    old = existing.value if existing else 0
    apply_vote(target, target.author, data.target_type, old, data.value)

    if data.value == 0 and existing:
        db.delete(existing)
    elif data.value != 0 and existing:
        existing.value = data.value
    elif data.value != 0:
        db.add(Vote(user_id=user.id, target_type=data.target_type, target_id=data.target_id, value=data.value))
    db.commit()
    return VoteOut(target_type=data.target_type, target_id=target.id, score=target.score,
                   upvotes=target.upvotes, downvotes=target.downvotes, my_vote=data.value)
