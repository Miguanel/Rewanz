import datetime as dt

from pydantic import BaseModel, Field

from app.schemas import ORM, ProblemListItem


class PortfolioItemIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=4000)
    url: str = Field(default="", max_length=500)
    tags: str = Field(default="", max_length=300)
    position: int = 0


class PortfolioItemPatch(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=4000)
    url: str | None = Field(default=None, max_length=500)
    tags: str | None = Field(default=None, max_length=300)
    position: int | None = None


class PortfolioItemOut(ORM):
    id: int
    title: str
    description: str
    url: str
    tags: str
    position: int


class UserPublic(ORM):
    id: int
    username: str
    display_name: str
    bio: str
    location: str
    website: str
    skills: str
    reputation: int
    created_at: dt.datetime


class UserPrivate(UserPublic):
    email: str


class ProfilePatch(BaseModel):
    display_name: str | None = Field(default=None, max_length=64)
    bio: str | None = Field(default=None, max_length=4000)
    location: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=255)
    skills: str | None = Field(default=None, max_length=500)


class UserStats(BaseModel):
    problems: int
    answers: int
    accepted_answers: int
    total_answer_score: int


class TopAnswer(BaseModel):
    id: int
    problem_id: int
    problem_title: str
    score: int
    is_accepted: bool
    excerpt: str


class Portfolio(BaseModel):
    user: UserPublic
    stats: UserStats
    top_tags: list[dict]
    portfolio: list[PortfolioItemOut]
    recent_problems: list[ProblemListItem]
    top_answers: list[TopAnswer]
