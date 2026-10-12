"""Konfiguracja aplikacji – wszystko z zmiennych środowiskowych (12-factor).

Na Render wartości ustawia render.yaml / panel Environment.
Lokalnie można użyć pliku backend/.env (patrz .env).
"""
from functools import lru_cache

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "REWANŻ API"
    env: str = "development"  # development | production | test

    # Render podaje "postgresql://..." – normalizujemy do sterownika psycopg 3.
    database_url: str = "sqlite:///./rewanz.db"
    db_pool_size: int = 5
    db_max_overflow: int = 5

    jwt_secret: str = "dev-only-secret-change-me-0123456789abcdef"
    jwt_expire_minutes: int = 60 * 24 * 14

    # Lista originów oddzielona przecinkami, np. "https://rewanz-web.onrender.com"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # Opcjonalny regex, np. dla podglądów PR: r"https://rewanz-web-pr-\d+\.onrender\.com"
    cors_origin_regex: str | None = None

    # Tworzenie tabel bez Alembica (tylko dev/test) i dane demonstracyjne
    auto_create_tables: bool = False
    seed_demo: bool = False

    @field_validator("database_url")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        if v.startswith("postgres://"):
            v = "postgresql://" + v[len("postgres://"):]
        if v.startswith("postgresql://"):
            v = "postgresql+psycopg://" + v[len("postgresql://"):]
        return v

    @model_validator(mode="after")
    def _strong_secret_in_production(self):
        # HS256 wymaga klucza >= 32 bajtów (RFC 7518 §3.2). Na Render JWT_SECRET
        # generuje się automatycznie (256 bitów) – ten warunek łapie ręczne pomyłki.
        if self.env == "production" and len(self.jwt_secret.encode()) < 32:
            raise ValueError("JWT_SECRET na produkcji musi mieć co najmniej 32 bajty")
        return self

    @property
    def cors_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()
