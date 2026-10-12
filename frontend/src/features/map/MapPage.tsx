import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { Icon } from "@/components/Icon";
import { navigate, useLocation } from "@/app/router";
import { api, ApiError, qs } from "@/lib/api";
import { getBackendState, subscribeBackend } from "@/lib/backend";
import { readCache, writeCache } from "@/lib/query";
import type { Marker } from "@/lib/types";
import { DEFAULT_CENTER, escapeHtml, loadLeaflet, STATUS_COLOR, TILE_ATTRIBUTION, TILE_URL } from "./leaflet";

const VIEW_KEY = "rewanz.map.view";
const CACHE_KEY = "geo:last";

export default function MapPage() {
  const { search } = useLocation();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let unsubBackend: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    void loadLeaflet().then(async (L) => {
      if (disposed || !box.current) return;
      const saved = (() => {
        try {
          return JSON.parse(localStorage.getItem(VIEW_KEY) || "null") as { c: [number, number]; z: number } | null;
        } catch {
          return null;
        }
      })();
      const lat = Number(search.get("lat"));
      const lng = Number(search.get("lng"));
      const center: [number, number] = lat && lng ? [lat, lng] : saved?.c ?? DEFAULT_CENTER;
      const zoom = Number(search.get("z")) || saved?.z || 13;
      const focus = Number(search.get("focus")) || null;

      const map = L.map(box.current, { zoomControl: false, preferCanvas: true }).setView(center, zoom);
      mapRef.current = map;
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION, detectRetina: true }).addTo(map);
      const layer = L.layerGroup().addTo(map);
      const shown = new Map<number, Leaflet.CircleMarker>();

      const draw = (markers: Marker[]) => {
        const keep = new Set(markers.map((m) => m.id));
        for (const [id, cm] of shown) if (!keep.has(id)) (layer.removeLayer(cm), shown.delete(id));
        for (const m of markers) {
          if (shown.has(m.id)) continue;
          const cm = L.circleMarker([m.lat, m.lng], {
            radius: Math.min(14, 7 + Math.max(0, m.score) / 3),
            color: "#fff",
            weight: 2,
            fillColor: STATUS_COLOR[m.status] ?? STATUS_COLOR.open,
            fillOpacity: 0.9,
          }).bindPopup(
            `<div class="map-popup"><a href="/p/${m.id}" data-nav>${escapeHtml(m.title)}</a>` +
              `<div class="muted">${escapeHtml(m.location_label || "")}</div>` +
              `<div class="muted">${m.score} pkt · ${m.answer_count} odp.</div></div>`,
          );
          cm.addTo(layer);
          shown.set(m.id, cm);
          if (m.id === focus) setTimeout(() => cm.openPopup(), 300);
        }
        setCount(markers.length);
      };

      const cached = await readCache<Marker[]>(CACHE_KEY);
      if (cached) draw(cached.data);

      const load = async () => {
        const b = map.getBounds();
        const bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
          .map((v, i) => Math.max(i % 2 ? -90 : -180, Math.min(i % 2 ? 90 : 180, v)).toFixed(5))
          .join(",");
        try {
          const markers = await api<Marker[]>(`/geo/problems${qs({ bbox, status: status || undefined })}`);
          if (disposed) return;
          setError(null);
          draw(markers);
          writeCache(CACHE_KEY, markers);
        } catch (e) {
          if ((e as ApiError).retryable) {
            unsubBackend?.();
            unsubBackend = subscribeBackend(() => {
              if (getBackendState().status === "online") {
                unsubBackend?.();
                unsubBackend = null;
                void load();
              }
            });
          } else setError((e as ApiError).message);
        }
      };
      map.on("moveend", () => {
        clearTimeout(timer);
        timer = setTimeout(load, 300);
        try {
          const c = map.getCenter();
          localStorage.setItem(VIEW_KEY, JSON.stringify({ c: [c.lat, c.lng], z: map.getZoom() }));
        } catch {
          /* ignoruj */
        }
      });
      void load();
    });

    return () => {
      disposed = true;
      clearTimeout(timer);
      unsubBackend?.();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // filtr statusu przeładowuje mapę – rzadka akcja, prostszy kod
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // linki w dymkach Leafleta → nawigacja SPA zamiast przeładowania strony
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[data-nav]") as HTMLAnchorElement | null;
      if (a) {
        e.preventDefault();
        navigate(a.getAttribute("href")!);
      }
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, []);

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => mapRef.current?.setView([p.coords.latitude, p.coords.longitude], 16),
      () => setError("Brak dostępu do lokalizacji"),
      { enableHighAccuracy: true, timeout: 10000 },
    );

  const reportHere = () => {
    const c = mapRef.current?.getCenter();
    if (c) navigate(`/ask?lat=${c.lat.toFixed(6)}&lng=${c.lng.toFixed(6)}`);
  };

  return (
    <div className="map-page">
      <div ref={box} className="map-full" aria-label="Mapa zgłoszeń" />
      <div className="map-overlay top">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtr statusu">
          <option value="">Wszystkie</option>
          <option value="open">Otwarte</option>
          <option value="solved">Rozwiązane</option>
        </select>
        {count !== null && <span className="map-count">{count} na widoku</span>}
      </div>
      {error && <div className="map-overlay error-box">{error}</div>}
      <div className="crosshair" aria-hidden="true" />
      <div className="map-overlay bottom">
        <button className="btn btn-round" onClick={locate} aria-label="Pokaż moją lokalizację">
          <Icon name="locate" />
        </button>
        <button className="btn btn-primary" onClick={reportHere}>
          <Icon name="pin" size={18} /> Zgłoś problem w tym miejscu
        </button>
      </div>
    </div>
  );
}
