/**
 * Jamendo API v3.0 client — search, charts, mood rows, pagination,
 * artist/album matrices, lyrics fetch. LRU response cache, in-flight
 * de-dupe, timeout + one retry with backoff, and graceful network
 * degradation (cached stale results served on failure).
 */
import { JAMENDO_BASE, JAMENDO_FALLBACK_CLIENT_ID, NETWORK, BITRATE_OPTIONS } from "./constants";
import type { Album, Artist, BitrateKey, Track } from "./types";
import { storageGet, storageSet, storageRemove } from "./storage";

interface AppConfigShape {
  jamendoClientId?: string;
}
declare global {
  interface Window {
    __YUTARIO_CONFIG__?: AppConfigShape;
  }
}

/* ─── Client key management (user-supplied > env-injected > bundled) ───── */

const KEY_STORAGE = "jamendo_client_id";

export function getJamendoClientId(): string {
  const user = storageGet<string>(KEY_STORAGE, "").trim();
  if (user) return user;
  const injected = typeof window !== "undefined" ? window.__YUTARIO_CONFIG__?.jamendoClientId : null;
  const env = (injected && injected.trim()) || JAMENDO_FALLBACK_CLIENT_ID;
  return env && env !== "your_client_id" ? env : "";
}

export function setJamendoClientId(id: string): void {
  const clean = id.trim();
  if (clean) storageSet(KEY_STORAGE, clean);
  else storageRemove(KEY_STORAGE);
  resetJamendoHealth();
}

export function hasCustomJamendoKey(): boolean {
  return !!storageGet<string>(KEY_STORAGE, "").trim();
}

/* ─── API health (drives the key banner + settings status) ─────────────── */

export interface JamendoHealth {
  ok: boolean | null;
  message: string;
  checkedAt: number;
}

let health: JamendoHealth = { ok: null, message: "Not checked yet", checkedAt: 0 };
const healthListeners = new Set<(h: JamendoHealth) => void>();

function publishHealth(next: Partial<JamendoHealth>): void {
  health = { ...health, ...next, checkedAt: Date.now() };
  healthListeners.forEach((fn) => fn(health));
}

export function resetJamendoHealth(): void {
  publishHealth({ ok: null, message: "Not checked yet" });
}

export function getJamendoHealth(): JamendoHealth {
  return health;
}

export function subscribeJamendoHealth(fn: (h: JamendoHealth) => void): () => void {
  healthListeners.add(fn);
  return () => healthListeners.delete(fn);
}

function clientId(): string {
  return getJamendoClientId();
}

/* ─── Response cache (LRU, TTL) ─────────────────────────────────────────── */

interface CacheEntry {
  at: number;
  data: unknown;
}
const responseCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function cacheGetStale<T>(key: string): T | null {
  const hit = responseCache.get(key);
  if (!hit) return null;
  return hit.data as T;
}

function cacheGetFresh<T>(key: string): T | null {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > NETWORK.CACHE_TTL_MS) return null;
  // LRU touch
  responseCache.delete(key);
  responseCache.set(key, hit);
  return hit.data as T;
}

function cacheSet(key: string, data: unknown): void {
  responseCache.set(key, { at: Date.now(), data });
  // Evict oldest beyond 80 entries.
  if (responseCache.size > 80) {
    const oldest = responseCache.keys().next().value;
    if (oldest) responseCache.delete(oldest);
  }
}

export function clearJamendoCache(): void {
  responseCache.clear();
  inflight.clear();
}

/* ─── Low-level fetch ──────────────────────────────────────────────────── */

let activeFetches = 0;
const waiters: (() => void)[] = [];

