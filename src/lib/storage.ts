/**
 * Atomic, namespaced localStorage persistence with graceful degradation
 * (private-mode Safari, quota errors) and SSR safety.
 */

const memory = new Map<string, string>();
const PREFIX = "yutario:";

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const probe = "__yutario_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
    /* eslint-disable-next-line no-empty */
  } catch {
    return null;
  }
}

export function storageGet<T>(key: string, fallback: T): T {
  const store = safeStorage();
  const full = PREFIX + key;
  try {
    const raw = store ? store.getItem(full) : memory.get(full);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function storageSet<T>(key: string, value: T): void {
  const store = safeStorage();
  const full = PREFIX + key;
  const raw = JSON.stringify(value);
  try {
    if (store) store.setItem(full, raw);
    else memory.set(full, raw);
  } catch {
    memory.set(full, raw);
  }
}

export function storageRemove(key: string): void {
  const store = safeStorage();
  const full = PREFIX + key;
  try {
    if (store) store.removeItem(full);
  } catch {
    /* noop */
  }
  memory.delete(full);
}

export function storageKeys(): string[] {
  const store = safeStorage();
  const out: string[] = [];
  if (store) {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k?.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
    }
  }
  for (const k of memory.keys()) if (k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
  return [...new Set(out)];
}

/** Nuclear reset — wipes every Yutario namespaced key. */
export function storageWipeAll(): void {
  for (const k of storageKeys()) storageRemove(k);
}

export function storageSizeEstimate(): number {
  return storageKeys().reduce((acc, k) => {
    const raw = (() => {
      const store = safeStorage();
      try {
        return store ? store.getItem(PREFIX + k) : memory.get(PREFIX + k);
      } catch {
        return null;
      }
    })();
    return acc + (raw ? raw.length * 2 : 0); // UTF-16 bytes
  }, 0);
}
