/* Service worker REWANŻ – powłoka aplikacji działa bez sieci i bez backendu.
 *
 * Strategie:
 *  - nawigacja (HTML):     sieć z limitem 3 s → kopia index.html z cache
 *  - /assets/* (hash):     cache-first (pliki niezmienne, nazwa zmienia się z treścią)
 *  - kafelki mapy OSM:     stale-while-revalidate, limit 300 sztuk
 *  - API:                  NIE przez SW – dane cache'uje aplikacja w IndexedDB,
 *                          żeby wiedzieć, co jest "nieświeże", i pokazać to w UI.
 */
const VERSION = "v1";
const SHELL = `rewanz-shell-${VERSION}`;
const ASSETS = `rewanz-assets-${VERSION}`;
const TILES = `rewanz-tiles-${VERSION}`;
const SHELL_URLS = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).catch(() => undefined));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, ASSETS, TILES]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function handleNavigation(request) {
  try {
    const res = await Promise.race([fetch(request), timeout(3000)]);
    if (res && res.ok) {
      const cache = await caches.open(SHELL);
      cache.put("/index.html", res.clone());
      return res;
    }
    throw new Error("bad response");
  } catch {
    const cached = (await caches.match("/index.html")) || (await caches.match("/"));
    return cached || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function cacheFirst(request, cacheName, max) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") {
    const cache = await caches.open(cacheName);
    cache.put(request, res.clone());
    trim(cacheName, max);
  }
  return res;
}

async function staleWhileRevalidate(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok || res.type === "opaque") {
        cache.put(request, res.clone());
        trim(cacheName, max);
      }
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSETS, 120));
    return;
  }
  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    event.respondWith(staleWhileRevalidate(request, TILES, 300));
  }
});
