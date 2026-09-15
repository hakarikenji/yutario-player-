/**
 * Internet Archive (netlabels collection) provider — tens of thousands of
 * original netlabel releases under explicit Creative Commons licenses.
 *
 * Why this provider is safe:
 *  • Official public APIs only (advancedsearch + metadata endpoints) — no scraping.
 *  • Every admitted item carries a machine-readable `licenseurl`; items without
 *    one are dropped by the provider itself (the gate double-checks).
 *  • Audio is served directly by archive.org with permissive CORS + range
 *    requests, so playback streams from the legal origin, never re-hosted.
 *  • Commercial mode: NC licenses are rejected by the gate; BY/BY-SA/CC0/PD pass.
 */
import type { LicenseKind, LicenseInfo, Track } from "../types";
import type { FetchOpts, MusicProvider, ProviderCapabilities } from "./types";

const ID = "archive" as const;
const SEARCH_BASE = "https://archive.org/advancedsearch.php";
const META_BASE = "https://archive.org/metadata";
const DL_BASE = "https://archive.org/download";
const IMG_BASE = "https://archive.org/services/img";

const COLLECTION_Q = "collection:netlabels AND mediatype:audio AND licenseurl:[* TO *]";

/* ─── API shapes ────────────────────────────────────────────────────────── */

interface SearchDoc {
  identifier: string;
  title?: string;
  creator?: string | string[];
  year?: string;
  licenseurl?: string;
  downloads?: number;
  subject?: string | string[];
}

interface AudioFile {
  name: string;
  format?: string;
  length?: string;
  bitrate?: string;
  title?: string;
  artist?: string;
  album?: string;
  track?: string;
  source?: string;
}

interface ItemMetadata {
  metadata?: Record<string, unknown>;
  files?: AudioFile[];
}

function firstStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function asGenreList(v: string | string[] | undefined): string[] {
  if (!v) return [];
  const raw = Array.isArray(v) ? v : [v];
  return raw
    .flatMap((s) => s.split(/[,;]+/))
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

/* ─── License parsing (strict — unparsable → excluded) ─────────────────── */

const CC_KINDS: Record<string, LicenseKind> = {
  "by": "cc-by",
  "by-sa": "cc-by-sa",
  "by-nd": "cc-by-nd",
  "by-nc": "cc-by-nc",
  "by-nc-sa": "cc-by-nc-sa",
  "by-nc-nd": "cc-by-nc-nd",
};

function parseLicense(
  url: string | undefined,
  artist: string,
  title: string,
  pageUrl: string
): LicenseInfo | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean); // ["licenses","by-nc-sa","4.0"]
    if (u.hostname.endsWith("creativecommons.org")) {
      if (parts[0] === "publicdomain") {
        if (parts[1] === "zero") {
          return {
            kind: "cc0",
            label: "CC0 1.0 Universal",
            url,
            attribution: `${artist} — ${title} · Public domain (CC0) · ${pageUrl}`,
            commercialUse: true,
            attributionRequired: false,
            derivativesAllowed: true,
          };
        }
        return {
          kind: "public-domain",
          label: "Public Domain Mark",
          url,
          attribution: `${artist} — ${title} · Public domain · ${pageUrl}`,
          commercialUse: true,
          attributionRequired: false,
          derivativesAllowed: true,
        };
      }
      if (parts[0] === "licenses") {
        const slug = parts[1] ?? "";
        const version = parts[2] ? ` ${parts[2]}` : "";
        const kind = CC_KINDS[slug];
        if (!kind) return null;
        const label = `CC ${slug.toUpperCase().replace(/-/g, "-")}${version}`;
        const nc = slug.includes("nc");
        return {
          kind,
          label,
          url,
          attribution: `${artist} — ${title} · ${label} · ${pageUrl}`,
          commercialUse: !nc,
          attributionRequired: slug.includes("by"),
          derivativesAllowed: !slug.includes("nd"),
        };
      }
    }
    return null; // unknown license URL shape → excluded, never guessed
  } catch {
    return null;
  }
}

