/**
 * music.ts — the multi-provider facade. The ONLY module UI/state code uses.
 *
 * Contract: every track returned has passed the licensing/quality gate for the
 * user's licensing mode, every provider track carries license metadata, and
 * results are cross-provider deduped + ranked (originals & permissive licenses
 * first). Provider failures never break the app — healthy providers serve.
 */
import type { ProviderId, Track } from "./types";
import { PROVIDERS } from "./providers";
import { gateTracks, type LicensingMode } from "./providers/gate";
import { getProvider } from "./providers";

export type { LicensingMode } from "./providers/gate";

/** providers the user disabled (kept in sync by SettingsProvider). */
import type { MusicProvider } from "./providers/types";
let blockedSources: ProviderId[] = [];
let licensingMode: LicensingMode = "noncommercial";

export function setBlockedSources(ids: ProviderId[]): void {
  blockedSources = [...ids];
  clearMusicCache();
}
export function setLicensingMode(mode: LicensingMode): void {
  licensingMode = mode;
  clearMusicCache();
}
export function getLicensingMode(): LicensingMode {
  return licensingMode;
}

function activeProviders(): import("./providers/types").MusicProvider[] {
  return PROVIDERS.filter(
    (p) => p.browserEnabled && !blockedSources.includes(p.id) && (p.isConfigured() || !p.requiresKey)
  );
}

/* ─── mini response cache (same LRU idea as the Jamendo client) ─────────── */

interface Entry {
  at: number;
  data: Track[];
}
const cache = new Map<string, Entry>();
const CACHE_TTL = 10 * 60 * 1000;

function cacheKey(op: string, ...parts: (string | number | undefined)[]): string {
  return [op, licensingMode, blockedSources.slice().sort().join(","), ...parts.filter((p) => p !== undefined)].join("|");
}

function cacheGet<T extends Track[]>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL) return null;
  cache.delete(key);
  cache.set(key, hit); // LRU touch
  return hit.data as T;
}

function cacheSet(key: string, data: Track[]): void {
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 80) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

export function clearMusicCache(): void {
  cache.clear();
}

/* ─── merge helpers ─────────────────────────────────────────────────────── */

/**
 * Fan out to all active providers in parallel, gate + merge.
 * Jamendo is populated/healthy → its results lead the row (provider rank),
 * with Archive originals woven in behind them after ranking.
 */
async function fanOut(
  op: (p: MusicProvider) => Promise<Track[]> | undefined,
  opts: { limit?: number; offset?: number } = {}
): Promise<Track[]> {
  const providers = activeProviders();
  const settled = await Promise.allSettled(
    providers.map((p) => op(p)?.catch(() => [] as Track[]) ?? Promise.resolve([] as Track[]))
  );
  const perProvider: Track[][] = settled.map((r) => (r.status === "fulfilled" ? r.value : []));
  const merged = perProvider.flat();
  const gated = gateTracks(merged, licensingMode).admitted;

  // Provider-rank interleave: take from each provider list in rank order.
  const lists = providers
    .map((p, i) => ({ rank: p.rank, list: perProvider[i].filter((t) => gated.includes(t)) }))
    .sort((a, b) => a.rank - b.rank);
  const interleave: Track[] = [];
  let idx = 0;
  let added = true;
  while (added) {
    added = false;
    for (const { list } of lists) {
      if (list[idx]) {
        interleave.push(list[idx]);
        added = true;
      }
    }
    idx++;
    if (interleave.length >= (opts.limit ?? 24)) break;
  }

  const out = interleave.length ? interleave : gated;
  return out.slice(0, opts.limit ?? 24);
}

/* ─── Public API — mirrors the old jamendo client surface ───────────────── */

