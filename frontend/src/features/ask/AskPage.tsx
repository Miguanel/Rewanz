import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Link, navigate, useLocation } from "@/app/router";
import { qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { enqueue, uuid } from "@/lib/outbox";
import { useCachedQuery } from "@/lib/query";
import type { CategoryNode, Tag } from "@/lib/types";

const MapPicker = lazy(() => import("@/features/map/MapPicker"));
const DRAFT = "rewanz.draft.ask";

interface Draft {
  title: string;
  body: string;
  tags: string[];
  categoryId: string;
  lat: number | null;
  lng: number | null;
  locationLabel: string;
}

const EMPTY: Draft = { title: "", body: "", tags: [], categoryId: "", lat: null, lng: null, locationLabel: "" };

function flatten(nodes: CategoryNode[], depth = 0): { id: number; name: string; depth: number }[] {
  return nodes.flatMap((n) => [{ id: n.id, name: n.name, depth }, ...flatten(n.children, depth + 1)]);
}

export default function AskPage() {
  const { user } = useAuth();
  const { search } = useLocation();
  const [d, setD] = useState<Draft>(() => {
    let base = EMPTY;
    try {
      const raw = localStorage.getItem(DRAFT);
      if (raw) base = { ...EMPTY, ...JSON.parse(raw) };
    } catch {
      /* ignoruj */
    }
    const lat = search.get("lat");
    const lng = search.get("lng");
    return lat && lng ? { ...base, lat: Number(lat), lng: Number(lng) } : base;
  });
  const [tagInput, setTagInput] = useState("");
  const [picking, setPicking] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const cats = useCachedQuery<CategoryNode[]>("/categories");
  const flatCats = useMemo(() => flatten(cats.data ?? []), [cats.data]);
  const tagQuery = tagInput.trim().length >= 1 ? `/tags${qs({ q: tagInput.trim(), limit: 6 })}` : null;
  const suggestions = useCachedQuery<Tag[]>(tagQuery, { keepPrevious: true });

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT, JSON.stringify(d));
      } catch {
        /* ignoruj */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [d]);

  if (!user)
    return (
      <div className="empty">
        <p>Zaloguj się, aby zadać pytanie lub zgłosić problem.</p>
        <Link to="/login?next=/ask" className="btn btn-primary">Zaloguj się</Link>
      </div>
    );

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
    if (t && !d.tags.includes(t) && d.tags.length < 5) set("tags", [...d.tags, t]);
    setTagInput("");
  };

  const errors = {
    title: d.title.trim().length < 10 ? "Tytuł: co najmniej 10 znaków" : null,
    body: d.body.trim().length < 20 ? "Opis: co najmniej 20 znaków" : null,
  };
  const valid = !errors.title && !errors.body;

  const locate = () => {
    setGeoError(null);
    if (!navigator.geolocation) return setGeoError("Ta przeglądarka nie udostępnia lokalizacji");
    navigator.geolocation.getCurrentPosition(
      (pos) => setD((cur) => ({ ...cur, lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) })),
      () => setGeoError("Nie udało się pobrać lokalizacji – wybierz punkt na mapie"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    const id = uuid();
    enqueue({
      id,
      kind: "problem",
      method: "POST",
      path: "/problems",
      body: {
        title: d.title.trim(),
        body: d.body.trim(),
        tags: d.tags,
        category_id: d.categoryId ? Number(d.categoryId) : null,
        lat: d.lat,
        lng: d.lng,
        location_label: d.locationLabel.trim(),
        client_id: id,
      },
      meta: { label: d.title.trim() },
      invalidates: ["/problems?", "/search", "/categories", "/geo/"],
    });
    try {
      localStorage.removeItem(DRAFT);
    } catch {
      /* ignoruj */
    }
    navigate("/");
  };

  return (
    <div className="page narrow">
      <h1>Zadaj pytanie</h1>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label>
          Tytuł
          <input
            value={d.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Np. Cieknie syfon pod zlewem mimo nowej uszczelki"
            maxLength={200}
            enterKeyHint="next"
          />
          {touched && errors.title && <small className="error">{errors.title}</small>}
        </label>

        <label>
          Opis problemu
          <textarea
            value={d.body}
            onChange={(e) => set("body", e.target.value)}
            rows={7}
            placeholder="Co się dzieje, co już próbowałeś, czego oczekujesz?"
            maxLength={20000}
          />
          {touched && errors.body && <small className="error">{errors.body}</small>}
        </label>

        <div className="field">
          <span className="label">Tagi (do 5)</span>
          <div className="tag-input">
            {d.tags.map((t) => (
              <button type="button" key={t} className="chip on" onClick={() => set("tags", d.tags.filter((x) => x !== t))}>
                {t} <Icon name="x" size={12} />
              </button>
            ))}
            {d.tags.length < 5 && (
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag(tagInput);
                  } else if (e.key === "Backspace" && !tagInput && d.tags.length) {
                    set("tags", d.tags.slice(0, -1));
                  }
                }}
                onBlur={() => tagInput && addTag(tagInput)}
                placeholder={d.tags.length ? "" : "np. hydraulika"}
                aria-label="Dodaj tag"
                enterKeyHint="enter"
              />
            )}
          </div>
          {tagInput && suggestions.data && suggestions.data.length > 0 && (
            <div className="chips">
              {suggestions.data
                .filter((s) => !d.tags.includes(s.name))
                .map((s) => (
                  <button type="button" key={s.id} className="chip" onMouseDown={(e) => e.preventDefault()} onClick={() => addTag(s.name)}>
                    {s.name} <small>{s.usage_count}</small>
                  </button>
                ))}
            </div>
          )}
        </div>

        <label>
          Kategoria
          <select value={d.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            <option value="">— bez kategorii —</option>
            {flatCats.map((c) => (
              <option key={c.id} value={c.id}>{`${"  ".repeat(c.depth)}${c.depth ? "↳ " : ""}${c.name}`}</option>
            ))}
          </select>
        </label>

        <fieldset className="field">
          <legend className="label">Lokalizacja (opcjonalnie – zgłoszenie na mapie)</legend>
          <div className="row wrap">
            <button type="button" className="btn btn-small" onClick={locate}>
              <Icon name="locate" size={16} /> Moja lokalizacja
            </button>
            <button type="button" className="btn btn-small" onClick={() => setPicking((p) => !p)}>
              <Icon name="map" size={16} /> {picking ? "Ukryj mapę" : "Wybierz na mapie"}
            </button>
            {d.lat !== null && (
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setD((c) => ({ ...c, lat: null, lng: null }))}>
                Usuń
              </button>
            )}
          </div>
          {geoError && <small className="error">{geoError}</small>}
          {d.lat !== null && d.lng !== null && (
            <p className="muted small">
              <Icon name="pin" size={14} /> {d.lat.toFixed(5)}, {d.lng.toFixed(5)}
            </p>
          )}
          {picking && (
            <Suspense fallback={<div className="map-box skeleton" />}>
              <MapPicker value={d.lat !== null && d.lng !== null ? [d.lat, d.lng] : null} onChange={([lat, lng]) => setD((c) => ({ ...c, lat, lng }))} />
            </Suspense>
          )}
          {d.lat !== null && (
            <input
              value={d.locationLabel}
              onChange={(e) => set("locationLabel", e.target.value)}
              placeholder="Opis miejsca, np. Katowice, ul. Mariacka 5"
              maxLength={200}
            />
          )}
        </fieldset>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={touched && !valid}>Opublikuj</button>
          <p className="muted small">Jeśli serwer jeszcze się budzi, pytanie zostanie wysłane automatycznie.</p>
        </div>
      </form>
    </div>
  );
}
