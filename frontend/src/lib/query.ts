/** useCachedQuery – "stale-while-revalidate" na IndexedDB.
 *
 *  1. Natychmiast pokazuje ostatnią zapisaną odpowiedź (nawet gdy backend śpi
 *     albo telefon jest offline) – ekran nigdy nie jest pusty po pierwszej wizycie.
 *  2. W tle pobiera świeże dane; gdy backend się budzi – czeka i ponawia sam.
 *  3. Zwraca `stale`, żeby UI mogło pokazać "dane z HH:MM".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { getBackendState, subscribeBackend } from "./backend";
import { idbAll, idbDelete, idbGet, idbSet } from "./idb";

interface Entry<T> {
  data: T;
  at: number;
}

const mem = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const invalidated = new Set<(prefix: string) => void>();
const MAX_ENTRIES = 250;

export async function readCache<T>(key: string): Promise<Entry<T> | undefined> {
  const m = mem.get(key) as Entry<T> | undefined;
  if (m) return m;
  const stored = await idbGet<Entry<T>>("cache", key);
  if (stored) mem.set(key, stored);
  return stored;
}

export function writeCache<T>(key: string, data: T) {
  const entry = { data, at: Date.now() };
  mem.set(key, entry);
  void idbSet("cache", key, entry);
}

/** Lekkie sprzątanie – trzymamy najnowsze wpisy. */
export async function pruneCache() {
  const all = await idbAll<Entry<unknown>>("cache");
  if (all.length <= MAX_ENTRIES) return;
  all.sort((a, b) => a[1].at - b[1].at);
  for (const [k] of all.slice(0, all.length - MAX_ENTRIES)) await idbDelete("cache", k);
}

/** Unieważnia zapytania zaczynające się od prefiksu (np. po wysłaniu odpowiedzi). */
export function invalidate(prefix: string) {
  invalidated.forEach((fn) => fn(prefix));
}

function fetchOnce<T>(path: string): Promise<T> {
  const existing = inflight.get(path) as Promise<T> | undefined;
  if (existing) return existing;
  const p = api<T>(path).finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
}

export interface QueryResult<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  stale: boolean;
  updatedAt: number | null;
  refetch: () => void;
}

export function useCachedQuery<T>(path: string | null, opts: { keepPrevious?: boolean } = {}): QueryResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const pathRef = useRef(path);
  pathRef.current = path;

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    let gotFresh = false;
    let unsub: (() => void) | null = null;
    if (!opts.keepPrevious) setData(undefined);
    setError(null);

    void readCache<T>(path).then((cached) => {
      if (cancelled || gotFresh || !cached) return; // świeże dane już są – nie nadpisuj starszymi
      setData(cached.data);
      setUpdatedAt(cached.at);
      setStale(true);
    });

    const load = async () => {
      setRefreshing(true);
      try {
        const fresh = await fetchOnce<T>(path);
        if (cancelled) return;
        gotFresh = true;
        writeCache(path, fresh);
        setData(fresh);
        setStale(false);
        setUpdatedAt(Date.now());
        setError(null);
      } catch (e) {
        if (cancelled) return;
        const err = e as ApiError;
        if (err.retryable) {
          // Backend śpi / brak sieci – spróbujemy ponownie, gdy wróci
          unsub?.();
          unsub = subscribeBackend(() => {
            if (getBackendState().status === "online") {
              unsub?.();
              unsub = null;
              void load();
            }
          });
          // inne żądanie mogło już obudzić backend – wtedy nie czekamy na zmianę stanu
          if (getBackendState().status === "online") {
            setTimeout(() => {
              if (!cancelled && unsub) {
                unsub();
                unsub = null;
                void load();
              }
            }, 2000);
          }
        } else {
          setError(err.message || "Błąd");
        }
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };
    void load();

    const onInvalidate = (prefix: string) => {
      if (pathRef.current?.startsWith(prefix)) void load();
    };
    invalidated.add(onInvalidate);
    return () => {
      cancelled = true;
      unsub?.();
      invalidated.delete(onInvalidate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick]);

  return { data, error, loading: data === undefined && !error, refreshing, stale, updatedAt, refetch };
}
