import { Link } from "@/app/router";
import { InfiniteList } from "@/components/InfiniteList";
import { StaleNote } from "@/components/StaleNote";
import { qs } from "@/lib/api";
import { STATUS_LABEL } from "@/lib/format";
import { useCachedQuery } from "@/lib/query";
import type { CategorySummary } from "@/lib/types";

/** Podsumowanie kategorii: statystyki, najczęstsze tagi, najlepsze wątki, podkategorie. */
export default function CategoryPage({ params }: { params: Record<string, string> }) {
  const slug = params.slug;
  const q = useCachedQuery<CategorySummary>(`/categories/${slug}/summary`);
  const s = q.data;

  return (
    <div className="page">
      <nav className="crumbs"><Link to="/c">Kategorie</Link> /</nav>
      {q.error && !s && <div className="empty">{q.error}</div>}
      {!s && !q.error && <div className="card skeleton" style={{ height: 200 }} />}
      {s && (
        <>
          <h1>{s.category.name}</h1>
          <StaleNote stale={q.stale} updatedAt={q.updatedAt} refreshing={q.refreshing} />
          {s.category.description && <p className="muted">{s.category.description}</p>}
          <p className="headline">{s.headline}</p>

          <div className="kpis">
            <div className="kpi"><b>{s.stats.total}</b><span>problemów</span></div>
            <div className="kpi"><b>{Math.round(s.stats.solved_ratio * 100)}%</b><span>rozwiązanych</span></div>
            <div className="kpi"><b>{s.stats.unanswered}</b><span>bez odpowiedzi</span></div>
            <div className="kpi"><b>{s.stats.answers}</b><span>odpowiedzi</span></div>
          </div>
          <div className="bar" role="img" aria-label={`Rozwiązane ${s.stats.solved} z ${s.stats.total}`}>
            <div style={{ width: `${s.stats.total ? (s.stats.solved / s.stats.total) * 100 : 0}%` }} />
          </div>

          {s.subcategories.length > 0 && (
            <section className="section">
              <h2>Podkategorie</h2>
              <div className="chips">
                {s.subcategories.map((c) => (
                  <Link key={c.slug} to={`/c/${c.slug}`} className="chip">
                    {c.name} <small>{c.total}</small>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {s.top_tags.length > 0 && (
            <section className="section">
              <h2>Najczęstsze tematy</h2>
              <div className="chips">
                {s.top_tags.map((t) => (
                  <Link key={t.name} to={`/search?tags=${encodeURIComponent(t.name)}&category=${slug}`} className="chip">
                    {t.name} <small>{t.count}</small>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {s.top_problems.length > 0 && (
            <section className="section">
              <h2>Najwyżej oceniane</h2>
              <ol className="card mini-list">
                {s.top_problems.map((p) => (
                  <li key={p.id}>
                    <span className="mini-score">{p.score}</span>
                    <Link to={`/p/${p.id}`}>{p.title}</Link>
                    {p.status !== "open" && <span className={`badge badge-${p.status}`}>{STATUS_LABEL[p.status]}</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}

      <section className="section">
        <h2>Wszystkie problemy</h2>
        <InfiniteList
          resetKey={slug}
          buildPath={(page) => `/problems${qs({ category: slug, sort: "activity", page, page_size: 15 })}`}
          empty={<div className="empty">Brak problemów w tej kategorii.</div>}
        />
      </section>
    </div>
  );
}
