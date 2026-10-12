import { InfiniteList } from "@/components/InfiniteList";
import { ProblemCard } from "@/components/ProblemCard";
import { Link, setSearchParams, useLocation } from "@/app/router";
import { qs } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { useOutbox } from "@/lib/outbox";
import type { ProblemListItem } from "@/lib/types";

const SORTS = [
  { id: "activity", label: "Aktywne" },
  { id: "newest", label: "Najnowsze" },
  { id: "votes", label: "Najwyżej oceniane" },
  { id: "unanswered", label: "Bez odpowiedzi" },
];

export default function FeedPage() {
  const { search } = useLocation();
  const sort = search.get("sort") || "activity";
  const outbox = useOutbox();
  const pendingProblems = outbox.filter((o) => o.kind === "problem");
  const me = getUser();

  return (
    <div className="page">
      <div className="page-head">
        <h1>Problemy</h1>
        <Link to="/ask" className="btn btn-primary hide-mobile">Zadaj pytanie</Link>
      </div>

      <div className="tabs" role="tablist" aria-label="Sortowanie">
        {SORTS.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={sort === s.id}
            className={`tab ${sort === s.id ? "active" : ""}`}
            onClick={() => setSearchParams({ sort: s.id === "activity" ? null : s.id })}
          >
            {s.label}
          </button>
        ))}
      </div>

      {pendingProblems.length > 0 && (
        <div className="stack" style={{ marginBottom: 12 }}>
          {pendingProblems.map((o) => (
            <ProblemCard key={o.id} pending p={toPreview(o.body, o.createdAt, me?.username ?? "ty")} />
          ))}
        </div>
      )}

      <InfiniteList
        resetKey={sort}
        buildPath={(page) => `/problems${qs({ sort, page, page_size: 15 })}`}
        empty={
          <div className="empty">
            <p>Nic tu jeszcze nie ma.</p>
            <Link to="/ask" className="btn btn-primary">Zadaj pierwsze pytanie</Link>
          </div>
        }
      />
    </div>
  );
}

function toPreview(body: Record<string, unknown>, createdAt: number, username: string): ProblemListItem {
  const text = String(body.body ?? "");
  const iso = new Date(createdAt).toISOString();
  return {
    id: -createdAt,
    title: String(body.title ?? ""),
    excerpt: text.length > 200 ? `${text.slice(0, 197)}…` : text,
    status: "open",
    score: 0,
    answer_count: 0,
    view_count: 0,
    created_at: iso,
    last_activity_at: iso,
    author: { id: 0, username, display_name: username, reputation: 0 },
    category: null,
    tags: ((body.tags as string[]) ?? []).map((name, i) => ({ id: i, name, usage_count: 0 })),
    lat: (body.lat as number) ?? null,
    lng: (body.lng as number) ?? null,
    location_label: String(body.location_label ?? ""),
  };
}
