"""Wspólne DTO używane przez wiele modułów."""
import datetime as dt
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserBrief(ORM):
    id: int
    username: str
    display_name: str
    reputation: int


class TagOut(ORM):
    id: int
    name: str
    usage_count: int = 0


class CategoryBrief(ORM):
    id: int
    slug: str
    name: str


class ProblemListItem(ORM):
    id: int
    title: str
    excerpt: str
    status: str
    score: int
    answer_count: int
    view_count: int
    created_at: dt.datetime
    last_activity_at: dt.datetime
    author: UserBrief
    category: CategoryBrief | None = None
    tags: list[TagOut] = []
    lat: float | None = None
    lng: float | None = None
    location_label: str = ""


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    has_more: bool
