import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { InfiniteList } from "@/components/InfiniteList";
import { setSearchParams, useLocation } from "@/app/router";
import { qs } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/format";
import type { Facets } from "@/lib/types";

const SORTS = [
  { id: "relevance", label: "Trafność" },
  { id: "votes", label: "Ocena" },
  { id: "newest", label: "Najnowsze" },
  { id: "activity", label: "Aktywność" },
  { id: "views", label: "Wyświetlenia" },
  { id: "unanswered", label: "Bez odpowiedzi" },
];

export default function SearchPage() {
  const { search } = useLocation();
  const q = search.get("q") ?? "";
  const tags = (search.get("tags") ?? "").split(",").filter(Boolean);
  const category = search.get("category") ?? "";
  const status = search.get("status") ?? "";
  const hasLocation = search.get("has_location") ?? "";
  const sort = search.get("sort") ?? "relevance";

  const [text, setText] = useState(q);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // debounce wpisywania – nie strzelamy do API przy każdej literze
  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim() !== q) setSearchParams({ q: text.trim() || null });
    }, 350);
    return () => clearTimeout(t);
  }, [text, q]);

  const toggleTag = (t: string) => {
    const next = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
    setSearchParams({ tags: next.join(",") || null });
  };

  const params = { q, tags: tags.join(","), category, status, has_location: hasLocation, sort };
  const key = JSON.stringify(params);
  const activeCount = tags.length + (category ? 1 : 0) + (status ? 1 : 0) + (hasLocation ? 1 : 0);

  return (
    <div className="page">
      <form
        className="searchbar"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setSearchParams({ q: text.trim() || null });
          (document.activeElement as HTMLElement | null)?.blur(); // chowa klawiaturę na telefonie
        }}
      >
        <Icon name="search" />
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          placeholder="Szukaj w problemach i odpowiedziach…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Szukaj"
        />
        <button
          type="button"
          className={`btn btn-ghost btn-small ${activeCount ? "has-badge" : ""}`}
          onClick={() => setShowFilters((s) => !s)}
          aria-expanded={showFilters}
        >
          <Icon name="filter" size={16} /> Filtry{activeCount ? ` (${activeCount})` : ""}
        </button>
      </form>

      {tags.length > 0 && (
        <div className="chips">
          {tags.map((t) => (
            <button key={t} className="chip on" onClick={() => toggleTag(t)}>
              {t} <Icon name="x" size={14} />
            </button>
          ))}
        </div>
      )}

      {showFilters && (
        <section className="card filters" aria-label="Filtry">
          <label>
            Sortuj
            <select value={sort} onChange={(e) => setSearchParams({ sort: e.target.value })}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setSearchParams({ status: e.target.value || null })}>
              <option value="">dowolny</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}{facets?.status[k] !== undefined ? ` (${facets.status[k]})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lokalizacja
            <select value={hasLocation} onChange={(e) => setSearchParams({ has_location: e.target.value || null })}>
              <option value="">wszystkie</option>
              <option value="true">tylko z mapy</option>
              <option value="false">bez lokalizacji</option>
            </select>
          </label>
          {facets && facets.categories.length > 0 && (
            <label>
              Kategoria
              <select value={category} onChange={(e) => setSearchParams({ category: e.target.value || null })}>
                <option value="">wszystkie</option>
                {category && !facets.categories.some((c) => c.slug === category) && <option value={category}>{category}</option>}
                {facets.categories.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name} ({c.count})</option>
                ))}
              </select>
            </label>
          )}
          {activeCount > 0 && (
            <button
              className="btn btn-ghost btn-small"
              onClick={() => setSearchParams({ tags: null, category: null, status: null, has_location: null })}
            >
              Wyczyść filtry
            </button>
          )}
        </section>
      )}

      {facets && facets.tags.length > 0 && (
        <div className="chips scroll-x" aria-label="Popularne tagi w wynikach">
          {facets.tags.filter((t) => !tags.includes(t.name)).map((t) => (
            <button key={t.name} className="chip" onClick={() => toggleTag(t.name)}>
              {t.name} <small>{t.count}</small>
            </button>
          ))}
        </div>
      )}

      <InfiniteList
        resetKey={key}
        buildPath={(page) => `/search${qs({ ...params, page, page_size: 15, facets: page === 1 })}`}
        onFirstPage={(r) => r.facets && setFacets(r.facets)}
        empty={<div className="empty">Brak wyników. Spróbuj innych słów albo usuń filtry.</div>}
      />
    </div>
  );
}
