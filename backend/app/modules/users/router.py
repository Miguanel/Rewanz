from fastapi import APIRouter, HTTPException, status
from sqlalchemy import case, desc, func, select

from app.core.deps import CurrentUser, DbSession
from app.models import Answer, PortfolioItem, Problem, Tag, User, problem_tags
from app.modules.users.schemas import (
    Portfolio, PortfolioItemIn, PortfolioItemOut, PortfolioItemPatch, ProfilePatch,
    TopAnswer, UserPrivate, UserPublic, UserStats,
)
from app.schemas import ProblemListItem

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me", response_model=UserPrivate)
def update_me(data: ProfilePatch, user: CurrentUser, db: DbSession):
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    db.commit()
    return user


@router.post("/me/portfolio", response_model=PortfolioItemOut, status_code=201)
def add_portfolio_item(data: PortfolioItemIn, user: CurrentUser, db: DbSession):
    item = PortfolioItem(user_id=user.id, **data.model_dump())
    db.add(item)
    db.commit()
    return item


def _own_item(db, user: User, item_id: int) -> PortfolioItem:
    item = db.get(PortfolioItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nie znaleziono pozycji portfolio")
    return item


@router.patch("/me/portfolio/{item_id}", response_model=PortfolioItemOut)
def edit_portfolio_item(item_id: int, data: PortfolioItemPatch, user: CurrentUser, db: DbSession):
    item = _own_item(db, user, item_id)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(item, k, v)
    db.commit()
    return item


@router.delete("/me/portfolio/{item_id}", status_code=204)
def delete_portfolio_item(item_id: int, user: CurrentUser, db: DbSession):
    db.delete(_own_item(db, user, item_id))
    db.commit()


@router.get("/{username}", response_model=Portfolio)
def get_portfolio(username: str, db: DbSession):
    user = db.scalar(select(User).where(func.lower(User.username) == username.lower()))
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nie ma takiego użytkownika")

    problems_count = db.scalar(select(func.count()).select_from(Problem).where(Problem.author_id == user.id)) or 0
    ans_row = db.execute(
        select(
            func.count(Answer.id),
            func.coalesce(func.sum(Answer.score), 0),
            func.coalesce(func.sum(case((Answer.is_accepted.is_(True), 1), else_=0)), 0),
        ).where(Answer.author_id == user.id)
    ).one()

    # Tagi, w których użytkownik najczęściej odpowiada – "specjalizacje" w portfolio
    top_tags = db.execute(
        select(Tag.name, func.count().label("n"))
        .select_from(Answer)
        .join(problem_tags, problem_tags.c.problem_id == Answer.problem_id)
        .join(Tag, Tag.id == problem_tags.c.tag_id)
        .where(Answer.author_id == user.id)
        .group_by(Tag.name)
        .order_by(desc("n"))
        .limit(8)
    ).all()

    recent = db.scalars(
        select(Problem).where(Problem.author_id == user.id).order_by(Problem.created_at.desc()).limit(10)
    ).unique().all()

    top_answers_rows = db.execute(
        select(Answer, Problem.title)
        .join(Problem, Problem.id == Answer.problem_id)
        .where(Answer.author_id == user.id)
        .order_by(Answer.is_accepted.desc(), Answer.score.desc())
        .limit(10)
    ).all()

    return Portfolio(
        user=UserPublic.model_validate(user),
        stats=UserStats(
            problems=problems_count,
            answers=ans_row[0] or 0,
            total_answer_score=int(ans_row[1] or 0),
            accepted_answers=int(ans_row[2] or 0),
        ),
        top_tags=[{"name": n, "count": c} for n, c in top_tags],
        portfolio=[PortfolioItemOut.model_validate(i) for i in user.portfolio],
        recent_problems=[ProblemListItem.model_validate(p) for p in recent],
        top_answers=[
            TopAnswer(
                id=a.id, problem_id=a.problem_id, problem_title=title, score=a.score,
                is_accepted=a.is_accepted,
                excerpt=(" ".join(a.body.split()))[:200],
            )
            for a, title in top_answers_rows
        ],
    )
