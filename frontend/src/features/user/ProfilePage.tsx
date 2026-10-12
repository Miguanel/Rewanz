import { useState } from "react";
import { Icon } from "@/components/Icon";
import { ProblemCard } from "@/components/ProblemCard";
import { StaleNote } from "@/components/StaleNote";
import { Link, navigate } from "@/app/router";
import { api, ApiError } from "@/lib/api";
import { logout, updateUser, useAuth } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { invalidate, useCachedQuery } from "@/lib/query";
import type { Portfolio, PortfolioItem, UserPrivate } from "@/lib/types";

/** Profil + portfolio. Edycja wymaga połączenia z serwerem (rzadka operacja). */
export default function ProfilePage({ params }: { params: Record<string, string> }) {
  const { user } = useAuth();
  const username = params.username;
  const path = `/users/${encodeURIComponent(username)}`;
  const q = useCachedQuery<Portfolio>(path);
  const isMe = !!user && user.username.toLowerCase() === username.toLowerCase();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  if (q.error && !q.data) return <div className="empty">{q.error}</div>;
  if (!q.data) return <div className="page"><div className="card skeleton" style={{ height: 240 }} /></div>;
  const { user: u, stats, top_tags, portfolio, recent_problems, top_answers } = q.data;

  return (
    <div className="page">
      <StaleNote stale={q.stale} updatedAt={q.updatedAt} refreshing={q.refreshing} />
      <section className="profile card">
        <div className="profile-avatar" aria-hidden="true">{(u.display_name || u.username).slice(0, 1).toUpperCase()}</div>
        <div className="profile-main">
          <h1>{u.display_name || u.username}</h1>
          <p className="muted">@{u.username} · dołączył(a) {timeAgo(u.created_at)}{u.location && ` · ${u.location}`}</p>
          {u.bio && <p className="prose">{u.bio}</p>}
          {u.website && (
            <a href={u.website} target="_blank" rel="noopener noreferrer nofollow">{u.website.replace(/^https?:\/\//, "")}</a>
          )}
          {u.skills && (
            <div className="chips">
              {u.skills.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (
                <span key={s} className="chip">{s}</span>
              ))}
            </div>
          )}
          {isMe && (
            <div className="row wrap">
              <button className="btn btn-small" onClick={() => setEditing((e) => !e)}>Edytuj profil</button>
              <button className="btn btn-ghost btn-small" onClick={() => (logout(), navigate("/"))}>Wyloguj</button>
            </div>
          )}
        </div>
      </section>

      {isMe && editing && <ProfileForm me={user!} onDone={() => (setEditing(false), invalidate(path))} />}

      <div className="kpis">
        <div className="kpi"><b>{u.reputation}</b><span>reputacja</span></div>
        <div className="kpi"><b>{stats.answers}</b><span>odpowiedzi</span></div>
        <div className="kpi"><b>{stats.accepted_answers}</b><span>zaakceptowanych</span></div>
        <div className="kpi"><b>{stats.problems}</b><span>pytań</span></div>
      </div>

      {top_tags.length > 0 && (
        <section className="section">
          <h2>Specjalizacje</h2>
          <div className="chips">
            {top_tags.map((t) => (
              <Link key={t.name} className="chip" to={`/search?tags=${encodeURIComponent(t.name)}`}>{t.name} <small>{t.count}</small></Link>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="page-head">
          <h2>Portfolio</h2>
          {isMe && <button className="btn btn-small" onClick={() => setAdding((a) => !a)}><Icon name="plus" size={16} /> Dodaj</button>}
        </div>
        {isMe && adding && <PortfolioForm onDone={() => (setAdding(false), invalidate(path))} />}
        {portfolio.length === 0 && !adding && <p className="muted">Brak pozycji w portfolio.</p>}
        <div className="grid-2">
          {portfolio.map((it) => (
            <PortfolioCard key={it.id} item={it} canDelete={isMe} onDeleted={() => invalidate(path)} />
          ))}
        </div>
      </section>

      {top_answers.length > 0 && (
        <section className="section">
          <h2>Najlepsze odpowiedzi</h2>
          <ol className="card mini-list">
            {top_answers.map((a) => (
              <li key={a.id}>
                <span className={`mini-score ${a.is_accepted ? "accepted" : ""}`}>{a.score}</span>
                <Link to={`/p/${a.problem_id}#a${a.id}`}>{a.problem_title}</Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {recent_problems.length > 0 && (
        <section className="section">
          <h2>Pytania</h2>
          <div className="stack">
            {recent_problems.map((p) => <ProblemCard key={p.id} p={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function ProfileForm({ me, onDone }: { me: UserPrivate; onDone: () => void }) {
  const [f, setF] = useState({ display_name: me.display_name, bio: me.bio, location: me.location, website: me.website, skills: me.skills });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const updated = await api<UserPrivate>("/users/me", { method: "PATCH", body: f, timeoutMs: 60000 });
      updateUser(updated);
      onDone();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="form card" onSubmit={(e) => (e.preventDefault(), void save())}>
      <label>Wyświetlana nazwa<input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} maxLength={64} /></label>
      <label>O mnie<textarea rows={4} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></label>
      <label>Miejscowość<input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
      <label>Strona www<input type="url" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="https://" /></label>
      <label>Umiejętności (po przecinku)<input value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} /></label>
      {err && <p className="error">{err}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Zapisywanie…" : "Zapisz"}</button>
    </form>
  );
}

function PortfolioForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ title: "", description: "", url: "", tags: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api<PortfolioItem>("/users/me/portfolio", { method: "POST", body: f, timeoutMs: 60000 });
      onDone();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="form card" onSubmit={(e) => (e.preventDefault(), void save())}>
      <label>Tytuł<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={2} maxLength={120} /></label>
      <label>Opis<textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      <label>Link<input type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://" /></label>
      <label>Tagi (po przecinku)<input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></label>
      {err && <p className="error">{err}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Zapisywanie…" : "Dodaj do portfolio"}</button>
    </form>
  );
}

function PortfolioCard({ item, canDelete, onDeleted }: { item: PortfolioItem; canDelete: boolean; onDeleted: () => void }) {
  const remove = async () => {
    if (!window.confirm(`Usunąć „${item.title}” z portfolio?`)) return;
    await api(`/users/me/portfolio/${item.id}`, { method: "DELETE" }).catch(() => undefined);
    onDeleted();
  };
  return (
    <article className="card portfolio-card">
      <h3>{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer nofollow">{item.title}</a> : item.title}</h3>
      {item.description && <p className="prose">{item.description}</p>}
      {item.tags && (
        <div className="chips">
          {item.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => <span key={t} className="chip">{t}</span>)}
        </div>
      )}
      {canDelete && <button className="btn btn-ghost btn-small" onClick={() => void remove()}>Usuń</button>}
    </article>
  );
}
