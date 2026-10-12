from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.deps import DbSession
from app.models import Category, Tag
from app.modules.taxonomy import service
from app.schemas import TagOut

router = APIRouter(tags=["taxonomy"])


@router.get("/tags", response_model=list[TagOut])
def list_tags(db: DbSession, q: str = "", limit: int = Query(20, ge=1, le=100)):
    stmt = select(Tag).order_by(Tag.usage_count.desc(), Tag.name).limit(limit)
    if q:
        stmt = stmt.where(Tag.name.startswith(service.normalize_tag(q)))
    return db.scalars(stmt).all()


@router.get("/categories")
def list_categories(db: DbSession):
    return service.category_tree(db)


@router.get("/categories/{slug}/summary")
def category_summary(slug: str, db: DbSession):
    cat = db.scalar(select(Category).where(Category.slug == slug))
    if not cat:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nie ma takiej kategorii")
    return service.category_summary(db, cat)
