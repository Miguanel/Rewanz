"""Dane demonstracyjne (idempotentne – nic nie robi, jeśli kategorie już istnieją).

Uruchomienie:  python -m scripts.seed
Konto demo:    demo / demo12345
"""
import datetime as dt
import random

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import Answer, Category, Problem, User, utcnow
from app.modules.answers.tree import make_path
from app.modules.taxonomy.service import get_or_create_tags

CATEGORIES = [
    ("programowanie", "Programowanie", None, "Kod, biblioteki, błędy kompilacji"),
    ("python", "Python", "programowanie", "FastAPI, Django, skrypty"),
    ("web", "Frontend i web", "programowanie", "React, CSS, PWA"),
    ("dom", "Dom i majsterkowanie", None, "Naprawy, instalacje, narzędzia"),
    ("elektryka", "Elektryka", "dom", "Gniazdka, oświetlenie, zabezpieczenia"),
    ("hydraulika", "Hydraulika", "dom", "Krany, odpływy, ogrzewanie"),
    ("miasto", "Miasto i okolica", None, "Zgłoszenia lokalne – dziury, oświetlenie, zieleń"),
    ("motoryzacja", "Motoryzacja", None, "Usterki, serwis, przeglądy"),
]

PROBLEMS = [
    ("python", "FastAPI na Render budzi się 50 sekund – jak to obejść?",
     "Darmowa instancja usypia się po 15 minutach. Pierwsze żądanie z telefonu wisi prawie minutę. "
     "Jak zaprojektować frontend, żeby użytkownik tego nie odczuł?", ["fastapi", "render", "cold-start"], None),
    ("python", "SQLAlchemy 2.0: jak zrobić zagnieżdżone komentarze bez rekurencji?",
     "Potrzebuję drzewa odpowiedzi o dowolnej głębokości i chcę je pobierać jednym zapytaniem.",
     ["sqlalchemy", "postgresql", "drzewa"], None),
    ("web", "Service worker nie aktualizuje się na iPhonie",
     "Po wdrożeniu nowej wersji PWA Safari na iOS dalej pokazuje starą. Co robię źle?",
     ["pwa", "service-worker", "ios"], None),
    ("elektryka", "Gniazdko w łazience iskrzy przy wkładaniu wtyczki",
     "Od tygodnia przy podłączaniu suszarki widać iskrę. Czy to groźne i czy mogę to wymienić sam?",
     ["gniazdko", "bezpieczeństwo"], None),
    ("hydraulika", "Cieknie syfon pod zlewem mimo dokręcenia",
     "Wymieniłem uszczelkę, dokręciłem nakrętki, a nadal kapie z dolnego kolanka.",
     ["syfon", "przeciek"], None),
    ("miasto", "Dziura w jezdni na skrzyżowaniu – gdzie zgłosić?",
     "Duża dziura przy przejściu dla pieszych, samochody ją omijają po pasie obok. Kto za to odpowiada?",
     ["drogi", "zgłoszenie"], (50.2599, 19.0216, "Katowice, okolice Rynku")),
    ("miasto", "Nie działa latarnia przy przystanku od dwóch tygodni",
     "Wieczorem przystanek jest kompletnie ciemny, zgłaszałem telefonicznie bez efektu.",
     ["oświetlenie", "zgłoszenie"], (50.2649, 19.0238, "Katowice, Dworzec")),
    ("miasto", "Połamane ławki w parku po wichurze",
     "Kilka ławek i kosz na śmieci leży połamanych przy głównej alejce.",
     ["zieleń", "zgłoszenie"], (50.2876, 18.9989, "Park Śląski")),
    ("motoryzacja", "Kontrolka ABS zapala się po deszczu",
     "W suche dni wszystko OK, po jeździe w deszczu zapala się ABS i gaśnie po kilku godzinach.",
     ["abs", "czujniki"], None),
]

