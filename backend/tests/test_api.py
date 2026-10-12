"""Testy integracyjne API (SQLite). Uruchom: pytest -q"""
import uuid

from tests.conftest import register


def test_health(client):
    assert client.get("/healthz").json()["status"] == "ok"
    assert client.get("/readyz").status_code == 200


def test_seed_and_feed(client, seeded):
    r = client.get("/api/v1/problems?sort=votes")
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 9
    scores = [p["score"] for p in data["items"]]
    assert scores == sorted(scores, reverse=True)


def test_categories_and_summary(client, seeded):
    tree = client.get("/api/v1/categories").json()
    prog = next(c for c in tree if c["slug"] == "programowanie")
    assert prog["total_count"] >= prog["direct_count"]
    assert {c["slug"] for c in prog["children"]} >= {"python", "web"}
    s = client.get("/api/v1/categories/programowanie/summary").json()
    assert s["stats"]["total"] == prog["total_count"]
    assert s["headline"]


def test_search_with_facets(client, seeded):
    r = client.get("/api/v1/search", params={"q": "render", "facets": "true"}).json()
    assert r["total"] >= 1
    assert any("render" in t["name"] for t in r["facets"]["tags"])
    # wyszukiwanie po treści odpowiedzi ("cała rozmowa")
    r2 = client.get("/api/v1/search", params={"q": "zmaterializowana"}).json()
    assert r2["total"] >= 1
    # filtry
    r3 = client.get("/api/v1/search", params={"tags": "zgłoszenie", "has_location": "true"}).json()
    assert r3["total"] == 3 and all(p["lat"] for p in r3["items"])


def test_geo_bbox(client, seeded):
    r = client.get("/api/v1/geo/problems", params={"bbox": "18.9,50.2,19.1,50.3"})
    assert r.status_code == 200 and len(r.json()) == 3
    assert client.get("/api/v1/geo/problems", params={"bbox": "zle"}).status_code == 422


def test_full_flow_problem_answers_votes(client, seeded):
    alice = register(client, "alice")
    bob = register(client, "bob")

    cid = str(uuid.uuid4())
    body = {"title": "Jak testować drzewo odpowiedzi?", "body": "Szukam sposobu na testy wielopoziomowych wątków.",
            "tags": ["Testy", "pytest", "testy"], "client_id": cid, "lat": 50.1, "lng": 19.0}
    p1 = client.post("/api/v1/problems", json=body, headers=alice)
    assert p1.status_code == 201
    pid = p1.json()["id"]
    assert sorted(t["name"] for t in p1.json()["tags"]) == ["pytest", "testy"]
    # Idempotencja: ponowienie z kolejki offline nie tworzy duplikatu
    p2 = client.post("/api/v1/problems", json=body, headers=alice)
    assert p2.json()["id"] == pid

    a1 = client.post(f"/api/v1/problems/{pid}/answers", json={"body": "Odpowiedź główna"}, headers=bob).json()
    a2 = client.post(f"/api/v1/problems/{pid}/answers", json={"body": "Druga główna"}, headers=bob).json()
    r1 = client.post(f"/api/v1/problems/{pid}/answers",
                     json={"body": "Odpowiedź na odpowiedź", "parent_id": a1["id"]}, headers=alice).json()
    r2 = client.post(f"/api/v1/problems/{pid}/answers",
                     json={"body": "Jeszcze głębiej", "parent_id": r1["id"]}, headers=bob).json()
    assert r2["depth"] == 2

    # głos podnosi a2 nad a1
    v = client.post("/api/v1/votes", json={"target_type": "answer", "target_id": a2["id"], "value": 1}, headers=alice)
    assert v.json()["score"] == 1
    thread = client.get(f"/api/v1/problems/{pid}/answers?sort=top", headers=alice).json()
    assert [n["id"] for n in thread["items"]] == [a2["id"], a1["id"]]
    assert thread["items"][0]["my_vote"] == 1
    assert thread["items"][1]["descendant_count"] == 2
    assert thread["items"][1]["children"][0]["children"][0]["id"] == r2["id"]

    # cofnięcie i zmiana głosu
    client.post("/api/v1/votes", json={"target_type": "answer", "target_id": a2["id"], "value": -1}, headers=alice)
    v0 = client.post("/api/v1/votes", json={"target_type": "answer", "target_id": a2["id"], "value": 0}, headers=alice)
    assert v0.json()["score"] == 0 and v0.json()["upvotes"] == 0 and v0.json()["downvotes"] == 0
    # nie można głosować na siebie
    assert client.post("/api/v1/votes", json={"target_type": "answer", "target_id": a1["id"], "value": 1},
                       headers=bob).status_code == 403

    # poddrzewo ("kontynuuj wątek")
    sub = client.get(f"/api/v1/answers/{r1['id']}/thread").json()
    assert sub["total"] == 2 and sub["items"][0]["id"] == r1["id"]

    # akceptacja: przypięta na górze, reputacja +15, status solved
    rep_before = client.get("/api/v1/users/bob").json()["user"]["reputation"]
    acc = client.post(f"/api/v1/problems/{pid}/accept", json={"answer_id": a1["id"]}, headers=alice).json()
    assert acc["status"] == "solved"
    thread = client.get(f"/api/v1/problems/{pid}/answers?sort=best").json()
    assert thread["items"][0]["id"] == a1["id"] and thread["items"][0]["is_accepted"]
    assert client.get("/api/v1/users/bob").json()["user"]["reputation"] == rep_before + 15

    detail = client.get(f"/api/v1/problems/{pid}").json()
    assert detail["answer_count"] == 4


def test_auth_and_portfolio(client):
    h = register(client, "carol")
    assert client.post("/api/v1/auth/login", json={"login": "carol", "password": "zle"}).status_code == 401
    ok = client.post("/api/v1/auth/login", json={"login": "CAROL@t.pl", "password": "haslo12345"})
    assert ok.status_code == 200
    assert client.post("/api/v1/auth/register", json={"username": "carol", "email": "x@t.pl",
                                                       "password": "haslo12345"}).status_code == 409
    client.patch("/api/v1/users/me", json={"bio": "Hydraulik", "skills": "hydraulika"}, headers=h)
    item = client.post("/api/v1/users/me/portfolio", json={"title": "Remont łazienki", "url": "https://x.pl"},
                       headers=h).json()
    pf = client.get("/api/v1/users/carol").json()
    assert pf["user"]["bio"] == "Hydraulik" and pf["portfolio"][0]["id"] == item["id"]
    assert client.delete(f"/api/v1/users/me/portfolio/{item['id']}", headers=h).status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401
