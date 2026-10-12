import { memo } from "react";
import { Link } from "@/app/router";
import { compact, plural, STATUS_LABEL, timeAgo } from "@/lib/format";
import type { ProblemListItem } from "@/lib/types";
import { Icon } from "./Icon";
import { TagList } from "./TagList";

export const ProblemCard = memo(function ProblemCard({ p, pending }: { p: ProblemListItem; pending?: boolean }) {
  const href = pending ? "/sync" : `/p/${p.id}`;
  return (
    <article className={`card problem-card ${pending ? "is-pending" : ""}`}>
      <div className="stats" aria-label="Statystyki">
        <span className={`stat ${p.score > 0 ? "pos" : p.score < 0 ? "neg" : ""}`}>
          <b>{compact(p.score)}</b> {plural(Math.abs(p.score), "głos", "głosy", "głosów")}
        </span>
        <span className={`stat ${p.status === "solved" ? "solved" : p.answer_count > 0 ? "answered" : ""}`}>
          {p.status === "solved" && <Icon name="check" size={14} />}
          <b>{compact(p.answer_count)}</b> {plural(p.answer_count, "odp.", "odp.", "odp.")}
        </span>
        <span className="stat muted">
          <Icon name="eye" size={14} /> {compact(p.view_count)}
        </span>
      </div>
      <div className="problem-main">
        <h3 className="problem-title">
          <Link to={href}>{p.title}</Link>
        </h3>
        <p className="excerpt">{p.excerpt}</p>
        <TagList tags={p.tags.map((t) => t.name)} />
        <div className="meta">
          {pending ? (
            <span className="badge badge-pending">czeka na wysłanie</span>
          ) : (
            p.status !== "open" && <span className={`badge badge-${p.status}`}>{STATUS_LABEL[p.status]}</span>
          )}
          {p.category && <Link to={`/c/${p.category.slug}`} className="meta-cat">{p.category.name}</Link>}
          {p.lat !== null && (
            <span className="meta-geo" title={p.location_label}>
              <Icon name="pin" size={14} /> {p.location_label || "na mapie"}
            </span>
          )}
          <span className="meta-author">
            <Link to={`/u/${p.author.username}`}>{p.author.display_name || p.author.username}</Link>
            {" · "}
            {timeAgo(p.last_activity_at)}
          </span>
        </div>
      </div>
    </article>
  );
});
