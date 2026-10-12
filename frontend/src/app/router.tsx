/** Mały router oparty o History API (~80 linii zamiast zależności).
 *  Trasy w routes.tsx są ładowane leniwie (osobny plik JS na ekran).
 *  Przy dużej rozbudowie można go podmienić na react-router bez zmian w ekranach,
 *  bo ekrany używają tylko: <Link>, navigate(), useLocation(), useParams-like props. */
import { type AnchorHTMLAttributes, type ComponentType, type MouseEvent, useSyncExternalStore } from "react";

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

window.history.scrollRestoration = "manual";
window.addEventListener("popstate", (e) => {
  notify();
  // przywróć przewinięcie po "wstecz" – treść z cache pojawia się po chwili, więc kilka prób
  const y = (e.state as { scrollY?: number } | null)?.scrollY ?? 0;
  [0, 60, 200, 450].forEach((ms) => setTimeout(() => window.scrollTo(0, y), ms));
});

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const url = new URL(to, window.location.origin);
  const next = url.pathname + url.search + url.hash;
  if (next === window.location.pathname + window.location.search + window.location.hash) return;
  // zapamiętaj pozycję przewinięcia bieżącego ekranu (powrót "wstecz" wraca w to samo miejsce)
  const prev = window.history.state ?? {};
  window.history.replaceState({ ...prev, scrollY: window.scrollY }, "");
  if (opts.replace) window.history.replaceState({}, "", next);
  else window.history.pushState({}, "", next);
  notify();
  window.scrollTo(0, 0);
}

function snapshot() {
  return window.location.pathname + window.location.search;
}

export interface Loc {
  pathname: string;
  search: URLSearchParams;
  href: string;
}

let cachedHref = "";
let cachedLoc: Loc | null = null;

export function useLocation(): Loc {
  const href = useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, snapshot);
  if (href !== cachedHref || !cachedLoc) {
    const u = new URL(href, window.location.origin);
    cachedHref = href;
    cachedLoc = { pathname: u.pathname, search: u.searchParams, href };
  }
  return cachedLoc;
}

/** Ustawia parametry query bez dokładania wpisu do historii (filtry, sortowanie). */
export function setSearchParams(patch: Record<string, string | null | undefined>) {
  const u = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") u.searchParams.delete(k);
    else u.searchParams.set(k, v);
  }
  window.history.replaceState(window.history.state, "", u.pathname + u.search);
  notify();
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handle} {...rest} />;
}

export interface RouteDef {
  pattern: RegExp;
  keys: string[];
  load: () => Promise<{ default: ComponentType<{ params: Record<string, string> }> }>;
}

export function route(path: string, load: RouteDef["load"]): RouteDef {
  const keys: string[] = [];
  const src = path.replace(/:([a-zA-Z_]+)/g, (_, k) => {
    keys.push(k);
    return "([^/]+)";
  });
  return { pattern: new RegExp(`^${src}/?$`), keys, load };
}

export function match(routes: RouteDef[], pathname: string): { def: RouteDef; params: Record<string, string> } | null {
  for (const def of routes) {
    const m = def.pattern.exec(pathname);
    if (m) {
      const params: Record<string, string> = {};
      def.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { def, params };
    }
  }
  return null;
}
