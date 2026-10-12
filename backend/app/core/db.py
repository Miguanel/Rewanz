from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

_engine_kwargs: dict = {
    # pool_pre_ping: po uśpieniu instancji / restarcie bazy na Render stare
    # połączenia są martwe – pre-ping wykrywa to zanim zapytanie się wysypie.
    "pool_pre_ping": True,
    "pool_recycle": 300,
}
if settings.is_sqlite:
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    _engine_kwargs["pool_size"] = settings.db_pool_size
    _engine_kwargs["max_overflow"] = settings.db_max_overflow
    # psycopg 3 domyślnie przygotowuje zapytania po stronie serwera, czego nie
    # obsługuje PgBouncer w trybie transakcyjnym (pooler Neon, Render pgbouncer).
    _engine_kwargs["connect_args"] = {"prepare_threshold": None}

engine = create_engine(settings.database_url, **_engine_kwargs)

if settings.is_sqlite:
    @event.listens_for(engine, "connect")
    def _sqlite_fk_on(dbapi_conn, _record):  # pragma: no cover - drobiazg
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
