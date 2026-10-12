/** Leaflet ładowany dopiero przy wejściu na mapę (≈40 kB gzip poza głównym pakietem). */
import type * as Leaflet from "leaflet";

let promise: Promise<typeof Leaflet> | null = null;

export function loadLeaflet(): Promise<typeof Leaflet> {
  if (!promise) {
    promise = Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]).then(
      ([mod]) => ((mod as unknown as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet,
    );
  }
  return promise;
}

export const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export const DEFAULT_CENTER: [number, number] = [50.2649, 19.0238]; // Katowice

export const STATUS_COLOR: Record<string, string> = {
  open: "#e2601c",
  solved: "#2f8f5b",
  closed: "#8a8a8a",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
