/** Kolejka zmian (outbox) – zapisy działają, nawet gdy backend śpi lub brak sieci.
 *
 *  Każda zmiana dostaje client_id (UUID). Backend traktuje go jako klucz
 *  idempotencji, więc ponowne wysłanie po zerwanym połączeniu NIE tworzy duplikatu.
 *  Kolejka leży w IndexedDB – przetrwa zamknięcie aplikacji.
 */
import { useSyncExternalStore } from "react";
import { api, ApiError } from "./api";
import { getToken } from "./auth";
import { getBackendState, subscribeBackend, wakeBackend } from "./backend";
import { idbAll, idbDelete, idbSet } from "./idb";
import { invalidate } from "./query";

export type OutboxKind = "problem" | "answer" | "vote" | "action";

export interface OutboxItem {
  id: string; // = client_id
  kind: OutboxKind;
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  body: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  status: "pending" | "sending" | "failed";
  error?: string;
  /** dane do optymistycznego wyświetlenia (np. problem_id, parent_id, title) */
  meta: Record<string, unknown>;
  /** prefiksy cache do odświeżenia po sukcesie */
  invalidates: string[];
}

let items: OutboxItem[] = [];
let loaded = false;
let flushing = false;
const listeners = new Set<() => void>();
const syncedListeners = new Set<(item: OutboxItem, result: unknown) => void>();

function emit() {
  items = [...items];
  listeners.forEach((l) => l());
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function initOutbox() {
  const stored = await idbAll<OutboxItem>("outbox");
  items = stored
    .map(([, v]) => ({ ...v, status: v.status === "sending" ? "pending" : v.status }) as OutboxItem)
    .sort((a, b) => a.createdAt - b.createdAt);
  loaded = true;
  emit();
  subscribeBackend(() => {
    if (getBackendState().status === "online") void flushOutbox();
  });
  void flushOutbox();
}

export function enqueue(item: Omit<OutboxItem, "createdAt" | "attempts" | "status">): OutboxItem {
  // Głosy: liczy się tylko ostatnia decyzja dla danego obiektu
  if (item.kind === "vote") {
    const dup = items.filter((i) => i.kind === "vote" && i.status !== "sending" && i.meta.key === item.meta.key);
    for (const d of dup) void remove(d.id);
    items = items.filter((i) => !dup.includes(i));
  }
  const full: OutboxItem = { ...item, createdAt: Date.now(), attempts: 0, status: "pending" };
  items.push(full);
  void idbSet("outbox", full.id, full);
  emit();
  void flushOutbox();
  return full;
}

async function remove(id: string) {
  items = items.filter((i) => i.id !== id);
  await idbDelete("outbox", id);
  emit();
}

export function discard(id: string) {
  void remove(id);
}

export function retry(id: string) {
  const it = items.find((i) => i.id === id);
  if (!it) return;
  it.status = "pending";
  it.error = undefined;
  void idbSet("outbox", it.id, it);
  emit();
  void flushOutbox();
}

function save(it: OutboxItem) {
  void idbSet("outbox", it.id, it);
  emit();
}

export async function flushOutbox(): Promise<void> {
  if (flushing || !loaded || !getToken()) return;
  const queue = items.filter((i) => i.status === "pending");
  if (!queue.length) return;
  if (getBackendState().status !== "online") {
    void wakeBackend(); // po przebudzeniu subskrypcja wywoła flush ponownie
    return;
  }
  flushing = true;
  try {
    for (const it of queue) {
      it.status = "sending";
      it.attempts += 1;
      save(it);
      try {
        const result = await api<unknown>(it.path, { method: it.method, body: it.body, timeoutMs: 30000 });
        await remove(it.id);
        it.invalidates.forEach(invalidate);
        syncedListeners.forEach((fn) => fn(it, result));
      } catch (e) {
        const err = e as ApiError;
        if (err.retryable) {
          it.status = "pending";
          save(it);
          break; // backend znowu niedostępny – reszta poczeka
        }
        it.status = "failed";
        it.error = err.message;
        save(it);
      }
    }
  } finally {
    flushing = false;
  }
}

export function useOutbox(): OutboxItem[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => items,
  );
}

export function onSynced(fn: (item: OutboxItem, result: unknown) => void): () => void {
  syncedListeners.add(fn);
  return () => syncedListeners.delete(fn);
}
