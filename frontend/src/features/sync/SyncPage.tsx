import { Link } from "@/app/router";
import { useAuth } from "@/lib/auth";
import { useBackend, wakeBackend } from "@/lib/backend";
import { timeAgo } from "@/lib/format";
import { discard, flushOutbox, retry, useOutbox } from "@/lib/outbox";

const KIND: Record<string, string> = { problem: "Pytanie", answer: "Odpowiedź", vote: "Głos", action: "Akcja" };

/** Podgląd kolejki zmian czekających na serwer. */
export default function SyncPage() {
  const items = useOutbox();
  const { status } = useBackend();
  const { user } = useAuth();

  return (
    <div className="page narrow">
      <h1>Do wysłania</h1>
      {!user && items.length > 0 && (
        <p className="banner banner-down">Zaloguj się, aby wysłać zapisane zmiany. <Link to="/login?next=/sync">Logowanie</Link></p>
      )}
      {items.length === 0 ? (
        <div className="empty">
          <p>Wszystko wysłane. ✔</p>
          <Link to="/" className="btn">Wróć do problemów</Link>
        </div>
      ) : (
        <>
          <p className="muted">
            {status === "online" ? "Serwer dostępny – wysyłamy…" : "Serwer niedostępny – wyślemy automatycznie, gdy wróci."}
          </p>
          <button className="btn btn-small" onClick={() => void wakeBackend().then(() => flushOutbox())}>Wyślij teraz</button>
          <ul className="stack" style={{ marginTop: 12 }}>
            {items.map((it) => (
              <li key={it.id} className={`card outbox-item ${it.status}`}>
                <div>
                  <b>{KIND[it.kind]}</b>{" "}
                  <span className="muted">
                    · {timeAgo(it.createdAt)} · {it.status === "sending" ? "wysyłanie…" : it.status === "failed" ? "odrzucone" : "w kolejce"}
                  </span>
                </div>
                <p className="excerpt">{String(it.meta.label ?? it.body.title ?? it.body.body ?? it.path).slice(0, 160)}</p>
                {it.error && <p className="error">{it.error}</p>}
                <div className="row">
                  {it.status === "failed" && <button className="btn btn-small" onClick={() => retry(it.id)}>Ponów</button>}
                  {it.status !== "sending" && <button className="btn btn-ghost btn-small" onClick={() => discard(it.id)}>Odrzuć</button>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
