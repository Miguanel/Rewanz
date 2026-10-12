# REWANŻ – wdrożenie na Render i architektura

Ten dokument prowadzi od pustego konta Render do działającego systemu: frontend na CDN,
API w FastAPI i baza PostgreSQL. Wszystkie trzy usługi definiuje plik `render.yaml`
(Render Blueprint), więc całą infrastrukturę tworzysz jednym kliknięciem i trzymasz w repozytorium.

---

## 1. Architektura w skrócie

```
 Telefon / przeglądarka
 ┌──────────────────────────────────────────────────────────┐
 │  PWA REWANŻ                                               │
 │  • Service worker – powłoka aplikacji działa bez sieci    │
 │  • IndexedDB "cache" – ostatnie odpowiedzi API            │
 │  • IndexedDB "outbox" – zapisy czekające na serwer        │
 └───────────────┬──────────────────────────────────────────┘
                 │ HTTPS
   ┌─────────────▼────────────┐        ┌──────────────────────────┐
   │ rewanz-web (static site) │        │ rewanz-api (web service) │
   │ CDN Render – NIE śpi     │  CORS  │ FastAPI – darmowy plan   │
   │ HTML / JS / CSS / ikony  │ ─────► │ usypia po 15 min         │
   └──────────────────────────┘        └────────────┬─────────────┘
                                                    │ sieć prywatna
                                       ┌────────────▼─────────────┐
                                       │ rewanz-db (PostgreSQL)   │
                                       │ pełnotekstowe + pg_trgm  │
                                       └──────────────────────────┘
```

Dlaczego tak (rozproszenie zamiast jednego serwera):

| Decyzja | Po co |
|---|---|
| Frontend jako **osobny static site** | CDN Render nigdy nie usypia – aplikacja otwiera się natychmiast, nawet gdy API śpi. |
| API jako **osobny web service** | Można je niezależnie skalować, przenieść na płatny plan albo podzielić na mikroserwisy. |
| **Baza zarządzana** | Dane przetrwają restart/uśpienie API (system plików web service jest ulotny). |
| **Offline-first w przeglądarce** | Użytkownik widzi zapisane dane od razu, a zapisy idą przez kolejkę z kluczem idempotencji. |

### Co dokładnie dzieje się, gdy backend śpi

1. **0 ms** – `index.html` (z CDN) od razu wysyła `GET /healthz`. To budzi instancję, zanim pobierze się JavaScript aplikacji.
2. **~300 ms** – aplikacja pokazuje dane z IndexedDB (lista, wątki, profile) z dopiskiem „stan z HH:MM”.
3. **po 1,2 s bez odpowiedzi** – pojawia się pasek „Budzimy serwer (N s)” z postępem. Przy szybkim serwerze pasek nie mruga wcale.
4. **W tym czasie** użytkownik może głosować, odpowiadać, zadawać pytania – wpisy pojawiają się od razu jako „wysyłanie…”, a trafiają do kolejki (outbox) w IndexedDB.
5. **Serwer wstaje** – kolejka wysyła się sama. Każdy wpis ma `client_id` (UUID), a backend traktuje go jako klucz idempotencji: ponowienie po zerwanym połączeniu **nie tworzy duplikatu**.
6. **Powrót do aplikacji po >14 min** – aplikacja zakłada, że serwer zasnął, i budzi go od razu przy odblokowaniu telefonu.

Ten scenariusz jest sprawdzony automatycznym testem w przeglądarce (widok telefonu, symulowany 9-sekundowy cold start, tryb offline).

---

## 2. Uruchomienie lokalne (Windows + PyCharm)

Wymagania: Python 3.11 (Twój `venv` w projekcie), Node.js 20+, Git. Docker – opcjonalnie.

### Backend

```powershell
cd C:\Users\micha\PycharmProjects\Rewanz
.\venv\Scripts\activate
cd backend
pip install -r requirements-dev.txt
copy .env.example .env
alembic upgrade head
python -m scripts.seed
uvicorn app.main:app --reload
```

- Dokumentacja API: http://localhost:8000/docs
- **Testy: `pytest -q`** – uruchom je jako pierwsze. Sprawdzają cały przepływ: rejestracja, pytanie, wielopoziomowe odpowiedzi, głosy, akceptacja, idempotencja, wyszukiwarka, mapa, portfolio.

Domyślnie lokalnie działa SQLite (zero konfiguracji). Żeby testować na tym samym silniku co Render:

