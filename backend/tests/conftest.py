import os
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

_db_file = Path(tempfile.gettempdir()) / "rewanz_test.db"
if _db_file.exists():
    _db_file.unlink()
os.environ.update({
    "ENV": "test",
    "DATABASE_URL": f"sqlite:///{_db_file.as_posix()}",
    "AUTO_CREATE_TABLES": "true",
    "JWT_SECRET": "test-secret-0123456789-abcdefghijklmnop",
})


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def seeded(client):
    from scripts.seed import run
    run()
    return True


def register(client, username: str) -> dict:
    r = client.post("/api/v1/auth/register",
                    json={"username": username, "email": f"{username}@t.pl", "password": "haslo12345"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
