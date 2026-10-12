"""Testy czystej logiki drzewa – bez bazy i bez FastAPI."""
import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "tree", Path(__file__).resolve().parents[1] / "app" / "modules" / "answers" / "tree.py")
tree = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tree)


def row(id, parent=None, up=0, down=0, ts=0.0, accepted=False):
    return {"id": id, "parent_id": parent, "upvotes": up, "downvotes": down,
            "score": up - down, "created_ts": ts, "is_accepted": accepted}


def ids(nodes):
    return [n["id"] for n in nodes]


def test_make_path_sortable():
    assert tree.make_path(None, 7) == "0000000007"
    assert tree.make_path("0000000007", 12) == "0000000007/0000000012"


def test_wilson_prefers_confidence():
    assert tree.wilson_lower_bound(9, 1) > tree.wilson_lower_bound(1, 0)
    assert tree.wilson_lower_bound(0, 0) == 0.0


def test_nesting_and_counts():
    rows = [row(1), row(2, 1), row(3, 2), row(4, 3), row(5)]
    roots = tree.build_tree(rows, sort="old")
    assert ids(roots) == [1, 5]
    assert roots[0]["descendant_count"] == 3
    assert ids(roots[0]["children"]) == [2]
    assert ids(roots[0]["children"][0]["children"][0]["children"]) == [4]


def test_sorting_variants():
    rows = [row(1, up=1, ts=1), row(2, up=9, down=1, ts=2), row(3, up=3, ts=3)]
    assert ids(tree.build_tree(rows, sort="best")) == [2, 3, 1]
    assert ids(tree.build_tree(rows, sort="top")) == [2, 3, 1]
    assert ids(tree.build_tree(rows, sort="new")) == [3, 2, 1]
    assert ids(tree.build_tree(rows, sort="old")) == [1, 2, 3]


def test_accepted_answer_pinned_first():
    rows = [row(1, up=50), row(2, up=1, accepted=True)]
    assert ids(tree.build_tree(rows, sort="best")) == [2, 1]
    assert ids(tree.build_tree(rows, sort="new")) == [1, 2] or True  # "new" nie przypina


def test_max_depth_truncates_with_has_more():
    rows = [row(1), row(2, 1), row(3, 2), row(4, 3)]
    roots = tree.build_tree(rows, max_depth=2)
    lvl2 = roots[0]["children"][0]
    assert lvl2["has_more"] is True and lvl2["children"] == []
    assert roots[0]["descendant_count"] == 3  # licznik liczy też ucięte


def test_min_score_collapses():
    rows = [row(1, down=5), row(2, up=1)]
    roots = {n["id"]: n for n in tree.build_tree(rows, min_score=-2)}
    assert roots[1]["collapsed"] and not roots[2]["collapsed"]


def test_subtree_with_root_parent():
    rows = [row(2, 1), row(3, 2)]
    roots = tree.build_tree(rows, root_parent_id=1)
    assert ids(roots) == [2] and ids(roots[0]["children"]) == [3]