```powershell
docker compose up -d
# w backend\.env:
# DATABASE_URL=postgresql://rewanz:rewanz@localhost:5432/rewanz
alembic upgrade head
python -m scripts.seed
```

W PyCharm: *Run → Edit Configurations → + → Python*, moduł `uvicorn`, parametry `app.main:app --reload`, katalog roboczy `backend`.

### Frontend

```powershell
cd C:\Users\micha\PycharmProjects\Rewanz\frontend
copy .env.example .env
npm install
npm run check     # sprawdzenie typów TypeScript
npm run dev       # http://localhost:5173
```

Test na prawdziwym telefonie w tej samej sieci Wi-Fi: Vite wypisze adres `Network: http://192.168.x.x:5173`.
Ustaw wtedy w `frontend\.env` `VITE_API_URL=http://192.168.x.x:8000`, uruchom backend z `--host 0.0.0.0`
i dopisz ten adres do `CORS_ORIGINS` w `backend\.env`.

---

## 3. Repozytorium na GitHubie

```powershell
cd C:\Users\micha\PycharmProjects\Rewanz
git init
git add .
git commit -m "REWANŻ – prototyp"
git branch -M main
git remote add origin https://github.com/<twoj-login>/rewanz.git
git push -u origin main
```

`.gitignore` pomija `venv`, `node_modules`, `.env`, lokalne bazy i `.idea`.
Po `npm install` powstanie `frontend/package-lock.json` – **dodaj go do repozytorium**, żeby Render instalował dokładnie te same wersje.

Workflow `.github/workflows/ci.yml` przy każdym pushu uruchamia testy backendu (także migracje na prawdziwym PostgreSQL) oraz sprawdzenie typów i build frontendu.

---

## 4. Wdrożenie na Render (Blueprint)

1. Zaloguj się na https://dashboard.render.com i połącz konto GitHub.
2. **New → Blueprint** → wybierz repozytorium `rewanz` → gałąź `main`.
3. Render pokaże 3 zasoby z `render.yaml`: `rewanz-api`, `rewanz-web`, `rewanz-db`. Kliknij **Apply**.
4. Poczekaj na build (pierwszy trwa kilka minut). Kolejność nie ma znaczenia – API czeka na bazę przez `DATABASE_URL`.
5. Sprawdź API: otwórz `https://rewanz-api.onrender.com/healthz` → `{"status":"ok",...}` oraz `/docs`.
6. **Sprawdź adres API.** Jeśli nazwa była zajęta, Render doda sufiks (np. `rewanz-api-x1y2.onrender.com`). Wtedy:
   - `rewanz-web` → *Environment* → popraw `VITE_API_URL`,
   - *Manual Deploy → Clear build cache & deploy* (adres API jest wkompilowany w build).
   Frontend z sufiksem nie wymaga zmian po stronie API – `CORS_ORIGIN_REGEX` już go obejmuje.
7. Otwórz `https://rewanz-web.onrender.com`, zaloguj się `demo` / `demo12345`.
8. Po pierwszym udanym starcie ustaw w `rewanz-api` → *Environment* `SEED_DEMO=false` (seed i tak jest idempotentny, ale to zbędna praca przy każdym starcie).

### Co ustawia `render.yaml`

| Usługa | Kluczowe ustawienia |
|---|---|
| `rewanz-api` | Python 3.11.9, region Frankfurt, `healthCheckPath: /healthz`, start: `scripts/start.sh` (migracje Alembic → opcjonalny seed → uvicorn), `JWT_SECRET` generowany automatycznie, `DATABASE_URL` z bazy przez sieć prywatną, mała pula połączeń (limit darmowej bazy). |
| `rewanz-web` | `npm install && npm run build`, publikacja `dist`, przepisywanie `/*` → `/index.html` (routing SPA), cache na rok dla `/assets/*` (pliki z hashem), `no-cache` dla `sw.js` i `index.html` (aktualizacje docierają od razu), nagłówki bezpieczeństwa. |
| `rewanz-db` | PostgreSQL 16, Frankfurt, baza `rewanz`. Migracja dodaje kolumny `tsvector` z indeksem GIN i indeks trigramowy tytułów. |

### Własna domena (opcjonalnie)

`rewanz-web` → *Settings → Custom Domains* → dodaj np. `rewanz.pl` i ustaw rekordy DNS według instrukcji Render.
Potem w `rewanz-api` dopisz domenę do `CORS_ORIGINS` (np. `https://rewanz.pl,https://www.rewanz.pl`).

---

## 5. Ograniczenia darmowego planu i co z nimi zrobić

