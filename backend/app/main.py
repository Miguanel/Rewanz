"""Punkt wejścia API REWANŻ.

Szybki start ma znaczenie na darmowym planie Render (usypianie po 15 min):
  * /healthz nie dotyka bazy – odpowiada natychmiast po starcie procesu,
    frontend używa go do wykrycia, że backend się obudził;
  * /readyz sprawdza połączenie z bazą (monitoring, health check Render).
"""
import datetime as dt
import time

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import Base, engine
from app.modules.answers.router import router as answers_router
from app.modules.auth.router import router as auth_router
from app.modules.geo.router import router as geo_router
from app.modules.problems.router import router as problems_router
from app.modules.search.router import router as search_router
from app.modules.taxonomy.router import router as taxonomy_router
from app.modules.users.router import router as users_router
from app.modules.votes.router import router as votes_router

settings = get_settings()
STARTED_AT = time.time()

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(GZipMiddleware, minimum_size=800)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=False,  # autoryzacja nagłówkiem Bearer, bez ciasteczek
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=86400,  # preflight cache'owany na dobę – mniej zapytań OPTIONS z telefonu
)


@app.middleware("http")
async def timing_header(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    response.headers["Server-Timing"] = f"app;dur={(time.perf_counter() - t0) * 1000:.1f}"
    return response


if settings.auto_create_tables:
    Base.metadata.create_all(engine)

api = APIRouter(prefix="/api/v1")
for r in (auth_router, users_router, search_router, problems_router, answers_router,
          votes_router, taxonomy_router, geo_router):
    api.include_router(r)
app.include_router(api)


@app.get("/healthz", tags=["meta"])
def healthz():
    return {"status": "ok", "uptime_s": round(time.time() - STARTED_AT, 1),
            "time": dt.datetime.now(dt.timezone.utc).isoformat()}


@app.get("/readyz", tags=["meta"])
def readyz():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception as exc:  # pragma: no cover
        return JSONResponse({"status": "db_unavailable", "detail": str(exc)[:200]}, status_code=503)


@app.get("/", include_in_schema=False)
def root():
    return {"name": settings.app_name, "docs": "/docs", "health": "/healthz"}
