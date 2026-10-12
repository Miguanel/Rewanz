declare global {
  interface Window {
    __REWANZ_API__?: string;
    __REWANZ_WAKE__?: Promise<unknown>;
  }
}

const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");

export const API_URL: string = fromEnv || window.__REWANZ_API__ || "http://localhost:8000";
export const API_PREFIX = `${API_URL}/api/v1`;

/** Po jakim czasie bez kontaktu zakładamy, że darmowy Render uśpił backend. */
export const ASSUME_ASLEEP_AFTER_MS = 14 * 60 * 1000;
/** Maksymalny czas budzenia, zanim pokażemy "nie udało się połączyć". */
export const WAKE_GIVE_UP_MS = 120 * 1000;
