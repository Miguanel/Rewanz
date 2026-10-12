import { useSyncExternalStore } from "react";
import type { UserPrivate } from "./types";

const KEY = "rewanz.auth";

interface AuthState {
  token: string | null;
  user: UserPrivate | null;
}

function load(): AuthState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AuthState;
  } catch {
    /* brak dostępu do storage */
  }
  return { token: null, user: null };
}

let state: AuthState = load();
const listeners = new Set<() => void>();

function save(next: AuthState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignoruj */
  }
  listeners.forEach((l) => l());
}

export const getToken = () => state.token;
export const getUser = () => state.user;

export function setSession(token: string, user: UserPrivate) {
  save({ token, user });
}

export function updateUser(user: UserPrivate) {
  save({ ...state, user });
}

export function logout() {
  save({ token: null, user: null });
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}