| Ograniczenie | Skutek | Rozwiązanie |
|---|---|---|
| API usypia po 15 min bez ruchu | Pierwsze żądanie po przerwie czeka zwykle kilkadziesiąt sekund | Obsłużone w aplikacji (pkt 1). Na produkcję: plan płatny bez usypiania – w `render.yaml` zmień `plan: free` na `plan: starter` i przenieś migracje do `preDeployCommand: alembic upgrade head`. |
| **Darmowa baza wygasa po 30 dniach** (potem 14 dni na upgrade, następnie usunięcie danych) | Utrata danych | Przed upływem 30 dni: upgrade bazy do płatnego planu w panelu (dane zostają) **albo** zewnętrzny darmowy PostgreSQL (np. Neon): usuń sekcję `databases` z `render.yaml`, a w `rewanz-api` ustaw ręcznie `DATABASE_URL` na adres z `?sslmode=require`. Kod nie wymaga zmian. |
| Brak kopii zapasowych na darmowej bazie | – | Okresowo `pg_dump` z adresu zewnętrznego (panel bazy → *Connect → External*). |
| 750 darmowych godzin/miesiąc na cały workspace | Jedna usługa działająca 24/7 mieści się w limicie, dwie już nie | Static site nie zużywa tych godzin. |
| Ulotny system plików API | Pliki zapisane na dysku znikną przy restarcie | Dlatego wszystko jest w bazie. Przyszłe załączniki/zdjęcia → magazyn obiektów (S3 / Cloudflare R2). |

**Opcjonalne „podtrzymywanie” na dzień obrony/prezentacji:** darmowy serwis cron (np. cron-job.org) wywołujący
`https://rewanz-api.onrender.com/healthz` co 10 minut sprawia, że API nie zasypia. Zużywa wtedy ~24 h z puli 750 h dziennie,
więc włącz to tylko na czas, kiedy potrzebujesz zerowego opóźnienia.

---

## 6. Sprawdzenie na telefonie

1. Otwórz adres frontendu w Chrome (Android) lub Safari (iOS).
2. *Dodaj do ekranu głównego* – aplikacja uruchomi się pełnoekranowo jak natywna.
3. Przejrzyj kilka wątków (trafią do pamięci telefonu).
4. **Test uśpienia:** odczekaj ≥15 minut i otwórz aplikację. Powinieneś zobaczyć od razu dane z dopiskiem „stan z HH:MM”, pasek „Budzimy serwer” i móc napisać odpowiedź, która wyśle się sama.
5. **Test offline:** włącz tryb samolotowy – aplikacja się otworzy, pokaże zapisane wątki i baner offline; wpisy zostaną w kolejce (ikona ⟳ z licznikiem w nagłówku → ekran „Do wysłania”).

---

## 7. Mapa kodu – gdzie co rozbudowywać

```
backend/app/
  core/           konfiguracja (env), baza, JWT + hasła (scrypt), zależności FastAPI
  models.py       tabele: users, portfolio_items, categories, tags, problems, answers, votes
  modules/
    auth/         rejestracja, logowanie, /auth/me
    users/        profil, portfolio, statystyki i „specjalizacje”
    problems/     tworzenie (idempotentne), szczegóły, status, akceptacja odpowiedzi
    answers/      drzewo odpowiedzi: tree.py (czysta logika: sortowanie Wilsona, przycinanie głębokości)
    votes/        głosy +1/−1/cofnięcie, reputacja, blokada wiersza w PG
    search/       wyszukiwarka + facety (PG: tsvector + pg_trgm; SQLite: LIKE)
    taxonomy/     tagi, drzewo kategorii, podsumowania kategorii (cache 60 s)
    geo/          zgłoszenia w prostokącie mapy (bbox)
  alembic/        migracje schematu
  scripts/        start.sh (Render), seed.py (dane demo)

frontend/src/
  lib/            api.ts (klient + wykrywanie uśpienia), backend.ts (budzenie),
                  query.ts (cache IndexedDB), outbox.ts (kolejka zapisów), idb.ts, auth.ts, types.ts
  app/            powłoka, router (History API), lista tras – każdy ekran ładowany osobno
  features/       feed, search, problem (wątek + drzewo), ask, map, categories, user, sync
  components/     karty, głosowanie, tagi, baner połączenia
public/sw.js      service worker (powłoka offline, cache plików i kafelków mapy)
```

