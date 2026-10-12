from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas import ProblemListItem


class ProblemCreate(BaseModel):
    title: str = Field(min_length=10, max_length=200)
    body: str = Field(min_length=20, max_length=20000)
    tags: list[str] = Field(default_factory=list, max_length=10)
    category_id: int | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    location_label: str = Field(default="", max_length=200)
    client_id: str | None = Field(default=None, max_length=36)

    @model_validator(mode="after")
    def _both_coords(self):
        if (self.lat is None) != (self.lng is None):
            raise ValueError("Podaj obie współrzędne (lat i lng) albo żadnej")
        return self


class ProblemDetail(ProblemListItem):
    body: str
    upvotes: int
    downvotes: int
    accepted_answer_id: int | None = None
    my_vote: int = 0


class StatusIn(BaseModel):
    status: Literal["open", "solved", "closed"]


class AcceptIn(BaseModel):
    answer_id: int
