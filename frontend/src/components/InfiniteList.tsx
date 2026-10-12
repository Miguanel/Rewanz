import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useCachedQuery } from "@/lib/query";
import type { SearchResult } from "@/lib/types";
import { ProblemCard } from "./ProblemCard";
import { StaleNote } from "./StaleNote";

/** Lista stronicowana: każda strona to osobne zapytanie z własnym cache,
 *  więc po powrocie offline widać wszystkie wcześniej przewinięte strony. */
export function InfiniteList({
  buildPath,
  resetKey,
  empty,
  onFirstPage,
}: {
  buildPath: (page: number) => string;
  resetKey: string;
  empty: ReactNode;
  onFirstPage?: (r: SearchResult) => void;
}) {
  // liczba stron resetuje się razem ze zmianą filtrów (bez dodatkowego renderu)
  const [state, setState] = useState({ key: resetKey, pages: 1 });
  const pages = state.key === resetKey ? state.pages : 1;
  const more = useCallback(
    () => setState((s) => ({ key: resetKey, pages: (s.key === resetKey ? s.pages : 1) + 1 })),
    [resetKey],
  );
  return (
    <div className="stack">
      {Array.from({ length: pages }, (_, i) => (
        <Chunk
          key={`${resetKey}:${i}`}
          path={buildPath(i + 1)}
          first={i === 0}
          last={i === pages - 1}
          empty={empty}
          onFirstPage={onFirstPage}
          onMore={more}
        />
      ))}
    </div>
  );
}

function Chunk({
  path,
  first,
  last,
  empty,
  onFirstPage,
  onMore,
}: {
  path: string;
  first: boolean;
  last: boolean;
  empty: ReactNode;
  onFirstPage?: (r: SearchResult) => void;
  onMore: () => void;
}) {
  const q = useCachedQuery<SearchResult>(path);
  const sentinel = useRef<HTMLDivElement>(null);
  const canMore = last && !!q.data?.has_more;

  useEffect(() => {
    if (first && q.data) onFirstPage?.(q.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, first]);

  useEffect(() => {
    if (!canMore || !sentinel.current) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && onMore(), { rootMargin: "600px" });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [canMore, onMore]);

  if (q.loading)
    return (
      <>
        {[0, 1, 2].map((i) => (
          <div key={i} className="card skeleton" style={{ height: 110 }} />
        ))}
      </>
    );
  if (q.error && !q.data) return <div className="empty">{q.error}</div>;
  if (!q.data) return null;
  if (first && q.data.items.length === 0) return <>{empty}</>;
  return (
    <>
      {first && <StaleNote stale={q.stale} updatedAt={q.updatedAt} refreshing={q.refreshing} />}
      {q.data.items.map((p) => (
        <ProblemCard key={p.id} p={p} />
      ))}
      {canMore && (
        <div ref={sentinel} className="more">
          <button className="btn btn-ghost" onClick={onMore}>Pokaż więcej</button>
        </div>
      )}
    </>
  );
}
