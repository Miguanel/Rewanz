import re
import time
import unicodedata

from sqlalchemy import case, desc, func, select
from sqlalchemy.orm import Session

from app.models import Category, Problem, Tag, problem_tags

MAX_TAGS = 5
_TAG_ALLOWED = re.compile(r"[^a-z0-9ąćęłńóśźż+#.\-]")


def normalize_tag(raw: str) -> str:
    t = unicodedata.normalize("NFC", raw).strip().lower()
    t = re.sub(r"\s+", "-", t)
    t = _TAG_ALLOWED.sub("", t)
    return t.strip("-.")[:40]


def normalize_tags(raw: list[str]) -> list[str]:
    out: list[str] = []
    for r in raw:
        t = normalize_tag(r)
        if t and t not in out:
            out.append(t)
    return out[:MAX_TAGS]


def get_or_create_tags(db: Session, names: list[str]) -> list[Tag]:
    names = normalize_tags(names)
    if not names:
        return []
    existing = {t.name: t for t in db.scalars(select(Tag).where(Tag.name.in_(names)))}
    tags = []
    for n in names:
        tag = existing.get(n)
        if tag is None:
            tag = Tag(name=n, usage_count=0)
            db.add(tag)
        tag.usage_count = (tag.usage_count or 0) + 1
        tags.append(tag)
    return tags


def category_descendant_ids(db: Session, root_id: int) -> list[int]:
    """Kategorii jest mało – liczymy drzewo w Pythonie (działa na SQLite i PG)."""
    rows = db.execute(select(Category.id, Category.parent_id)).all()
    children: dict[int | None, list[int]] = {}
    for cid, pid in rows:
        children.setdefault(pid, []).append(cid)
    out, stack = [], [root_id]
    while stack:
        cur = stack.pop()
        out.append(cur)
        stack.extend(children.get(cur, []))
    return out


def category_tree(db: Session) -> list[dict]:
    cats = db.scalars(select(Category).order_by(Category.position, Category.name)).all()
    counts = dict(db.execute(
        select(Problem.category_id, func.count()).group_by(Problem.category_id)
    ).all())
    nodes = {c.id: {"id": c.id, "slug": c.slug, "name": c.name, "description": c.description,
                    "parent_id": c.parent_id, "direct_count": counts.get(c.id, 0), "children": []}
             for c in cats}
    roots = []
    for n in nodes.values():
        parent = nodes.get(n["parent_id"])
        (parent["children"] if parent else roots).append(n)

    def total(n):
        n["total_count"] = n["direct_count"] + sum(total(ch) for ch in n["children"])
        return n["total_count"]

    for r in roots:
        total(r)
    return roots


# --- Podsumowanie kategorii -------------------------------------------------
# Prosty cache w pamięci procesu (60 s). Przy skalowaniu: Render Key Value lub
# tabela category_summaries liczona przez background worker / cron.
_SUMMARY_CACHE: dict[str, tuple[float, dict]] = {}
_SUMMARY_TTL = 60.0


def category_summary(db: Session, cat: Category) -> dict:
    hit = _SUMMARY_CACHE.get(cat.slug)
    if hit and time.monotonic() - hit[0] < _SUMMARY_TTL:
        return hit[1]

    ids = category_descendant_ids(db, cat.id)
    in_cat = Problem.category_id.in_(ids)

    total, open_, solved, unanswered, answers = db.execute(
        select(
            func.count(),
            func.coalesce(func.sum(case((Problem.status == "open", 1), else_=0)), 0),
            func.coalesce(func.sum(case((Problem.status == "solved", 1), else_=0)), 0),
            func.coalesce(func.sum(case((Problem.answer_count == 0, 1), else_=0)), 0),
            func.coalesce(func.sum(Problem.answer_count), 0),
        ).where(in_cat)
    ).one()

    top_tags = db.execute(
        select(Tag.name, func.count().label("n"))
        .select_from(problem_tags)
        .join(Tag, Tag.id == problem_tags.c.tag_id)
        .join(Problem, Problem.id == problem_tags.c.problem_id)
        .where(in_cat)
        .group_by(Tag.name)
        .order_by(desc("n"))
        .limit(10)
    ).all()

    def brief(rows):
        return [{"id": p.id, "title": p.title, "score": p.score, "answer_count": p.answer_count,
                 "status": p.status} for p in rows]

    top = db.scalars(select(Problem).where(in_cat).order_by(Problem.score.desc()).limit(5)).unique().all()
    recent = db.scalars(select(Problem).where(in_cat).order_by(Problem.created_at.desc()).limit(5)).unique().all()

    subs = []
    for child in db.scalars(select(Category).where(Category.parent_id == cat.id).order_by(Category.position)):
        child_ids = category_descendant_ids(db, child.id)
        n = db.scalar(select(func.count()).select_from(Problem).where(Problem.category_id.in_(child_ids))) or 0
        subs.append({"slug": child.slug, "name": child.name, "total": n})

    total = int(total or 0)
    solved = int(solved or 0)
    tag_names = [t for t, _ in top_tags[:3]]
    # Tekstowe podsumowanie generowane regułowo; w przyszłości można je zastąpić
    # streszczeniem LLM liczonym asynchronicznie przez workera.
    if total:
        headline = (f"{total} problemów, {round(100 * solved / total)}% rozwiązanych"
                    + (f"; najczęstsze tematy: {', '.join(tag_names)}" if tag_names else "") + ".")
    else:
        headline = "Brak problemów w tej kategorii – bądź pierwszy!"

    data = {
        "category": {"id": cat.id, "slug": cat.slug, "name": cat.name, "description": cat.description},
        "headline": headline,
        "stats": {"total": total, "open": int(open_ or 0), "solved": solved,
                  "unanswered": int(unanswered or 0), "answers": int(answers or 0),
                  "solved_ratio": round(solved / total, 3) if total else 0.0},
        "top_tags": [{"name": n, "count": c} for n, c in top_tags],
        "top_problems": brief(top),
        "recent_problems": brief(recent),
        "subcategories": subs,
    }
    _SUMMARY_CACHE[cat.slug] = (time.monotonic(), data)
    return data


def invalidate_summaries() -> None:
    _SUMMARY_CACHE.clear()
