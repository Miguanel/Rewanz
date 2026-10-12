import { navigate } from "@/app/router";
import { getUser } from "@/lib/auth";
import { compact } from "@/lib/format";
import { enqueue, useOutbox, uuid } from "@/lib/outbox";
import { Icon } from "./Icon";

interface Props {
  type: "problem" | "answer";
  id: number;
  score: number;
  myVote: number;
  own?: boolean;
  vertical?: boolean;
  invalidates?: string[];
}

/** Głosowanie optymistyczne: wynik zmienia się od razu, głos idzie przez kolejkę
 *  (działa także gdy backend śpi). Stan "w locie" wyliczamy z outboxa, więc
 *  przetrwa nawet przeładowanie strony. */
export function VoteButtons({ type, id, score, myVote, own, vertical = true, invalidates = [] }: Props) {
  const key = `${type}:${id}`;
  const outbox = useOutbox();
  const pending = outbox.find((o) => o.kind === "vote" && o.meta.key === key && o.status !== "failed");
  const my = pending ? (pending.body.value as number) : myVote;
  const shown = pending ? score - myVote + my : score;

  const cast = (dir: 1 | -1) => {
    if (!getUser()) {
      navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (own) return;
    const value = my === dir ? 0 : dir;
    enqueue({
      id: uuid(),
      kind: "vote",
      method: "POST",
      path: "/votes",
      body: { target_type: type, target_id: id, value },
      meta: { key },
      invalidates,
    });
  };

  return (
    <div className={`votes ${vertical ? "vertical" : ""}`} aria-label="Ocena">
      <button
        type="button"
        className={`vote-btn ${my === 1 ? "on up" : ""}`}
        aria-pressed={my === 1}
        aria-label="Przydatne"
        disabled={own}
        title={own ? "Nie możesz oceniać własnych wpisów" : "Przydatne"}
        onClick={() => cast(1)}
      >
        <Icon name="up" />
      </button>
      <span className={`vote-score ${pending ? "is-pending" : ""}`} aria-live="polite">{compact(shown)}</span>
      <button
        type="button"
        className={`vote-btn ${my === -1 ? "on down" : ""}`}
        aria-pressed={my === -1}
        aria-label="Nieprzydatne"
        disabled={own}
        title={own ? "Nie możesz oceniać własnych wpisów" : "Nieprzydatne"}
        onClick={() => cast(-1)}
      >
        <Icon name="down" />
      </button>
    </div>
  );
}