export const music = {
  async trending(opts: { limit?: number; offset?: number; bitrate?: import("./types").BitrateKey } = {}): Promise<Track[]> {
    const key = cacheKey("trending", opts.bitrate, opts.limit);
    const hit = cacheGet<Track[]>(key);
    if (hit) return hit;
    const out = await fanOut((p) => p.trending(scopeFor(p, opts)), opts);
    cacheSet(key, out);
    return out;
  },

  async searchTracks(query: string, opts: { limit?: number; offset?: number; bitrate?: import("./types").BitrateKey } = {}): Promise<Track[]> {
    const key = cacheKey("search", opts.bitrate, opts.limit, query);
    const hit = cacheGet<Track[]>(key);
    if (hit) return hit;
    const out = await fanOut((p) => p.search(query, scopeFor(p, opts)), opts);
    cacheSet(key, out);
    return out;
  },

  /** Alias kept for call-site parity with the old client. */
  freeTextSearch(query: string, opts: { limit?: number; offset?: number; bitrate?: import("./types").BitrateKey } = {}) {
    return music.searchTracks(query, opts);
  },

  async byTag(tag: string, opts: { limit?: number; offset?: number; bitrate?: import("./types").BitrateKey } = {}): Promise<Track[]> {
    const key = cacheKey("tag", opts.bitrate, opts.limit, tag);
    const hit = cacheGet<Track[]>(key);
    if (hit) return hit;
    const out = await fanOut(
      (p) => (p.byTag ? p.byTag(tag, scopeFor(p, opts)) : p.search(tag, scopeFor(p, opts))),
      opts
    );
    cacheSet(key, out);
    return out;
  },

  async moods(kind: "energetic" | "chill" | "focus", opts: { bitrate?: import("./types").BitrateKey; limit?: number } = {}): Promise<Track[]> {
    const key = cacheKey("mood", opts.bitrate, opts.limit, kind);
    const hit = cacheGet<Track[]>(key);
    if (hit) return hit;
    const out = await fanOut((p) => p.moods?.(kind, scopeFor(p, opts)) ?? Promise.resolve([]), opts);
    cacheSet(key, out);
    return out;
  },

  async trackById(id: string, bitrate: import("./types").BitrateKey): Promise<Track[]> {
    // Track ids are provider-prefixed, so route directly (still gated).
    const prefix = id.split("_")[0];
    const map: Record<string, string> = { jm: "jamendo", ia: "archive", demo: "local" };
    const providerId = map[prefix];
    const provider = providerId ? getProvider(providerId) : undefined;
    if (!provider || !provider.trackById) return [];
    const raw = await provider.trackById(id, bitrate).catch(() => []);
    const { admitted } = gateTracks(raw, licensingMode);
    return admitted;
  },

  lyrics(trackId: string): Promise<{ lyrics: string | null }> {
    const providerId = trackId.startsWith("jm_") ? "jamendo" : "archive";
    const provider = getProvider(providerId);
    return provider?.lyrics ? provider.lyrics(trackId) : Promise.resolve({ lyrics: null });
  },

  search(query: string, opts: { limit?: number; offset?: number; bitrate?: import("./types").BitrateKey } = {}) {
    return music.searchTracks(query, opts);
  },

  artistTopTracks(artistId: string, opts: { limit?: number; bitrate?: import("./types").BitrateKey } = {}): Promise<Track[]> {
    const p = getProvider("jamendo");
    return p?.artistTopTracks
      ? p.artistTopTracks(artistId, opts).then((raw) => gateTracks(raw, licensingMode).admitted)
      : Promise.resolve([]);
  },

  albumTracks(albumId: string, opts: { bitrate?: import("./types").BitrateKey } = {}): Promise<Track[]> {
    if (albumId.startsWith("ia_")) {
      return music.trackById(`${albumId}::0`, opts.bitrate ?? "balanced");
    }
    const p = getProvider("jamendo");
    return p?.albumTracks
      ? p.albumTracks(albumId, opts).then((raw) => gateTracks(raw, licensingMode).admitted)
      : Promise.resolve([]);
  },

  prefetchMoods(bitrate: import("./types").BitrateKey): void {
    void music.moods("energetic", { bitrate }).catch(() => {});
    void music.moods("chill", { bitrate }).catch(() => {});
    void music.moods("focus", { bitrate }).catch(() => {});
  },
};

/* scopeFor — hoisted function declaration (usable above its definition) */
function scopeFor(p: MusicProvider, opts: { limit?: number; offset?: number; bitrate?: import("./types").BitrateKey }) {
  const want = opts.limit ?? 24;
  return {
    limit: Math.ceil(want * 1.6),
    offset: opts.offset ?? 0,
    bitrate: opts.bitrate ?? "balanced",
  } as const;
}

/** Provider status for the Settings + Discover surfaces. */
export function providerStatuses(): import("./types").ProviderStatus[] {
  return PROVIDERS.map((p) => {
    const blocked = blockedSources.includes(p.id);
    const configured = p.isConfigured() || !p.requiresKey;
    let reason: string | undefined;
    if (blocked) reason = "Disabled in settings";
    else if (!p.browserEnabled) reason = "Excluded — no CORS / derivative works";
    else if (!configured) reason = "Studio key not active — streaming via Archive.org";
    return {
      id: p.id,
      displayName: p.displayName,
      enabled: p.browserEnabled && !blocked && configured,
      reason,
      licensingExposure: p.licensing.exposure,
      licensingNotes: p.licensing.notes,
      commercialProgramUrl: p.licensing.commercialProgramUrl,
      trackCountHint: p.licensing.trackCountHint,
    } satisfies import("./types").ProviderStatus;
  });
}
