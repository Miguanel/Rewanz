import { useCallback, useMemo } from "react";
import { Icon } from "@/components/Icon";
import { StaleNote } from "@/components/StaleNote";
import { TagList } from "@/components/TagList";
import { VoteButtons } from "@/components/VoteButtons";
import { Link, setSearchParams, useLocation } from "@/app/router";
import { qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { plural, STATUS_LABEL, timeAgo } from "@/lib/format";
import { enqueue, type OutboxItem, useOutbox, uuid } from "@/lib/outbox";
import { useCachedQuery } from "@/lib/query";
import type { AnswerNode, ProblemDetail, Thread } from "@/lib/types";
import { AnswerTree } from "./AnswerTree";
import { Composer } from "./Composer";

const SORTS = [
  { id: "best", label: "Najlepsze" },
  { id: "top", label: "Najwyżej oceniane" },
  { id: "new", label: "Najnowsze" },
  { id: "old", label: "Najstarsze" },
];

/** Wstawia odpowiedzi z kolejki offline do drzewa, żeby autor od razu je widział. */
function mergePending(items: AnswerNode[], pending: OutboxItem[]): AnswerNode[] {
  if (!pending.length) return items;
  const clone = (n: AnswerNode): AnswerNode => ({ ...n, children: n.children.map(clone) });
  const roots = items.map(clone);
  const index = new Map<number, AnswerNode>();
  const walk = (ns: AnswerNode[]) => ns.forEach((n) => (index.set(n.id, n), walk(n.children)));
  walk(roots);
  for (const o of pending) {
    const node: AnswerNode = {
      id: -o.createdAt,
      problem_id: o.meta.problem_id as number,
      parent_id: (o.meta.parent_id as number | null) ?? null,
      body: String(o.body.body),
      score: 0,
      upvotes: 0,
      downvotes: 0,
      depth: 0,
      reply_count: 0,
      is_accepted: false,
      created_at: new Date(o.createdAt).toISOString(),
      author: { id: -1, username: String(o.meta.author), display_name: String(o.meta.display_name || o.meta.author), reputation: 0 },
      my_vote: 0,
      descendant_count: 0,
      collapsed: false,
      has_more: false,
      children: [],
      pending: true,
    };
    const parent = node.parent_id !== null ? index.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export default function ProblemPage({ params }: { params: Record<string, string> }) {
  const id = Number(params.id);
  const { search } = useLocation();
  const sort = search.get("sort") ?? "best";
  const hideLow = search.get("hide") === "low";
  const minScore = hideLow ? -2 : null;
  const { user } = useAuth();
  const outbox = useOutbox();

  const problem = useCachedQuery<ProblemDetail>(`/problems/${id}`);
  const thread = useCachedQuery<Thread>(
    `/problems/${id}/answers${qs({ sort, min_score: minScore ?? undefined })}`,
    { keepPrevious: true },
  );

  const pendingAnswers = useMemo(
    () => outbox.filter((o) => o.kind === "answer" && o.meta.problem_id === id && o.status !== "failed"),
    [outbox, id],
  );
  const items = useMemo(() => mergePending(thread.data?.items ?? [], pendingAnswers), [thread.data, pendingAnswers]);

  const p = problem.data;
  const isAuthor = !!user && !!p && user.id === p.author.id;

  const onAccept = useCallback(
    (answerId: number) =>
      enqueue({
        id: uuid(),
        kind: "action",
        method: "POST",
        path: `/problems/${id}/accept`,
        body: { answer_id: answerId },
        meta: { label: "Akceptacja odpowiedzi" },
        invalidates: [`/problems/${id}`, "/problems?"],
      }),
    [id],
  );

  const ctx = useMemo(
    () => ({ problemId: id, meId: user?.id ?? null, canAccept: isAuthor, onAccept, sort, minScore }),
    [id, user?.id, isAuthor, onAccept, sort, minScore],
  );

  if (problem.error && !p) return <div className="empty">{problem.error}</div>;
  if (!p)
    return (
      <div className="page">
        <div className="card skeleton" style={{ height: 220 }} />
      </div>
    );

  const total = (thread.data?.total ?? p.answer_count) + pendingAnswers.length;

  return (
    <div className="page">
      <StaleNote stale={problem.stale} updatedAt={problem.updatedAt} refreshing={problem.refreshing} />
      <article className="question">
        <h1 className="question-title">{p.title}</h1>
        <div className="meta">
          {p.status !== "open" && <span className={`badge badge-${p.status}`}>{STATUS_LABEL[p.status]}</span>}
          {p.category && <Link to={`/c/${p.category.slug}`} className="meta-cat">{p.category.name}</Link>}
          <span>zadane {timeAgo(p.created_at)}</span>
          <span>· {p.view_count} wyświetleń</span>
        </div>
        <div className="question-grid">
          <VoteButtons type="problem" id={p.id} score={p.score} myVote={p.my_vote} own={isAuthor} invalidates={[`/problems/${id}`]} />
          <div>
            <div className="prose">{p.body}</div>
            <TagList tags={p.tags.map((t) => t.name)} />
            {p.lat !== null && p.lng !== null && (
              <Link to={`/map?lat=${p.lat}&lng=${p.lng}&z=16&focus=${p.id}`} className="geo-link">
                <Icon name="pin" size={16} /> {p.location_label || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`} – pokaż na mapie
              </Link>
            )}
            <div className="author-box">
              <Link to={`/u/${p.author.username}`}>{p.author.display_name || p.author.username}</Link>
              <span className="rep">{p.author.reputation}</span>
            </div>
          </div>
        </div>
      </article>

      <section className="answers-section" aria-label="Odpowiedzi">
        <div className="answers-head">
          <h2>
            {total} {plural(total, "odpowiedź", "odpowiedzi", "odpowiedzi")}
          </h2>
          <div className="answers-controls">
            <select
              aria-label="Sortuj odpowiedzi"
              value={sort}
              onChange={(e) => setSearchParams({ sort: e.target.value === "best" ? null : e.target.value })}
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <label className="check">
              <input type="checkbox" checked={hideLow} onChange={(e) => setSearchParams({ hide: e.target.checked ? "low" : null })} />
              zwiń słabo ocenione
            </label>
          </div>
        </div>

        {thread.loading ? (
          <div className="card skeleton" style={{ height: 120 }} />
        ) : items.length ? (
          <AnswerTree nodes={items} ctx={ctx} />
        ) : (
          <p className="muted">Brak odpowiedzi – pomóż jako pierwszy.</p>
        )}

        {p.status !== "closed" && (
          <div className="answer-new">
            <h3>Twoja odpowiedź</h3>
            <Composer problemId={id} />
          </div>
        )}
      </section>
    </div>
  );
}
