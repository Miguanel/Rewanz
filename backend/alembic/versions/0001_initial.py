"""Schemat początkowy REWANŻ + wyszukiwanie pełnotekstowe (PostgreSQL)

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-12
"""
import sqlalchemy as sa
from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

TZ = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("username", sa.String(32), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(64), nullable=False, server_default=""),
        sa.Column("bio", sa.Text, nullable=False, server_default=""),
        sa.Column("location", sa.String(120), nullable=False, server_default=""),
        sa.Column("website", sa.String(255), nullable=False, server_default=""),
        sa.Column("skills", sa.String(500), nullable=False, server_default=""),
        sa.Column("reputation", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", TZ, nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "portfolio_items",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("url", sa.String(500), nullable=False, server_default=""),
        sa.Column("tags", sa.String(300), nullable=False, server_default=""),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", TZ, nullable=False),
    )
    op.create_index("ix_portfolio_items_user_id", "portfolio_items", ["user_id"])

    op.create_table(
        "categories",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("parent_id", sa.Integer, sa.ForeignKey("categories.id", ondelete="SET NULL")),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
    )
    op.create_index("ix_categories_slug", "categories", ["slug"], unique=True)
    op.create_index("ix_categories_parent_id", "categories", ["parent_id"])

    op.create_table(
        "tags",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("usage_count", sa.Integer, nullable=False, server_default="0"),
    )
    op.create_index("ix_tags_name", "tags", ["name"], unique=True)
    op.create_index("ix_tags_usage_count", "tags", ["usage_count"])

    op.create_table(
        "problems",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("client_id", sa.String(36), unique=True),
        sa.Column("author_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("category_id", sa.Integer, sa.ForeignKey("categories.id", ondelete="SET NULL")),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="open"),
        sa.Column("score", sa.Integer, nullable=False, server_default="0"),
        sa.Column("upvotes", sa.Integer, nullable=False, server_default="0"),
        sa.Column("downvotes", sa.Integer, nullable=False, server_default="0"),
        sa.Column("answer_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("view_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("accepted_answer_id", sa.Integer),
        sa.Column("lat", sa.Float),
        sa.Column("lng", sa.Float),
        sa.Column("location_label", sa.String(200), nullable=False, server_default=""),
        sa.Column("created_at", TZ, nullable=False),
        sa.Column("last_activity_at", TZ, nullable=False),
    )
    for col in ("author_id", "category_id", "status", "score", "answer_count", "created_at", "last_activity_at"):
        op.create_index(f"ix_problems_{col}", "problems", [col])
    op.create_index("ix_problems_geo", "problems", ["lat", "lng"])

    op.create_table(
        "problem_tags",
        sa.Column("problem_id", sa.Integer, sa.ForeignKey("problems.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tag_id", sa.Integer, sa.ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_index("ix_problem_tags_tag_id", "problem_tags", ["tag_id"])

    op.create_table(
        "answers",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("client_id", sa.String(36), unique=True),
        sa.Column("problem_id", sa.Integer, sa.ForeignKey("problems.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_id", sa.Integer, sa.ForeignKey("answers.id", ondelete="CASCADE")),
        sa.Column("author_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("score", sa.Integer, nullable=False, server_default="0"),
        sa.Column("upvotes", sa.Integer, nullable=False, server_default="0"),
        sa.Column("downvotes", sa.Integer, nullable=False, server_default="0"),
        sa.Column("depth", sa.Integer, nullable=False, server_default="0"),
        sa.Column("path", sa.Text, nullable=False, server_default=""),
        sa.Column("reply_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_accepted", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", TZ, nullable=False),
        sa.Column("updated_at", TZ),
    )
    for col in ("problem_id", "parent_id", "author_id"):
        op.create_index(f"ix_answers_{col}", "answers", [col])

    op.create_table(
        "votes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_type", sa.String(10), nullable=False),
        sa.Column("target_id", sa.Integer, nullable=False),
        sa.Column("value", sa.SmallInteger, nullable=False),
        sa.Column("created_at", TZ, nullable=False),
        sa.UniqueConstraint("user_id", "target_type", "target_id", name="uq_vote_user_target"),
    )
    op.create_index("ix_votes_target", "votes", ["target_type", "target_id"])

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Ścieżki odpowiedzi: indeks pod LIKE 'prefix/%' niezależnie od collation
        op.execute("CREATE INDEX ix_answers_path ON answers (path text_pattern_ops)")

        # Pełnotekstowe: konfiguracja 'simple' (PG nie ma wbudowanego słownika PL).
        # Rozbudowa: słownik hunspell PL / unaccent albo zewnętrzny Meilisearch.
        op.execute("""
            ALTER TABLE problems ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
                setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                setweight(to_tsvector('simple', coalesce(body, '')), 'B')
            ) STORED
        """)
        op.execute("CREATE INDEX ix_problems_search ON problems USING GIN (search_vector)")
        op.execute("""
            ALTER TABLE answers ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
                to_tsvector('simple', coalesce(body, ''))
            ) STORED
        """)
        op.execute("CREATE INDEX ix_answers_search ON answers USING GIN (search_vector)")

        # Literówki w tytułach
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        op.execute("CREATE INDEX ix_problems_title_trgm ON problems USING GIN (title gin_trgm_ops)")
    else:
        op.create_index("ix_answers_path", "answers", ["path"])


def downgrade() -> None:
    for t in ("votes", "answers", "problem_tags", "problems", "tags", "categories", "portfolio_items", "users"):
        op.drop_table(t)
