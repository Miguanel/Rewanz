import datetime as dt
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select, update

from app.core.deps import CurrentUser, DbSession, OptionalUser
from app.models import Answer, Problem, User, Vote, utcnow
from app.modules.answers.tree import build_tree, make_path
from app.modules.problems.router import get_problem_or_404
from app.modules.taxonomy.service import invalidate_summaries

router = APIRouter(tags=["answers"])

SortT = Literal["best", "top", "new", "old"]


class AnswerCreate(BaseModel):
    body: str = Field(min_length=2, max_length=20000)
    parent_id: int | None = None
    client_id: str | None = Field(default=None, max_length=36)


class AnswerNode(BaseModel):
    id: int
    problem_id: int
    parent_id: int | None
    body: str
    score: int
    upvotes: int
    downvotes: int
    depth: int
    reply_count: int
    is_accepted: bool
    created_at: dt.datetime
    author: dict
    my_vote: int = 0
    descendant_count: int = 0
    collapsed: bool = False
    has_more: bool = False
    children: list["AnswerNode"] = []


class ThreadOut(BaseModel):
    problem_id: int
    root_id: int | None
    sort: str
    total: int
    items: list[AnswerNode]


def _row(a: Answer, my_votes: dict[int, int]) -> dict:
    created = a.created_at if a.created_at.tzinfo else a.created_at.replace(tzinfo=dt.timezone.utc)
    return {
        "id": a.id, "problem_id": a.problem_id, "parent_id": a.parent_id, "body": a.body,
        "score": a.score, "upvotes": a.upvotes, "downvotes": a.downvotes, "depth": a.depth,
        "reply_count": a.reply_count, "is_accepted": a.is_accepted, "created_at": created,
        "created_ts": created.timestamp(),
        "author": {"id": a.author.id, "username": a.author.username,
                   "display_name": a.author.display_name, "reputation": a.author.reputation},
        "my_vote": my_votes.get(a.id, 0),
    }


def _my_votes(db, user: User | None, ids: list[int]) -> dict[int, int]:
    if not user or not ids:
        return {}
    return dict(db.execute(select(Vote.target_id, Vote.value).where(
        Vote.user_id == user.id, Vote.target_type == "answer", Vote.target_id.in_(ids))).all())


@router.get("/problems/{problem_id}/answers", response_model=ThreadOut)
def list_answers(
    problem_id: int, db: DbSession, user: OptionalUser,
    sort: SortT = "best",
    max_depth: int = Query(8, ge=1, le=50),
    min_score: int | None = None,
):
    get_problem_or_404(db, problem_id)
    answers = db.scalars(select(Answer).where(Answer.problem_id == problem_id)).all()
    mv = _my_votes(db, user, [a.id for a in answers])
    tree = build_tree((_row(a, mv) for a in answers), sort=sort, max_depth=max_depth, min_score=min_score)
    return ThreadOut(problem_id=problem_id, root_id=None, sort=sort, total=len(answers), items=tree)


@router.get("/answers/{answer_id}/thread", response_model=ThreadOut)
def answer_thread(
    answer_id: int, db: DbSession, user: OptionalUser,
    sort: SortT = "best",
    max_depth: int = Query(8, ge=1, le=50),
    min_score: int | None = None,
):
    """Poddrzewo pojedynczej odpowiedzi ("kontynuuj wątek") – jedno zapytanie po path."""
    root = db.get(Answer, answer_id)
    if not root:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nie znaleziono odpowiedzi")
    rows = db.scalars(select(Answer).where(or_(
        Answer.id == root.id, Answer.path.like(root.path + "/%")))).all()
    mv = _my_votes(db, user, [a.id for a in rows])
    tree = build_tree((_row(a, mv) for a in rows), root_parent_id=root.parent_id, sort=sort,
                      max_depth=max_depth, min_score=min_score)
    return ThreadOut(problem_id=root.problem_id, root_id=root.id, sort=sort, total=len(rows), items=tree)


@router.post("/problems/{problem_id}/answers", response_model=AnswerNode, status_code=201)
def create_answer(problem_id: int, data: AnswerCreate, user: CurrentUser, db: DbSession):
    problem = get_problem_or_404(db, problem_id)
    if data.client_id:
        existing = db.scalar(select(Answer).where(Answer.client_id == data.client_id))
        if existing:
            if existing.author_id != user.id:
                raise HTTPException(status.HTTP_409_CONFLICT, "Konflikt identyfikatora klienta")
            return AnswerNode(**_row(existing, {}))
    if problem.status == "closed":
        raise HTTPException(status.HTTP_409_CONFLICT, "Problem jest zamknięty")

    parent = None
    if data.parent_id is not None:
        parent = db.get(Answer, data.parent_id)
        if not parent or parent.problem_id != problem_id:
            raise HTTPException(422, "Nieprawidłowa odpowiedź nadrzędna")

    a = Answer(
        client_id=data.client_id, problem_id=problem_id, author_id=user.id,
        parent_id=parent.id if parent else None, body=data.body.strip(),
        depth=(parent.depth + 1) if parent else 0,
    )
    db.add(a)
    db.flush()  # potrzebujemy id do ścieżki
    a.path = make_path(parent.path if parent else None, a.id)
    if parent:
        db.execute(update(Answer).where(Answer.id == parent.id).values(reply_count=Answer.reply_count + 1))
    db.execute(update(Problem).where(Problem.id == problem_id).values(
        answer_count=Problem.answer_count + 1, last_activity_at=utcnow()))
    db.commit()
    db.refresh(a)
    invalidate_summaries()
    return AnswerNode(**_row(a, {}))
