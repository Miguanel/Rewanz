"""Zgłoszenia problemów na mapie.

Teraz: zapytanie po prostokącie widoku (bbox) na indeksie (lat, lng).
Rozbudowa: PostGIS (kolumna geography + indeks GIST, zapytania "w promieniu X km",
klastrowanie po stronie serwera) – Render Postgres obsługuje rozszerzenie postgis.
"""
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import DbSession
from app.models import Problem

router = APIRouter(prefix="/geo", tags=["geo"])


class Marker(BaseModel):
    id: int
    title: str
    lat: float
    lng: float
    status: str
    score: int
    answer_count: int
    location_label: str


def parse_bbox(bbox: str) -> tuple[float, float, float, float]:
    try:
        w, s, e, n = (float(x) for x in bbox.split(","))
    except ValueError:
        raise HTTPException(422, "bbox = zachód,południe,wschód,północ") from None
    if not (-180 <= w <= 180 and -180 <= e <= 180 and -90 <= s <= n <= 90):
        raise HTTPException(422, "bbox poza zakresem")
    return w, s, e, n


@router.get("/problems", response_model=list[Marker])
def problems_in_bbox(
    db: DbSession,
    bbox: str = Query(..., description="zachód,południe,wschód,północ"),
    status_: Literal["open", "solved", "closed"] | None = Query(None, alias="status"),
    limit: int = Query(300, ge=1, le=1000),
):
    w, s, e, n = parse_bbox(bbox)
    stmt = select(
        Problem.id, Problem.title, Problem.lat, Problem.lng, Problem.status,
        Problem.score, Problem.answer_count, Problem.location_label,
    ).where(Problem.lat.between(s, n))
    if w <= e:
        stmt = stmt.where(Problem.lng.between(w, e))
    else:  # widok przecina południk 180°
        stmt = stmt.where((Problem.lng >= w) | (Problem.lng <= e))
    if status_:
        stmt = stmt.where(Problem.status == status_)
    rows = db.execute(stmt.order_by(Problem.score.desc()).limit(limit)).all()
    return [Marker(**r._mapping) for r in rows]
