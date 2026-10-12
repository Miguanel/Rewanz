import { memo, useState } from "react";
import { Icon } from "@/components/Icon";
import { VoteButtons } from "@/components/VoteButtons";
import { Link } from "@/app/router";
import { qs } from "@/lib/api";
import { plural, timeAgo } from "@/lib/format";
import { useCachedQuery } from "@/lib/query";
import type { AnswerNode, Thread } from "@/lib/types";
import { Composer } from "./Composer";

/** Wcięcia kończą się na kilku poziomach (telefon: 2, komputer: 6 – patrz CSS
 *  .answers.level-N). Głębsze odpowiedzi idą płasko z dopiskiem "↳ do autor",
 *  żeby tekst nie zwężał się do wąskiej kolumny. */
const MAX_INDENT = 7; // klasa level-7 = "głębiej niż limit"
const SHOW_REPLY_TO_FROM = 3;

interface Ctx {
  problemId: number;
  meId: number | null;
  canAccept: boolean;
  onAccept: (answerId: number) => void;
  sort: string;
  minScore: number | null;
}

export function AnswerTree({ nodes, ctx, level = 0 }: { nodes: AnswerNode[]; ctx: Ctx; level?: number }) {
  return (
    <ol className={`answers level-${Math.min(level, MAX_INDENT)}`}>
      {nodes.map((n) => (
        <AnswerItem key={n.id} node={n} ctx={ctx} level={level} />
      ))}
    </ol>
  );
}

const AnswerItem = memo(function AnswerItem({
  node,
  ctx,
  level,
  parentAuthor,
}: {
  node: AnswerNode;
  ctx: Ctx;
  level: number;
  parentAuthor?: string;
}) {
  const [collapsed, setCollapsed] = useState(node.collapsed);
  const [replying, setReplying] = useState(false);
  const [continued, setContinued] = useState(false);
  const own = ctx.meId === node.author.id;

  return (
    <li className={`answer ${node.is_accepted ? "accepted" : ""} ${node.pending ? "is-pending" : ""}`} id={`a${node.id}`}>
      <div className="answer-rail">
        <button
          className="collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Rozwiń wątek" : "Zwiń wątek"}
        >
          <Icon name={collapsed ? "plus" : "minus"} size={14} />
        </button>
        {!collapsed && <span className="rail-line" aria-hidden="true" />}
      </div>
      <div className="answer-body">
        <header className="answer-head">
          <Link to={`/u/${node.author.username}`} className="answer-author">
            {node.author.display_name || node.author.username}
          </Link>
          <span className="rep" title="Reputacja">{node.author.reputation}</span>
          {level >= SHOW_REPLY_TO_FROM && parentAuthor && <span className="reply-to">↳ do {parentAuthor}</span>}
          <span className="muted">· {node.pending ? "wysyłanie…" : timeAgo(node.created_at)}</span>
          {node.is_accepted && (
            <span className="badge badge-solved"><Icon name="check" size={12} /> zaakceptowana</span>
          )}
          {collapsed && node.descendant_count > 0 && (
            <span className="muted">
              · ukryto {node.descendant_count + 1} {plural(node.descendant_count + 1, "wpis", "wpisy", "wpisów")}
            </span>
          )}
        </header>

        {!collapsed && (
          <>
            <div className="prose">{node.body}</div>
            <div className="answer-actions">
              {!node.pending && (
                <VoteButtons
                  type="answer"
                  id={node.id}
                  score={node.score}
                  myVote={node.my_vote}
                  own={own}
                  vertical={false}
                  invalidates={[`/problems/${ctx.problemId}/answers`]}
                />
              )}
              {!node.pending && (
                <button className="btn btn-ghost btn-small" onClick={() => setReplying((r) => !r)}>
                  <Icon name="reply" size={16} /> Odpowiedz
                </button>
              )}
              {ctx.canAccept && level === 0 && !node.is_accepted && !node.pending && (
                <button className="btn btn-ghost btn-small" onClick={() => ctx.onAccept(node.id)}>
                  <Icon name="check" size={16} /> Akceptuj
                </button>
              )}
            </div>
            {replying && (
              <Composer
                problemId={ctx.problemId}
                parentId={node.id}
                autoFocus
                onDone={() => setReplying(false)}
                placeholder={`Odpowiedź do ${node.author.display_name || node.author.username}…`}
              />
            )}
            {node.children.length > 0 && (
              <ol className={`answers level-${Math.min(level + 1, MAX_INDENT)}`}>
                {node.children.map((c) => (
                  <AnswerItem
                    key={c.id}
                    node={c}
                    ctx={ctx}
                    level={level + 1}
                    parentAuthor={node.author.display_name || node.author.username}
                  />
                ))}
              </ol>
            )}
            {node.has_more &&
              (continued ? (
                <Continuation answerId={node.id} ctx={ctx} level={level + 1} parentAuthor={node.author.display_name || node.author.username} />
              ) : (
                <button className="btn btn-link" onClick={() => setContinued(true)}>
                  Kontynuuj wątek ({node.reply_count} {plural(node.reply_count, "odpowiedź", "odpowiedzi", "odpowiedzi")}) →
                </button>
              ))}
          </>
        )}
      </div>
    </li>
  );
});

/** Dociąga głębsze poziomy wątku ("kontynuuj wątek") – jedno zapytanie po ścieżce. */
function Continuation({ answerId, ctx, level, parentAuthor }: { answerId: number; ctx: Ctx; level: number; parentAuthor: string }) {
  const q = useCachedQuery<Thread>(
    `/answers/${answerId}/thread${qs({ sort: ctx.sort, max_depth: 6, min_score: ctx.minScore ?? undefined })}`,
  );
  if (!q.data) return <div className="muted small">Wczytywanie…</div>;
  const children = q.data.items[0]?.children ?? [];
  return (
    <ol className={`answers level-${Math.min(level, MAX_INDENT)}`}>
      {children.map((c) => (
        <AnswerItem key={c.id} node={c} ctx={ctx} level={level} parentAuthor={parentAuthor} />
      ))}
    </ol>
  );
}