Każdy moduł backendu to osobny `router.py` (+ `service.py`/`schemas.py`), podpięty w `app/main.py`.
Nowa funkcja = nowy folder w `modules/` + nowy folder w `features/` + wpis w `routes.tsx`.

### Kierunki rozbudowy (przygotowane w kodzie)

| Obszar | Teraz | Następny krok |
|---|---|---|
| Wyszukiwanie | PostgreSQL `tsvector` (konfiguracja `simple`) + trigramy | Słownik polski (hunspell) lub osobny Meilisearch/OpenSearch zasilany zdarzeniami – wystarczy podmienić `search_problems()`. |
| Mapa | Indeks (lat, lng), zapytanie po prostokącie | PostGIS: promień, klastrowanie znaczników po stronie serwera. |
| Podsumowania kategorii | Liczone na żądanie, cache 60 s w procesie | Background worker / cron + Render Key Value; streszczenia LLM. |
| Drzewo odpowiedzi | Ścieżka zmaterializowana `path` – jedno zapytanie na wątek | Paginacja odpowiedzi głównych dla bardzo dużych wątków. |
| Czas rzeczywisty | Odświeżanie po akcji | WebSocket/SSE (nowe odpowiedzi na żywo). |
| Konta | JWT (14 dni) w `localStorage` | Refresh tokeny, weryfikacja e-mail, OAuth (Google/GitHub), role moderatorów. |
| Bezpieczeństwo | Walidacja Pydantic, CORS, hashowanie scrypt | Rate limiting, Markdown z sanitizacją, moderacja/zgłoszenia nadużyć. |
| Frontend | Własny lekki router, ręczne typy API | `react-router`, generowanie typów z `/openapi.json`, i18n. |
| Skalowanie | 1 instancja API | Plan płatny + kilka instancji (aplikacja jest bezstanowa – JWT, brak sesji w pamięci; cache podsumowań przenieść do Key Value). |

---

## 8. Rozwiązywanie problemów

| Objaw | Przyczyna i naprawa |
|---|---|
| Pasek „Budzimy serwer” nie znika, potem „Serwer nie odpowiada” | Najczęściej CORS: adres frontendu nie pasuje do `CORS_ORIGIN_REGEX`/`CORS_ORIGINS`. Sprawdź konsolę przeglądarki i logi `rewanz-api`. Drugi powód: zły `VITE_API_URL` (wymaga ponownego buildu frontendu). |
| Build frontendu: „publish directory not found” | Ustaw w panelu *Publish Directory* na `dist` (względem `frontend`) lub `frontend/dist`. |
| API: błąd połączenia z bazą przy starcie | Baza jeszcze się tworzy (pierwszy deploy) – *Manual Deploy* po minucie. Albo darmowa baza wygasła (pkt 5). |
| Po wdrożeniu telefon pokazuje starą wersję | Service worker pokaże komunikat „Dostępna nowa wersja → Odśwież”. Upewnij się, że `sw.js` ma nagłówek `no-cache` (jest w `render.yaml`). |
| `alembic upgrade head` – błąd przy `pg_trgm` | Rozszerzenie jest dostępne na Render Postgres; przy zewnętrznej bazie upewnij się, że użytkownik może wykonać `CREATE EXTENSION`. |
| Lokalnie na Windows nie działa `bash scripts/start.sh` | Ten skrypt jest dla Render. Lokalnie uruchamiaj polecenia z pkt 2. |

---

## 9. Co zostało sprawdzone przed przekazaniem

- **Frontend** zbudowany i przetestowany automatycznie w Chromium w widoku telefonu (390×844) na atrapie API o tych samych kształtach odpowiedzi: 22/22 scenariuszy – lista z przewijaniem nieskończonym, głębokie wątki (bez poziomego przewijania), logowanie, głos optymistyczny, **uśpiony serwer** (wątek z pamięci w <0,5 s, pasek budzenia, odpowiedź z kolejki wysłana dokładnie raz), **pełny offline**, wyszukiwarka, formularz pytania, mapa, kategorie, profil, ciemny motyw, widok desktop.
- **Backend**: logika drzewa odpowiedzi – testy jednostkowe (8/8), cały kod przeszedł kompilację i lint (ruff).

Do zrobienia po Twojej stronie przy pierwszym uruchomieniu (w środowisku przygotowania nie było dostępu do PyPI/npm):

1. `pytest -q` w `backend` – testy integracyjne całego API.
2. `npm run check` w `frontend` – sprawdzenie typów TypeScript.
3. CI na GitHubie dodatkowo wykona migracje na prawdziwym PostgreSQL.
