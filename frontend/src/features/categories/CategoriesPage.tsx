import { Link } from "@/app/router";
import { StaleNote } from "@/components/StaleNote";
import { useCachedQuery } from "@/lib/query";
import type { CategoryNode } from "@/lib/types";

function Node({ n }: { n: CategoryNode }) {
  return (
    <li>
      <Link to={`/c/${n.slug}`} className="cat-row">
        <span>
          <b>{n.name}</b>
          {n.description && <small className="muted"> — {n.description}</small>}
        </span>
        <span className="count" title="Problemy (z podkategoriami)">{n.total_count}</span>
      </Link>
      {n.children.length > 0 && (
        <ul className="cat-children">
          {n.children.map((c) => (
            <Node key={c.id} n={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function CategoriesPage() {
  const q = useCachedQuery<CategoryNode[]>("/categories");
  return (
    <div className="page narrow">
      <h1>Kategorie</h1>
      <StaleNote stale={q.stale} updatedAt={q.updatedAt} refreshing={q.refreshing} />
      {q.loading && <div className="card skeleton" style={{ height: 240 }} />}
      {q.error && <div className="empty">{q.error}</div>}
      {q.data && (
        <ul className="card cat-tree">
          {q.data.map((n) => (
            <Node key={n.id} n={n} />
          ))}
        </ul>
      )}
    </div>
  );
}
