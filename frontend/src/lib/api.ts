import { API_PREFIX } from "./config";
import { getToken, logout } from "./auth";
import { markBackendDown, markBackendUp } from "./backend";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** true = backend nieosiągalny (śpi / brak sieci) – warto spróbować później */
    public retryable: boolean,
  ) {
    super(message);
  }
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function detailMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "detail" in data) {
    const d = (data as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg).replace(/^Value error, /, "");
  }
  return fallback;
}

/** Jedno miejsce na wszystkie wywołania API: timeout, token, rozpoznawanie
 *  "backend śpi" (sieć / 502 / 503 / 504 / strona ładowania zamiast JSON). */
export async function api<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);
  opts.signal?.addEventListener("abort", () => ctrl.abort());

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_PREFIX}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    clearTimeout(timer);
    if (opts.signal?.aborted) throw new ApiError("Anulowano", 0, false);
    markBackendDown();
    throw new ApiError("Serwer niedostępny – budzimy go…", 0, true);
  }
  clearTimeout(timer);

  if ([502, 503, 504].includes(res.status)) {
    markBackendDown();
    throw new ApiError("Serwer się uruchamia…", res.status, true);
  }
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  if (!isJson && res.status !== 204) {
    // np. strona "service waking up" proxy zamiast odpowiedzi API
    markBackendDown();
    throw new ApiError("Serwer się uruchamia…", res.status, true);
  }
  markBackendUp();

  if (res.status === 204) return undefined as T;
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && token) logout();
    throw new ApiError(detailMessage(data, `Błąd ${res.status}`), res.status, res.status === 429);
  }
  return data as T;
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