async function acquireSlot(): Promise<void> {
  if (activeFetches < NETWORK.MAX_CONCURRENT_FETCHES) {
    activeFetches++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  activeFetches++;
}

function releaseSlot(): void {
  activeFetches = Math.max(0, activeFetches - 1);
  const next = waiters.shift();
  if (next) next();
}

async function fetchJson<T>(url: string, allowStale = true): Promise<T> {
  const cached = cacheGetFresh<T>(url);
  if (cached) return cached;

  const existing = inflight.get(url);
  if (existing) return existing as Promise<T>;

  const exec = (async (): Promise<T> => {
    await acquireSlot();
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), NETWORK.FETCH_TIMEOUT_MS);
        try {
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(timer);
          if (!res.ok) throw new Error(`Jamendo HTTP ${res.status}`);
          const json = (await res.json()) as { headers: { status: string; error_message?: string; code?: number }; results: T };
          if (json.headers?.status !== "success") {
            const msg = json.headers?.error_message || "Jamendo API error";
            if (json.headers?.code === 5 || /invalid client id/i.test(msg)) {
              publishHealth({ ok: false, message: "Invalid client id — add yours in Settings → Jamendo API" });
            }
            throw new Error(msg);
          }
          if (health.ok !== true) publishHealth({ ok: true, message: "Connected — streaming live" });
          cacheSet(url, json.results);
          return json.results;
        } catch (err) {
          clearTimeout(timer);
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 600));
            continue;
          }
          if (allowStale) {
            const stale = cacheGetStale<T>(url);
            if (stale) return stale;
          }
          throw err;
        }
      }
      throw new Error("unreachable");
    } finally {
      releaseSlot();
      inflight.delete(url);
    }
  })();

  inflight.set(url, exec);
  return exec;
}

/* ─── Mapping ──────────────────────────────────────────────────────────── */

interface JamendoTrack {
  id: string;
  name: string;
  duration: number;
  artist_id: string;
  artist_name: string;
  album_id?: string;
  album_name?: string;
  album_image?: string;
  image?: string;
  audio: string;
  audiodownload?: string;
  audiodownload_allowed?: boolean;
  shareurl?: string;
  shorturl?: string;
  musicinfo?: {
    tags?: { genres?: string[]; instruments?: string[]; vartags?: string[] };
    vocalinstrumental?: string;
    speed?: string;
  };
}

function mapTrack(jt: JamendoTrack, format: "mp31" | "mp32"): Track {
  const audio =
    format === "mp32" && jt.audio.includes("format=mp31")
      ? jt.audio.replace("format=mp31", "format=mp32")
      : jt.audio;
  return {
    id: `jm_${jt.id}`,
    title: jt.name || "Unknown Title",
    artist: jt.artist_name || "Unknown Artist",
    album: jt.album_name || "",
    albumId: jt.album_id || undefined,
    artistId: jt.artist_id || undefined,
    url: audio,
    downloadUrl: jt.audiodownload_allowed !== false ? jt.audiodownload || undefined : undefined,
    artwork: jt.image || jt.album_image || undefined,
    duration: Number(jt.duration) || 0,
    source: "jamendo",
    genres: jt.musicinfo?.tags?.genres ?? [],
    lyrics: null,
  };
}

function audioformatFor(bitrate: BitrateKey): "mp31" | "mp32" {
  const opt = BITRATE_OPTIONS.find((b) => b.key === bitrate);
  return opt?.audioformat ?? "mp31";
}

function baseParams(extra: Record<string, string | number | boolean | undefined>): URLSearchParams {
  const p = new URLSearchParams();
  p.set("client_id", clientId());
  p.set("format", "json");
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== "") p.set(k, String(v));
  }
  return p;
}

async function getTracks(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  bitrate: BitrateKey,
  includeMusicinfo = true
): Promise<Track[]> {
  const merged = {
    ...params,
    audioformat: audioformatFor(bitrate),
    imagesize: 300,
    include: includeMusicinfo ? "musicinfo" : undefined,
  };
  const url = `${JAMENDO_BASE}${path}?${baseParams(merged).toString()}`;
  const results = await fetchJson<JamendoTrack[]>(url);
  return (results ?? []).map((jt) => mapTrack(jt, audioformatFor(bitrate)));
}

/* ─── Public API ───────────────────────────────────────────────────────── */