ANSWERS = [
    "Najprościej: statyczny frontend na CDN + cache danych w przeglądarce, a backend budzisz pingiem /healthz zaraz przy otwarciu aplikacji.",
    "Do tego kolejka zapisów offline z identyfikatorem klienta – po przebudzeniu serwera wysyłasz wszystko bez duplikatów.",
    "Zmaterializowana ścieżka (path) + parent_id. Całe drzewo bierzesz po problem_id, poddrzewo przez LIKE 'path/%'.",
    "Sprawdź, czy nie cache'ujesz samego sw.js – nagłówek Cache-Control: no-cache dla tego pliku rozwiązuje sprawę.",
    "Iskrzenie to sygnał zużytych styków. Wyłącz bezpiecznik i wezwij elektryka – w łazience to nie miejsce na eksperymenty.",
    "Często winna jest pęknięta nakrętka, a nie uszczelka. Wymień cały syfon, kosztuje kilkadziesiąt złotych.",
    "Drogi gminne zgłaszasz do zarządu dróg miejskich – zwykle jest formularz online albo aplikacja miejska.",
    "Zrób zdjęcie i podaj numer słupa, przyspiesza to naprawę.",
    "Najczęściej czujnik ABS przy kole albo jego wtyczka łapie wilgoć. Warto przeczyścić i zabezpieczyć.",
]

REPLIES = [
    "Potwierdzam, u mnie zadziałało.",
    "A co jeśli użytkownik zamknie aplikację, zanim kolejka się wyśle?",
    "Kolejka siedzi w IndexedDB, więc zostanie wysłana przy następnym uruchomieniu.",
    "Dobra uwaga, dopiszę to do dokumentacji.",
    "Dzięki, właśnie tego szukałem!",
]


def run() -> None:
    db = SessionLocal()
    try:
        if db.scalar(select(Category.id).limit(1)):
            print("Seed: dane już istnieją – pomijam.")
            return
        rnd = random.Random(42)

        cats: dict[str, Category] = {}
        for i, (slug, name, parent, desc) in enumerate(CATEGORIES):
            c = Category(slug=slug, name=name, description=desc, position=i,
                         parent_id=cats[parent].id if parent else None)
            db.add(c)
            db.flush()
            cats[slug] = c

        users = []
        for uname, disp, bio, skills in [
            ("demo", "Konto demo", "Testowe konto do prezentacji.", "python,react"),
            ("ania_dev", "Ania", "Backend developer, lubię Postgresa.", "python,postgresql,fastapi"),
            ("marek_fix", "Marek", "Złota rączka – elektryka i hydraulika.", "elektryka,hydraulika"),
            ("ola_city", "Ola", "Aktywistka miejska.", "miasto,zgłoszenia"),
        ]:
            u = User(username=uname, email=f"{uname}@example.com", password_hash=hash_password("demo12345"),
                     display_name=disp, bio=bio, skills=skills, location="Katowice")
            db.add(u)
            users.append(u)
        db.flush()

        now = utcnow()
        for i, (cat, title, body, tags, geo) in enumerate(PROBLEMS):
            created = now - dt.timedelta(hours=6 * (len(PROBLEMS) - i))
            p = Problem(author=users[i % len(users)], category_id=cats[cat].id, title=title, body=body,
                        created_at=created, last_activity_at=created)
            if geo:
                p.lat, p.lng, p.location_label = geo
            p.tags = get_or_create_tags(db, tags)
            db.add(p)
            db.flush()

            top = Answer(problem_id=p.id, author=users[(i + 1) % len(users)], body=ANSWERS[i % len(ANSWERS)],
                         created_at=created + dt.timedelta(minutes=30))
            db.add(top)
            db.flush()
            top.path = make_path(None, top.id)
            top.upvotes = rnd.randint(1, 12)
            top.downvotes = rnd.randint(0, 2)
            top.score = top.upvotes - top.downvotes
            p.answer_count = 1

            parent = top
            for d in range(rnd.randint(1, 4)):  # zagnieżdżona dyskusja
                r = Answer(problem_id=p.id, author=users[(i + d + 2) % len(users)], parent_id=parent.id,
                           body=REPLIES[(i + d) % len(REPLIES)], depth=parent.depth + 1,
                           created_at=created + dt.timedelta(minutes=45 + d * 10))
                db.add(r)
                db.flush()
                r.path = make_path(parent.path, r.id)
                r.upvotes = rnd.randint(0, 5)
                r.score = r.upvotes
                parent.reply_count += 1
                p.answer_count += 1
                parent = r

            p.upvotes = rnd.randint(0, 20)
            p.score = p.upvotes
            p.view_count = rnd.randint(10, 300)
            p.last_activity_at = created + dt.timedelta(hours=1)
            if i % 3 == 0:
                top.is_accepted = True
                p.accepted_answer_id = top.id
                p.status = "solved"
        db.commit()
        print(f"Seed: {len(PROBLEMS)} problemów, {len(users)} użytkowników. Login: demo / demo12345")
    finally:
        db.close()


if __name__ == "__main__":
    run()
