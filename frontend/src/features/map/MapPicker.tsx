import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import { DEFAULT_CENTER, loadLeaflet, TILE_ATTRIBUTION, TILE_URL } from "./leaflet";

/** Mała mapa do wskazania punktu w formularzu – stuknij, aby ustawić pinezkę. */
export default function MapPicker({
  value,
  onChange,
}: {
  value: [number, number] | null;
  onChange: (v: [number, number]) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const marker = useRef<Leaflet.CircleMarker | null>(null);
  const placeRef = useRef<((ll: [number, number]) => void) | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let map: Leaflet.Map | null = null;
    let disposed = false;
    void loadLeaflet().then((L) => {
      if (disposed || !box.current) return;
      const m = L.map(box.current, { zoomControl: true }).setView(value ?? DEFAULT_CENTER, value ? 16 : 12);
      map = m;
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(m);
      const place = (ll: [number, number]) => {
        if (!marker.current) {
          marker.current = L.circleMarker(ll, { radius: 10, color: "#fff", weight: 3, fillColor: "#e2601c", fillOpacity: 1 }).addTo(m);
        } else marker.current.setLatLng(ll);
      };
      placeRef.current = (ll) => {
        place(ll);
        m.setView(ll, Math.max(m.getZoom(), 15));
      };
      if (value) place(value);
      m.on("click", (e: Leaflet.LeafletMouseEvent) => {
        const ll: [number, number] = [+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)];
        place(ll);
        onChangeRef.current(ll);
      });
    });
    return () => {
      disposed = true;
      map?.remove();
      marker.current = null;
      placeRef.current = null;
    };
    // mapa tworzona raz; kolejne zmiany `value` przesuwa efekt poniżej
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // wartość ustawiona z zewnątrz (np. przycisk "Moja lokalizacja")
  useEffect(() => {
    if (value) placeRef.current?.(value);
  }, [value]);

  return <div ref={box} className="map-box" aria-label="Wybierz punkt na mapie" />;
}
