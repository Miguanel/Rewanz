"""Hasła (scrypt z biblioteki standardowej) i tokeny JWT.

scrypt nie wymaga kompilowanych zależności, a parametry są zapisane w hashu,
więc można je później podnieść bez migracji (stare hashe nadal się weryfikują).
"""
import base64
import datetime as dt
import hashlib
import hmac
import os

import jwt

from app.core.config import get_settings

_N, _R, _P, _DKLEN = 2**14, 8, 1, 32


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=_DKLEN)
    return f"scrypt${_N}${_R}${_P}${_b64(salt)}${_b64(dk)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, expected = stored.split("$")
        if algo != "scrypt":
            return False
        dk = hashlib.scrypt(
            password.encode(), salt=_unb64(salt), n=int(n), r=int(r), p=int(p),
            dklen=len(_unb64(expected)),
        )
        return hmac.compare_digest(dk, _unb64(expected))
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int) -> str:
    s = get_settings()
    now = dt.datetime.now(dt.timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + dt.timedelta(minutes=s.jwt_expire_minutes)}
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
