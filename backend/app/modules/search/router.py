from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.core.deps import DbSession
from app.modules.search.service import SearchParams, search_problems
from app.schemas import ProblemListItem

router = APIRouter(tags=["search"])

SortT = Literal["relevance", "newest", "votes", "activity", "unanswered", "views"]


class SearchResult(BaseModel):
    items: list[ProblemListItem]
    total: int
    page: int
    page_size: int
    has_more: bool
    sort: str
    facets: dict | None = None


def _split(v: str | None) -> list[str]:
    return [x for x in (v or "").split(",") if x.strip()]


@router.get("/search", response_model=SearchResult)
def search(
    db: DbSession,
    q: str = Query("", max_length=200),
    tags: str | None = Query(None, description="lista po przecinku"),
    category: str | None = None,
    status: Literal["open", "solved", "closed"] | None = None,
    has_location: bool | None = None,
    min_score: int | None = None,
    sort: SortT = "relevance",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    facets: bool = False,
):
    return search_problems(db, SearchParams(
        q=q, tags=_split(tags), category=category, status=status, has_location=has_location,
        min_score=min_score, sort=sort, page=page, page_size=page_size, facets=facets,
    ))


@router.get("/problems", response_model=SearchResult, summary="Strumień problemów (lista główna)")
def feed(
    db: DbSession,
    sort: SortT = "activity",
    category: str | None = None,
    tag: str | None = None,
    status: Literal["open", "solved", "closed"] | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
):
    return search_problems(db, SearchParams(
        tags=_split(tag), category=category, status=status, sort=sort, page=page, page_size=page_size,
    ))
