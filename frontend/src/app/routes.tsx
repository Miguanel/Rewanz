import { route, type RouteDef } from "./router";

/** Każdy ekran = osobny plik JS ładowany dopiero, gdy jest potrzebny.
 *  Po starcie aplikacja w wolnej chwili dociąga resztę (prefetchRoutes),
 *  a service worker zapisuje je w cache – działają potem offline. */
export const routes: RouteDef[] = [
  route("/", () => import("@/features/feed/FeedPage")),
  route("/search", () => import("@/features/search/SearchPage")),
  route("/p/:id", () => import("@/features/problem/ProblemPage")),
  route("/ask", () => import("@/features/ask/AskPage")),
  route("/map", () => import("@/features/map/MapPage")),
  route("/c", () => import("@/features/categories/CategoriesPage")),
  route("/c/:slug", () => import("@/features/categories/CategoryPage")),
  route("/u/:username", () => import("@/features/user/ProfilePage")),
  route("/login", () => import("@/features/user/LoginPage")),
  route("/sync", () => import("@/features/sync/SyncPage")),
];

export function prefetchRoutes() {
  const run = () => routes.forEach((r) => void r.load().catch(() => undefined));
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: object) => void }).requestIdleCallback;
  if (ric) ric(run, { timeout: 4000 });
  else setTimeout(run, 2500);
}
