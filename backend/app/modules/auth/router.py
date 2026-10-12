import re

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func, or_, select

from app.core.deps import CurrentUser, DbSession
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User
from app.modules.users.schemas import UserPrivate

router = APIRouter(prefix="/auth", tags=["auth"])

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{3,32}$")


class RegisterIn(BaseModel):
    username: str
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(default="", max_length=64)

    @field_validator("username")
    @classmethod
    def _username(cls, v: str) -> str:
        if not _USERNAME_RE.match(v):
            raise ValueError("Nazwa: 3–32 znaki, litery, cyfry, _ . -")
        return v


class LoginIn(BaseModel):
    login: str  # nazwa użytkownika lub e-mail
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPrivate


@router.post("/register", response_model=TokenOut, status_code=201)
def register(data: RegisterIn, db: DbSession):
    exists = db.scalar(select(User.id).where(or_(
        func.lower(User.username) == data.username.lower(),
        func.lower(User.email) == data.email.lower(),
    )))
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nazwa użytkownika lub e-mail jest zajęty")
    user = User(
        username=data.username,
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        display_name=data.display_name or data.username,
    )
    db.add(user)
    db.commit()
    return TokenOut(access_token=create_access_token(user.id), user=UserPrivate.model_validate(user))


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, db: DbSession):
    ident = data.login.strip().lower()
    user = db.scalar(select(User).where(or_(func.lower(User.username) == ident, User.email == ident)))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Nieprawidłowy login lub hasło")
    return TokenOut(access_token=create_access_token(user.id), user=UserPrivate.model_validate(user))


@router.get("/me", response_model=UserPrivate)
def me(user: CurrentUser):
    return user
