from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, update

from app.core.deps import CurrentUser, DbSession, OptionalUser
from app.models import Answer, Category, Problem, User, Vote, utcnow
from app.modules.problems.schemas import AcceptIn, ProblemCreate, ProblemDetail, StatusIn
from app.modules.taxonomy.service import get_or_create_tags, invalidate_summaries

router = APIRouter(prefix="/problems", tags=["problems"])

REP_ACCEPTED = 15


def _detail(db, problem: Problem, user: User | None) -> ProblemDetail:
    out = ProblemDetail.model_validate(problem)
    if user:
        v = db.scalar(select(Vote.value).where(
            Vote.user_id == user.id, Vote.target_type == "problem", Vote.target_id == problem.id))
        out.my_vote = v or 0
    return out


def get_problem_or_404(db, problem_id: int) -> Problem:
    p = db.get(Problem, problem_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nie znaleziono problemu")
    return p


@router.post("", response_model=ProblemDetail, status_code=201)
def create_problem(data: ProblemCreate, user: CurrentUser, db: DbSession):
    if data.client_id:
        existing = db.scalar(select(Problem).where(Problem.client_id == data.client_id))
        if existing:
            if existing.author_id != user.id:
                raise HTTPException(status.HTTP_409_CONFLICT, "Konflikt identyfikatora klienta")
            return _detail(db, existing, user)  # ponowienie z kolejki offline – bez duplikatu
    if data.category_id is not None and not db.get(Category, data.category_id):
        raise HTTPException(422, "Nieznana kategoria")

    p = Problem(
        client_id=data.client_id, author_id=user.id, category_id=data.category_id,
        title=data.title.strip(), body=data.body.strip(), lat=data.lat, lng=data.lng,
        location_label=data.location_label.strip(),
    )
    p.tags = get_or_create_tags(db, data.tags)
    db.add(p)
    db.commit()
    invalidate_summaries()
    return _detail(db, p, user)


@router.get("/{problem_id}", response_model=ProblemDetail)
def get_problem(problem_id: int, db: DbSession, user: OptionalUser):
    p = get_problem_or_404(db, problem_id)
    # Atomowy licznik wyświetleń (bez wyścigu read-modify-write)
    db.execute(update(Problem).where(Problem.id == problem_id).values(view_count=Problem.view_count + 1))
    db.commit()
    db.refresh(p)
    return _detail(db, p, user)


@router.patch("/{problem_id}/status", response_model=ProblemDetail)
def set_status(problem_id: int, data: StatusIn, user: CurrentUser, db: DbSession):
    p = get_problem_or_404(db, problem_id)
    if p.author_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tylko autor może zmienić status")
    p.status = data.status
    db.commit()
    invalidate_summaries()
    return _detail(db, p, user)


@router.post("/{problem_id}/accept", response_model=ProblemDetail)
def accept_answer(problem_id: int, data: AcceptIn, user: CurrentUser, db: DbSession):
    p = get_problem_or_404(db, problem_id)
    if p.author_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tylko autor może zaakceptować odpowiedź")
    ans = db.get(Answer, data.answer_id)
    if not ans or ans.problem_id != p.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nie znaleziono odpowiedzi")

    if p.accepted_answer_id and p.accepted_answer_id != ans.id:
        prev = db.get(Answer, p.accepted_answer_id)
        if prev:
            prev.is_accepted = False
            if prev.author_id != user.id:
                prev.author.reputation -= REP_ACCEPTED
    if not ans.is_accepted:
        ans.is_accepted = True
        if ans.author_id != user.id:
            ans.author.reputation += REP_ACCEPTED
    p.accepted_answer_id = ans.id
    p.status = "solved"
    p.last_activity_at = utcnow()
    db.commit()
    invalidate_summaries()
    return _detail(db, p, user)
