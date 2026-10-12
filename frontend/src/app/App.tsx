import { Component, lazy, type ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/lib/auth";
import { useOutbox } from "@/lib/outbox";
import { Link, match, useLocation } from "./router";
import { prefetchRoutes, routes } from "./routes";

const lazyCache = new Map<(typeof routes)[number], ReturnType<typeof lazy>>();
function lazyFor(def: (typeof routes)[number]) {
  let c = lazyCache.get(def);
  if (!c) {
    c = lazy(def.load);
    lazyCache.set(def, c);
  }
  return c;
}

class RouteBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (this.state.failed)
      return (
        <div className="empty">
          <p>Nie udało się wczytać tego ekranu. Jeśli jesteś offline, otwórz go ponownie po połączeniu.</p>
          <button className="btn" onClick={() => window.location.reload()}>Odśwież</button>
        </div>
      );
    return this.props.children;
  }
}

function PageSkeleton() {
  return (
    <div className="stack" aria-busy="true" aria-label="Ładowanie">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card skeleton" style={{ height: 96 }} />
      ))}
    </div>
  );
}

function NotFound() {
  return (
    <div className="empty">
      <h1>Nie ma takiej strony</h1>
      <Link to="/" className="btn">Wróć do listy</Link>
    </div>
  );
}

const NAV = [
  { to: "/", label: "Problemy", icon: "list" as const, test: (p: string) => p === "/" || p.startsWith("/p/") },
  { to: "/search", label: "Szukaj", icon: "search" as const, test: (p: string) => p.startsWith("/search") },
  { to: "/ask", label: "Zadaj", icon: "plus" as const, test: (p: string) => p === "/ask" },
  { to: "/map", label: "Mapa", icon: "map" as const, test: (p: string) => p === "/map" },
  { to: "/c", label: "Kategorie", icon: "folder" as const, test: (p: string) => p.startsWith("/c") },
];

export function App() {
  const loc = useLocation();
  const { user } = useAuth();
  const outbox = useOutbox();
  const pending = outbox.filter((o) => o.status !== "failed").length;
  const failed = outbox.filter((o) => o.status === "failed").length;
  const [update, setUpdate] = useState<null | (() => void)>(null);

  const hit = useMemo(() => match(routes, loc.pathname), [loc.pathname]);
  const Page = hit ? lazyFor(hit.def) : null;

  useEffect(() => {
    prefetchRoutes();
    const onUpdate = (e: Event) => setUpdate(() => (e as CustomEvent<() => void>).detail);
    window.addEventListener("rewanz:update", onUpdate);
    return () => window.removeEventListener("rewanz:update", onUpdate);
  }, []);

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="REWANŻ – strona główna">
          <span className="brand-mark">R</span>
          <span className="brand-name">REWANŻ</span>
        </Link>
        <nav className="topnav" aria-label="Główna nawigacja">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className={n.test(loc.pathname) ? "active" : ""}>{n.label}</Link>
          ))}
        </nav>
        <div className="topbar-right">
          {(pending > 0 || failed > 0) && (
            <Link to="/sync" className={`sync-pill ${failed ? "has-failed" : ""}`} title="Zmiany czekające na wysłanie">
              <Icon name="sync" /> {pending + failed}
            </Link>
          )}
          {user ? (
            <Link to={`/u/${user.username}`} className="avatar" title={user.display_name}>
              {(user.display_name || user.username).slice(0, 1).toUpperCase()}
            </Link>
          ) : (
            <Link to={`/login?next=${encodeURIComponent(loc.href)}`} className="btn btn-small">Zaloguj</Link>
          )}
        </div>
      </header>

      <ConnectionBanner />

      <main className="main" id="main">
        <RouteBoundary resetKey={loc.pathname}>
          <Suspense fallback={<PageSkeleton />}>
            {Page && hit ? <Page params={hit.params} /> : <NotFound />}
          </Suspense>
        </RouteBoundary>
      </main>

      {update && (
        <div className="toast" role="status">
          Dostępna nowa wersja.
          <button className="btn btn-small" onClick={() => update()}>Odśwież</button>
        </div>
      )}

      <nav className="bottomnav" aria-label="Nawigacja">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className={`${n.test(loc.pathname) ? "active" : ""} ${n.to === "/ask" ? "fab" : ""}`}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
