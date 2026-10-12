"""Budowanie i sortowanie drzewa odpowiedzi – czysta logika (bez bazy).

Sortowania:
  best – dolna granica przedziału Wilsona (jak Reddit "best"): odpowiedź z 9/1
         głosów wygrywa z 1/0, choć "score" ma niższe.
  top  – suma głosów (up - down)
  new  – najnowsze
  old  – najstarsze
Zaakceptowana odpowiedź na poziomie głównym zawsze jest pierwsza (jak na SO)
przy sortowaniu best/top.
"""
from __future__ import annotations

import math
from collections.abc import Iterable
from typing import Any

SORTS = ("best", "top", "new", "old")
PATH_WIDTH = 10


def make_path(parent_path: str | None, answer_id: int) -> str:
    seg = str(answer_id).zfill(PATH_WIDTH)
    return f"{parent_path}/{seg}" if parent_path else seg


def wilson_lower_bound(up: int, down: int, z: float = 1.96) -> float:
    n = up + down
    if n == 0:
        return 0.0
    phat = up / n
    return (phat + z * z / (2 * n) - z * math.sqrt((phat * (1 - phat) + z * z / (4 * n)) / n)) / (1 + z * z / n)


def _sort_key(sort: str):
    if sort == "top":
        return lambda n: (-n["score"], n["created_ts"])
    if sort == "new":
        return lambda n: (-n["created_ts"],)
    if sort == "old":
        return lambda n: (n["created_ts"],)
    return lambda n: (-wilson_lower_bound(n["upvotes"], n["downvotes"]), -n["score"], n["created_ts"])


def build_tree(
    rows: Iterable[dict[str, Any]],
    *,
    root_parent_id: int | None = None,
    sort: str = "best",
    max_depth: int = 8,
    min_score: int | None = None,
) -> list[dict[str, Any]]:
    """rows: słowniki z kluczami id, parent_id, score, upvotes, downvotes,
    created_ts (float), is_accepted + dowolne pola do odesłania.

    Zwraca listę korzeni; każdy węzeł ma `children`, `descendant_count`,
    `collapsed` (score < min_score) i `has_more` (ucięte poniżej max_depth –
    klient dociąga je przez /answers/{id}/thread).
    """
    sort = sort if sort in SORTS else "best"
    nodes: dict[int, dict[str, Any]] = {}
    for r in rows:
        n = dict(r)
        n["children"] = []
        nodes[n["id"]] = n

    roots: list[dict[str, Any]] = []
    for n in nodes.values():
        parent = nodes.get(n["parent_id"]) if n["parent_id"] != root_parent_id else None
        if parent is not None:
            parent["children"].append(n)
        elif n["parent_id"] == root_parent_id:
            roots.append(n)
        # sieroty (rodzic poza zakresem) są pomijane

    key = _sort_key(sort)

    def finish(node: dict[str, Any], rel_depth: int) -> int:
        node["children"].sort(key=key)
        count = 0
        for ch in node["children"]:
            count += 1 + finish(ch, rel_depth + 1)
        node["descendant_count"] = count
        node["collapsed"] = min_score is not None and node["score"] < min_score
        node["has_more"] = False
        if rel_depth >= max_depth and node["children"]:
            node["has_more"] = True
            node["children"] = []
        return count

    roots.sort(key=key)
    if sort in ("best", "top") and root_parent_id is None:
        roots.sort(key=lambda n: not n.get("is_accepted", False))  # stabilne – zachowuje resztę
    for r in roots:
        finish(r, 1)
    return roots
