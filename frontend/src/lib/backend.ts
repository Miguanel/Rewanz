/** Stan backendu widziany przez aplikację + budzenie uśpionej instancji Render.
 *
 *  online   – ostatnie żądanie się udało
 *  waking   – trwa budzenie (pingujemy /healthz z narastającym odstępem)
 *  offline  – telefon nie ma sieci
 *  down     – budzenie trwa za długo (pokazujemy "Spróbuj ponownie")
 *  unknown  – start aplikacji, zanim cokolwiek wiemy
 */
import { useSyncExternalStore } from "react";
import { API_URL, ASSUME_ASLEEP_AFTER_MS, WAKE_GIVE_UP_MS } from "./config";

export type BackendStatus = "unknown" | "online" | "waking" | "offline" | "down";

interface State {
  status: BackendStatus;
  wakeStartedAt: number | null;
  lastOkAt: number | null;
}

let state: State = { status: "unknown", wakeStartedAt: null, lastOkAt: null };
const listeners = new Set<() => void>();
let waking: Promise<boolean> | null = null;

function set(patch: Partial<State>) {
  const next = { ...state, ...patch };
  if (next.status === state.status && next.lastOkAt === state.lastOkAt && next.wakeStartedAt === state.wakeStartedAt) return;
  state = next;
  listeners.forEach((l) => l());
}

export function getBackendState(): State {
  return state;
}

export function subscribeBackend(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useBackend(): State {
  return useSyncExternalStore(subscribeBackend, getBackendState, getBackendState);
}

export function markBackendUp() {
  set({ status: "online", lastOkAt: Date.now(), wakeStartedAt: null });
}

export function markBackendDown() {
  if (!navigator.onLine) {
    set({ status: "offline" });
    return;
  }
  void wakeBackend();
}

async function ping(timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/healthz`, { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null); // strona ładowania ≠ JSON
    return !!data && data.status === "ok";
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Budzi backend i czeka, aż odpowie. Wywołania równoległe dzielą jedną próbę. */
export function wakeBackend(): Promise<boolean> {
  if (waking) return waking;
  if (!navigator.onLine) {
    set({ status: "offline" });
    return Promise.resolve(false);
  }
  waking = (async () => {
    const started = Date.now();
    set({ status: "waking", wakeStartedAt: started });
    let delay = 1000;
    while (Date.now() - started < WAKE_GIVE_UP_MS) {
      // Długi timeout pojedynczej próby: Render trzyma żądanie, dopóki instancja nie wstanie
      if (await ping(25000)) {
        markBackendUp();
        return true;
      }
      if (!navigator.onLine) {
        set({ status: "offline" });
        return false;
      }
      await sleep(delay);
      delay = Math.min(delay * 1.5, 5000);
    }
    set({ status: "down" });
    return false;
  })().finally(() => {
    waking = null;
  });
  return waking;
}

/** Wywoływane przy starcie: wykorzystuje ping z index.html, który wystartował najwcześniej. */
export async function initBackend() {
  window.addEventListener("online", () => void wakeBackend());
  window.addEventListener("offline", () => set({ status: "offline" }));
  // Powrót do aplikacji po dłuższej przerwie = backend prawdopodobnie śpi → budzimy od razu
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const { lastOkAt } = state;
    if (!lastOkAt || Date.now() - lastOkAt > ASSUME_ASLEEP_AFTER_MS) void wakeBackend();
  });

  if (!navigator.onLine) {
    set({ status: "offline" });
    return;
  }
  const early = window.__REWANZ_WAKE__;
  if (early) {
    // Jeśli wczesny ping wróci szybko – nie pokazujemy żadnego paska budzenia
    const quick = await Promise.race([early, sleep(1200).then(() => "slow" as const)]);
    if (quick && quick !== "slow" && (quick as { status?: string }).status === "ok") {
      markBackendUp();
      return;
    }
  }
  void wakeBackend();
}
