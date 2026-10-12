"""Wyszukiwarka problemów i całych rozmów (pytanie + wszystkie odpowiedzi).

Dwie strategie za jednym interfejsem:
  * PostgreSQL – pełnotekstowe tsvector (kolumny generowane w migracji) +
    podobieństwo trigramowe tytułu (pg_trgm) do literówek, ranking ts_rank.
  * SQLite (dev/testy) – dopasowanie ILIKE po słowach.

Kolejny krok rozbudowy: osobny serwis wyszukiwania (Meilisearch/OpenSearch)
zasilany zdarzeniami – wystarczy podmienić implementację `search_problems`.
"""
from dataclasses import dataclass, field

from sqlalchemy import Select, and_, case, desc, func, literal_column, or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Answer, Category, Problem, Tag, problem_tags
from app.modules.taxonomy.service import category_descendant_ids, normalize_tags

SORTS = {"relevance", "newest", "votes", "activity", "unanswered", "views"}
STATUSES = {"open", "solved", "closed"}


@dataclass
class SearchParams:
    q: str = ""
    tags: list[str] = field(default_factory=list)
    category: str | None = None
    status: str | None = None
    has_location: bool | None = None
    min_score: int | None = None
    author_id: int | None = None
    sort: str = "relevance"
    page: int = 1
    page_size: int = 20
    facets: bool = False


def _terms(q: str) -> list[str]:
    return [t for t in q.replace('"', " ").split() if len(t) >= 2][:8]


def _apply_filters(db: Session, stmt: Select, p: SearchParams) -> Select:
    for tag in normalize_tags(p.tags):
        stmt = stmt.where(Problem.tags.any(Tag.name == tag))
    if p.category:
        cat_id = db.scalar(select(Category.id).where(Category.slug == p.category))
        stmt = stmt.where(Problem.category_id.in_(category_descendant_ids(db, cat_id) if cat_id else [-1]))
    if p.status in STATUSES:
        stmt = stmt.where(Problem.status == p.status)
    if p.has_location is True:
        stmt = stmt.where(Problem.lat.is_not(None))
    elif p.has_location is False:
        stmt = stmt.where(Problem.lat.is_(None))
    if p.min_score is not None:
        stmt = stmt.where(Problem.score >= p.min_score)
    if p.author_id is not None:
        stmt = stmt.where(Problem.author_id == p.author_id)
    if p.sort == "unanswered":
        stmt = stmt.where(Problem.answer_count == 0)
    return stmt


def _text_condition_and_rank(p: SearchParams):
    q = p.q.strip()
    if not q:
        return None, None
    if get_settings().is_postgres:
        tsq = func.websearch_to_tsquery("simple", q)
        in_problem = literal_column("problems.search_vector").op("@@")(tsq)
        in_answers = Problem.id.in_(
            select(Answer.problem_id).where(literal_column("answers.search_vector").op("@@")(tsq))
        )
        # Odporność na literówki w tytule (pg_trgm). Przy dużej skali zamień na
        # operator `%` korzystający z indeksu GIN gin_trgm_ops.
        fuzzy_title = func.similarity(Problem.title, q) > 0.3
        cond = or_(in_problem, in_answers, fuzzy_title)
        rank = (func.ts_rank(literal_column("problems.search_vector"), tsq)
                + func.similarity(Problem.title, q))
        return cond, rank

    terms = _terms(q) or [q]
    per_term = []
    for t in terms:
        like = f"%{t}%"
        per_term.append(or_(
            Problem.title.ilike(like),
            Problem.body.ilike(like),
            Problem.id.in_(select(Answer.problem_id).where(Answer.body.ilike(like))),
        ))
    rank = sum(case((Problem.title.ilike(f"%{t}%"), 2), else_=0) for t in terms)
    return and_(*per_term), rank


def search_problems(db: Session, p: SearchParams) -> dict:
    base = _apply_filters(db, select(Problem), p)
    cond, rank = _text_condition_and_rank(p)
    if cond is not None:
        base = base.where(cond)

    total = db.scalar(select(func.count()).select_from(base.with_only_columns(Problem.id).subquery())) or 0

    sort = p.sort if p.sort in SORTS else "relevance"
    if sort == "relevance" and rank is None:
        sort = "activity"
    order = {
        "relevance": [desc(rank) if rank is not None else Problem.last_activity_at.desc(), Problem.score.desc()],
        "newest": [Problem.created_at.desc()],
        "votes": [Problem.score.desc(), Problem.created_at.desc()],
        "activity": [Problem.last_activity_at.desc()],
        "unanswered": [Problem.created_at.desc()],
        "views": [Problem.view_count.desc()],
    }[sort]

    page = max(1, p.page)
    size = min(max(1, p.page_size), 50)
    items = db.scalars(base.order_by(*order, Problem.id.desc()).offset((page - 1) * size).limit(size)).unique().all()

    result = {"items": items, "total": total, "page": page, "page_size": size,
              "has_more": page * size < total, "sort": sort}
    if p.facets:
        result["facets"] = _facets(db, base)
    return result


def _facets(db: Session, base: Select) -> dict:
    ids = base.with_only_columns(Problem.id).subquery()
    tags = db.execute(
        select(Tag.name, func.count().label("n"))
        .select_from(problem_tags)
        .join(Tag, Tag.id == problem_tags.c.tag_id)
        .where(problem_tags.c.problem_id.in_(select(ids.c.id)))
        .group_by(Tag.name).order_by(desc("n")).limit(15)
    ).all()
    statuses = db.execute(
        select(Problem.status, func.count()).where(Problem.id.in_(select(ids.c.id))).group_by(Problem.status)
    ).all()
    cats = db.execute(
        select(Category.slug, Category.name, func.count().label("n"))
        .join(Problem, Problem.category_id == Category.id)
        .where(Problem.id.in_(select(ids.c.id)))
        .group_by(Category.slug, Category.name).order_by(desc("n")).limit(15)
    ).all()
    return {
        "tags": [{"name": n, "count": c} for n, c in tags],
        "status": {s: c for s, c in statuses},
        "categories": [{"slug": s, "name": n, "count": c} for s, n, c in cats],
    }
