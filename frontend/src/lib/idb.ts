/** Minimalny klucz-wartość na IndexedDB (bez zależności).
 *  Magazyny: "cache" (odpowiedzi GET), "outbox" (zmiany czekające na wysłanie).
 *  Gdy IndexedDB jest niedostępne (np. tryb prywatny), działa w pamięci. */

type StoreName = "cache" | "outbox";
const DB_NAME = "rewanz";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory: Record<StoreName, Map<string, unknown>> = { cache: new Map(), outbox: new Map() };

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("cache")) db.createObjectStore("cache");
        if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await open();
  if (!db) return memory[store].get(key) as T | undefined;
  try {
    return await wrap(db.transaction(store).objectStore(store).get(key));
  } catch {
    return memory[store].get(key) as T | undefined;
  }
}

export async function idbSet(store: StoreName, key: string, value: unknown): Promise<void> {
  memory[store].set(key, value);
  const db = await open();
  if (!db) return;
  try {
    await wrap(db.transaction(store, "readwrite").objectStore(store).put(value, key));
  } catch {
    /* pełny dysk / tryb prywatny – zostaje kopia w pamięci */
  }
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  memory[store].delete(key);
  const db = await open();
  if (!db) return;
  try {
    await wrap(db.transaction(store, "readwrite").objectStore(store).delete(key));
  } catch {
    /* ignoruj */
  }
}

export async function idbAll<T>(store: StoreName): Promise<Array<[string, T]>> {
  const db = await open();
  if (!db) return [...memory[store].entries()] as Array<[string, T]>;
  try {
    const os = db.transaction(store).objectStore(store);
    const [keys, values] = await Promise.all([wrap(os.getAllKeys()), wrap(os.getAll())]);
    return keys.map((k, i) => [String(k), values[i] as T]);
  } catch {
    return [...memory[store].entries()] as Array<[string, T]>;
  }
}