/* ─── Mapping ──────────────────────────────────────────────────────────── */

function parseLength(len: string | undefined): number {
  if (!len) return 0;
  const parts = len.split(":").map((p) => parseFloat(p));
  if (parts.some((p) => !Number.isFinite(p))) return 0;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function pickAudioFiles(files: AudioFile[]): { file: AudioFile; index: number }[] {
  const mp3s = files
    .map((f, index) => ({ file: f, index }))
    .filter(({ file }) => /\.mp3$/i.test(file.name) && /MP3/i.test(file.format ?? "MP3"));
  mp3s.sort((a, b) => (Number(b.file.bitrate) || 0) - (Number(a.file.bitrate) || 0));
  return mp3s.slice(0, 3);
}

function docToTracks(doc: SearchDoc, meta: ItemMetadata | null): Track[] {
  const identifier = doc.identifier;
  const itemTitle = firstStr(doc.title) ?? identifier;
  const itemArtist = firstStr(doc.creator) ?? "Unknown Artist";
  const pageUrl = `https://archive.org/details/${identifier}`;
  const artwork = `${IMG_BASE}/${identifier}`;
  const license = parseLicense(firstStr(doc.licenseurl), itemArtist, itemTitle, pageUrl);
  if (!license) return []; // no reliable license → provider-level exclusion

  const chosen = meta?.files ? pickAudioFiles(meta.files) : [];
  if (!chosen.length) return [];

  const genres = asGenreList(doc.subject ?? (meta?.metadata?.subject as string | string[] | undefined));
  const year = firstStr(doc.year);

  return chosen.map(({ file, index }) => {
    const title = file.title || itemTitle;
    const artist = file.artist || itemArtist;
    const bitrateKbps = Number(file.bitrate) || undefined;
    return {
      id: `ia_${identifier}::${index}`,
      title,
      artist,
      album: file.album || itemTitle,
      albumId: `ia_${identifier}`,
      artistId: undefined,
      url: `${DL_BASE}/${identifier}/${encodeURIComponent(file.name)}`,
      downloadUrl: `${DL_BASE}/${identifier}/${encodeURIComponent(file.name)}`,
      artwork,
      duration: parseLength(file.length),
      source: "archive",
      provider: ID,
      license: { ...license, attribution: `${artist} — ${title} · ${license.label} · ${pageUrl}` },
      quality: { bitrateKbps, lossless: false },
      pageUrl,
      genres,
      lyrics: null,
    } satisfies Track;
  });
}

/* ─── Fetch helpers (cache + light concurrency cap) ────────────────────── */

const metaCache = new Map<string, { at: number; data: ItemMetadata | null }>();
const META_TTL = 30 * 60 * 1000;

async function fetchJson<T>(url: string, timeoutMs = 9000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`IA HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

let active = 0;
const waiters: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 5) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active = Math.max(0, active - 1);
    const next = waiters.shift();
    if (next) next();
  }
}

async function hydrate(docs: SearchDoc[]): Promise<Track[]> {
  const results = await Promise.allSettled(
    docs.map(async (doc) => {
      const meta = await withSlot(async () => {
        const cached = metaCache.get(doc.identifier);
        if (cached && Date.now() - cached.at < META_TTL) return cached.data;
        const data = await fetchJson<ItemMetadata>(`${META_BASE}/${doc.identifier}`).catch(() => null);
        metaCache.set(doc.identifier, { at: Date.now(), data });
        if (metaCache.size > 200) {
          const oldest = metaCache.keys().next().value;
          if (oldest) metaCache.delete(oldest);
        }
        return data;
      });
      return docToTracks(doc, meta);
    })
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

async function searchItems(q: string, rows: number, sort?: string): Promise<SearchDoc[]> {
  const params = new URLSearchParams({ q, rows: String(rows), page: "1", output: "json" });
  for (const f of ["identifier", "title", "creator", "year", "licenseurl", "downloads", "subject"]) {
    params.append("fl[]", f);
  }
  if (sort) params.append("sort[]", sort);
  const json = await fetchJson<{ response?: { docs?: SearchDoc[] } }>(`${SEARCH_BASE}?${params.toString()}`);
  return json.response?.docs ?? [];
}

function luceneEscape(q: string): string {
  return q.replace(/["\\]/g, " ").trim();
}

/* ─── Hoisted helpers (used by the provider object below) ─────────────── */

async function archiveTrackById(id: string): Promise<Track[]> {
  const rest = id.replace(/^ia_/, "");
  const sep = rest.indexOf("::");
  if (sep < 0) return [];
  const identifier = rest.slice(0, sep);
  const fileIndex = parseInt(rest.slice(sep + 2), 10) || 0;
  return fetchJson<ItemMetadata>(`${META_BASE}/${identifier}`)
    .then((meta) => {
      const licenseUrl = firstStr(meta.metadata?.licenseurl as string | string[] | undefined);
      const doc: SearchDoc = {
        identifier,
        title: firstStr(meta.metadata?.title as string | string[] | undefined),
        creator: meta.metadata?.creator as string | string[] | undefined,
        licenseurl: licenseUrl,
        subject: meta.metadata?.subject as string | string[] | undefined,
        year: firstStr(meta.metadata?.year as string | string[] | undefined),
      };
      return docToTracks(doc, meta).filter((t) => t.id === id || t.id.endsWith(`::${fileIndex}`));
    })
    .catch(() => []);
}

async function archiveByTag(tag: string, opts: FetchOpts): Promise<Track[]> {
  const esc = luceneEscape(tag);
  return searchItems(
    `${COLLECTION_Q} AND (subject:("${esc}") OR title:("${esc}"))`,
    opts.limit ?? 14,
    "downloads desc"
  ).then(hydrate);
}

/* ─── Provider ──────────────────────────────────────────────────────────── */

const capabilities: ProviderCapabilities = {
  search: true,
  trending: true,
  moods: true,
  lyrics: false,
  artistDetail: true,
  albumDetail: true,
  trackById: true,
};

export const archiveProvider: MusicProvider = {
  id: ID,
  displayName: "Internet Archive",
  licensing: {
    exposure: "per-track",
    notes:
      "Official netlabels collection — original releases from independent netlabels, each item carrying an explicit Creative Commons license URL. Tracks without a parseable license are excluded. NC licenses pass personal mode only; BY/BY-SA/CC0/Public-Domain pass commercial mode with attribution.",
  },
  requiresKey: false,
  browserEnabled: true,
  rank: 1,
  capabilities,

  isConfigured(): boolean {
    return true; // keyless public API
  },

  trending(opts: FetchOpts): Promise<Track[]> {
    return searchItems(COLLECTION_Q, opts.limit ?? 16, "downloads desc").then(hydrate);
  },

  search(query: string, opts: FetchOpts): Promise<Track[]> {
    const esc = luceneEscape(query);
    return searchItems(
      `${COLLECTION_Q} AND (title:("${esc}") OR creator:("${esc}"))`,
      opts.limit ?? 16
    ).then(hydrate);
  },

  byTag(tag: string, opts: FetchOpts): Promise<Track[]> {
    return archiveByTag(tag, opts);
  },

  moods(kind: "energetic" | "chill" | "focus", opts: FetchOpts): Promise<Track[]> {
    const subjects: Record<string, string> = {
      energetic: "electronic",
      chill: "ambient",
      focus: "instrumental",
    };
    return archiveByTag(subjects[kind], { ...opts, limit: opts.limit ?? 12 });
  },

  async trackById(id: string): Promise<Track[]> {
    return archiveTrackById(id);
  },

  lyrics() {
    return Promise.resolve({ lyrics: null });
  },

  artistTopTracks(_artistId: string): Promise<Track[]> {
    // Archive has no stable artist ids; the facade routes this to Jamendo.
    return Promise.resolve([]);
  },

  albumTracks(albumId: string): Promise<Track[]> {
    return archiveTrackById(albumId.startsWith("ia_") ? `${albumId}::0` : albumId);
  },
};