export const jamendo = {
  /** Generic channel fetcher (trending, genre stations, custom shapes). */
  getTracksBy(
    params: Record<string, string | number>,
    opts: { limit?: number; offset?: number; bitrate?: BitrateKey } = {}
  ): Promise<Track[]> {
    return getTracks(
      "/tracks/",
      { ...params, limit: opts.limit ?? 24, offset: opts.offset ?? 0 },
      opts.bitrate ?? "balanced"
    );
  },

  searchTracks(query: string, opts: { limit?: number; offset?: number; bitrate?: BitrateKey } = {}): Promise<Track[]> {
    return getTracks(
      "/tracks/",
      {
        namesearch: query,
        limit: opts.limit ?? 24,
        offset: opts.offset ?? 0,
        groupby: "artist_id",
      },
      opts.bitrate ?? "balanced"
    );
  },

  freeTextSearch(query: string, opts: { limit?: number; offset?: number; bitrate?: BitrateKey } = {}): Promise<Track[]> {
    return getTracks(
      "/tracks/",
      { search: query, limit: opts.limit ?? 24, offset: opts.offset ?? 0 },
      opts.bitrate ?? "balanced"
    );
  },

  trending(opts: { limit?: number; offset?: number; bitrate?: BitrateKey } = {}): Promise<Track[]> {
    return getTracks(
      "/tracks/",
      {
        boost: "popularity_month",
        limit: opts.limit ?? 24,
        offset: opts.offset ?? 0,
        featured: 1,
        groupby: "artist_id",
      },
      opts.bitrate ?? "balanced"
    );
  },

  byTag(tag: string, opts: { limit?: number; offset?: number; bitrate?: BitrateKey } = {}): Promise<Track[]> {
    return getTracks(
      "/tracks/",
      {
        fuzzytags: tag,
        boost: "popularity_month",
        limit: opts.limit ?? 16,
        offset: opts.offset ?? 0,
        groupby: "artist_id",
      },
      opts.bitrate ?? "balanced"
    );
  },

  /** Mood row with vocal/instrumental + speed shaping. */
  mood(kind: "energetic" | "chill" | "focus", opts: { bitrate?: BitrateKey } = {}): Promise<Track[]> {
    const shapes: Record<string, Record<string, string | number>> = {
      energetic: { fuzzytags: "energetic dance", speed: "high veryhigh", boost: "popularity_month", limit: 16 },
      chill: { fuzzytags: "chillout relaxation", speed: "low medium", boost: "popularity_month", limit: 16 },
      focus: { vocalinstrumental: "instrumental", fuzzytags: "ambient instrumental", boost: "popularity_month", limit: 16 },
    };
    return getTracks("/tracks/", shapes[kind], opts.bitrate ?? "balanced");
  },

  artistTopTracks(artistId: string, opts: { limit?: number; bitrate?: BitrateKey } = {}): Promise<Track[]> {
    return getTracks("/tracks/", { artist_id: artistId, limit: opts.limit ?? 20, boost: "popularity_total" }, opts.bitrate ?? "balanced");
  },

  artistInfo(artistId: string): Promise<Artist[]> {
    const url = `${JAMENDO_BASE}/artists/?${baseParams({ id: artistId, imagesize: 300 }).toString()}`;
    return fetchJson<Artist[]>(url).catch(() => []);
  },

  albumTracks(albumId: string, opts: { bitrate?: BitrateKey } = {}): Promise<Track[]> {
    return getTracks("/tracks/", { album_id: albumId, limit: 100 }, opts.bitrate ?? "balanced");
  },

  lyrics(trackId: string): Promise<{ lyrics: string | null }> {
    const numeric = trackId.replace(/^jm_/, "");
    const url = `${JAMENDO_BASE}/tracks/lyrics/?${baseParams({ id: numeric }).toString()}`;
    return fetchJson<{ id: string; lyrics: string | null }[]>(url, false)
      .then((rows) => ({ lyrics: rows?.[0]?.lyrics ?? null }))
      .catch(() => ({ lyrics: null }));
  },

  trackById(id: string, bitrate: BitrateKey): Promise<Track[]> {
    return getTracks("/tracks/", { id: id.replace(/^jm_/, ""), limit: 1 }, bitrate);
  },

  /** Warm the cache for likely-next navigation. */
  prefetchMoods(bitrate: BitrateKey): void {
    void this.mood("energetic", { bitrate }).catch(() => {});
    void this.mood("chill", { bitrate }).catch(() => {});
    void this.mood("focus", { bitrate }).catch(() => {});
  },
};
