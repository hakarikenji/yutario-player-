/**
 * The Gate — single licensing + quality screen every provider track passes
 * before it can appear in Yutario. Enforces, in order:
 *
 *  1. License presence: no reliable license metadata → excluded (never guessed).
 *  2. Licensing mode: "commercial" mode only admits tracks whose license
 *     explicitly permits commercial use (CC0/PD, CC BY family, or a provider
 *     commercial program covering the track).
 *  3. Derivative rejection: remixes, covers, "sped up", "slowed", "reverb",
 *     "nightcore", "daycore", "8D audio", "lofi remix", DJ edits/mashups.
 *  4. Suspicious titles (AI-voice covers, movie/star name bait, etc.).
 *  5. Quality floor: junk encodings and unusable durations are dropped.
 *  6. Cross-provider dedupe (normalized artist + title).
 *  7. Deterministic ranking: originals first, license-permissive first,
 *     higher audio quality first, then provider rank (stable ordering).
 *
 * Nothing here bypasses a restriction — gating is strictly subtractive.
 */
import type { LicenseInfo, ProviderId, Track } from "../types";

/* ─── Derivative / edit detection ───────────────────────────────────────── */

const DERIVATIVE_PATTERNS: RegExp[] = [
  /\bremix(es|ed)?\b/i,
  /\bbootleg\b/i,
  /\bmash\s?up\b/i,
  /\b(edit|extended\s+mix|radio\s+edit|club\s+mix|vip\s+mix|dub\s+mix)\b/i,
  /\bfeat\.?\s*remix\b/i,
  /\bcovers?\b/i,
  /\bcover\s+version\b/i,
  /\btribut(e|es)\b/i,
  /\bkaraoke\s+version\b/i,
  /\b(performed\s+by|made\s+famous\s+by|originally\s+(by|performed))\b/i,
  /\bin\s+the\s+style\s+of\b/i,
  /\b(piano|acoustic|orchestral|8-?bit|chiptune|strings|metal|jazz|lo-?fi)\s+(version|cover|rendition|remake)\b/i,
  /\bsped\s?(up|‐|-|–)\b/i,
  /\bspeed\s?up\b/i,
  /\bslowed\s?(down|‐|-|–|\+)?\b/i,
  /\bslow(ed)?\s?\+\s?reverb\b/i,
  /\breverb(ed)?\b/i,
  /\bnightcore\b/i,
  /\bdaycore\b/i,
  /\bdouble\s?time\b/i,
  /\bbass\s?boosted?\b/i,
  /\b8d\s?audio\b/i,
  /\bchopped\s*(and|n)\s*screwed\b/i,
  /\bscrewed\b/i,
  /\b(1[0-9]|20)\s?%?\s*(faster|slower)\b/i,
  /\bfull\s*bass\b/i,
  /\bhardstyle\s+remix\b/i,
  /\bflip\b/i,
  /\bvs\.?\b.*\bremix\b/i,
];

/** Bait/low-trust title patterns (AI covers, movie bait, ringtone spam). */
const SUSPICIOUS_PATTERNS: RegExp[] = [
  /\bai\s*(cover|version|remake|generated)\b/i,
  /\bvoice\s*(cover|clone|model)\b/i,
  /\blyrics?\s+only\b/i,
  /\bbing\s*tone\b/i,
  /\bringt(ones?|unes?)\b/i,
  /\bfull\s+album\s*\(/i,
  /\binstrumental\s+karaok/i,
  /\b(minecraft|roblox|fnf|fNF)\b.*(song|cover|mod)/i,
  /\b(marvel|avengers|spider[- ]?man|goku|fortnite)\b.*(theme|song|cover)/i,
  /\bfake\b/i,
  /\bleaked\b/i,
];

const DERIVATIVE_GENRE_TAGS = new Set([
  "remix",
  "mashup",
  "bootleg",
  "cover",
  "covers",
  "nightcore",
  "spedup",
  "slowed",
  "slowedandreverb",
  "reverb",
  "bassboost",
  "bassboosted",
  "8daudio",
  "karaoke",
  "djmix",
]);

function normTag(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function looksDerivative(track: {
  title: string;
  genres?: string[];
  album?: string;
}): boolean {
  const haystack = `${track.title} ${track.album ?? ""}`;
  if (DERIVATIVE_PATTERNS.some((re) => re.test(haystack))) return true;
  return (track.genres ?? []).some((g) => DERIVATIVE_GENRE_TAGS.has(normTag(g)));
}

export function looksSuspicious(track: { title: string; artist: string }): boolean {
  return SUSPICIOUS_PATTERNS.some((re) => re.test(`${track.title} ${track.artist}`));
}

/* ─── Quality floor ─────────────────────────────────────────────────────── */

export interface QualityPolicy {
  /** Streams below this kbps (when known) are rejected. */
  minBitrateKbps: number;
  /** Tracks shorter than this are treated as jingles/preview spam. */
  minDurationSec: number;
  /** Anything longer is a mix/compilation — not a "song". */
  maxDurationSec: number;
}

export const QUALITY_FLOOR: QualityPolicy = {
  minBitrateKbps: 96,
  minDurationSec: 45,
  maxDurationSec: 15 * 60,
};

export function passesQuality(track: {
  duration: number;
  quality?: { bitrateKbps?: number; lossless?: boolean };
}): boolean {
  if (!Number.isFinite(track.duration) || track.duration <= 0) return true; // unknown → let metadata-less local files through
  if (track.duration < QUALITY_FLOOR.minDurationSec) return false;
  if (track.duration > QUALITY_FLOOR.maxDurationSec) return false;
  const kbps = track.quality?.bitrateKbps;
  if (typeof kbps === "number" && !track.quality?.lossless && kbps > 0 && kbps < QUALITY_FLOOR.minBitrateKbps) {
    return false;
  }
  return true;
}

/* ─── License policy ───────────────────────────────────────────────────── */

export type LicensingMode = "noncommercial" | "commercial";

/**
 * Decide admission by license. Returns a reason string when rejected.
 * Unknown license → ALWAYS rejected in provider catalogs (never guessed);
 * local files are the user's own property and bypass the gate.
 */
export function licenseGate(
  license: LicenseInfo | undefined,
  mode: LicensingMode
): { ok: boolean; reason?: string } {
  if (!license) return { ok: false, reason: "no license metadata" };
  switch (license.kind) {
    case "cc0":
    case "public-domain":
      return { ok: true };
    case "jamendo-cc":
      // Jamendo's catalog license (CC-licensed with Jamendo Terms covering
      // distribution/streaming). Commercial playback requires Jamendo's
      // commercial program, handled per-track via commercialUse.
      return mode === "commercial"
        ? license.commercialUse
          ? { ok: true }
          : { ok: false, reason: "commercial use requires provider program" }
        : { ok: true };
    case "cc-by":
    case "cc-by-sa":
      return { ok: true }; // commercial allowed with attribution (CC terms)
    case "cc-by-nd":
    case "cc-by-nc":
    case "cc-by-nc-sa":
    case "cc-by-nc-nd":
      return mode === "commercial"
        ? { ok: false, reason: "noncommercial license" }
        : { ok: true };
    case "local-file":
      return { ok: true }; // user's own files — not redistributed by us
    case "unknown":
    default:
      return { ok: false, reason: "license metadata missing" };
  }
}

/** ND tracks can't be exported into karaoke/derivative workflows cleanly. */
export function allowsDerivativeWork(license: LicenseInfo | undefined): boolean {
  return !!license && license.derivativesAllowed;
}

/* ─── Dedupe + ranking ──────────────────────────────────────────────────── */

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/\b(official|audio|video|lyrics?|hd|hq|visualizer|full song)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function dedupeTracks(tracks: Track[]): Track[] {
  const seen = new Map<string, Track>();
  const firstSeenOrder: string[] = [];
  for (const t of tracks) {
    const key = `${normalizeKey(t.artist)}|${normalizeKey(t.title)}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, t);
      firstSeenOrder.push(key);
      continue;
    }
    // Keep the higher-quality duplicate (lossless > kbps > earlier provider rank).
    const better =
      ((t.quality?.lossless ? 1 : 0) - (existing.quality?.lossless ? 1 : 0) ||
      ((t.quality?.bitrateKbps ?? 0) - (existing.quality?.bitrateKbps ?? 0))) ||
      (rankOf(existing) - rankOf(t));
    if (better > 0) {
      seen.set(key, t);
    }
  }
  return firstSeenOrder.map((k) => seen.get(k)!).filter(Boolean);
}

/* Provider preference — Jamendo has the richest metadata + commercial path. */
const PROVIDER_RANK: Partial<Record<ProviderId, number>> = {
  jamendo: 0,
  archive: 1,
  ccmixter: 2,
};

function rankOf(t: Track): number {
  return PROVIDER_RANK[t.provider ?? t.source] ?? 3;
}

/** License permissiveness — originals with freer licenses rank first. */
function licenseScore(l?: LicenseInfo): number {
  if (!l) return 0;
  switch (l.kind) {
    case "cc0":
    case "public-domain":
      return 5;
    case "cc-by":
      return 4;
    case "cc-by-sa":
      return 3;
    case "jamendo-cc":
      return 2;
    case "cc-by-nd":
      return 1;
    default:
      return 0;
  }
}

/**
 * Rank: license permissiveness, then quality, then provider preference.
 * Stable (Array.prototype.sort is stable in modern engines) so provider
 * interleaving is deterministic for identical scores.
 */
export function rankTracks(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) => {
    const ls = licenseScore(b.license) - licenseScore(a.license);
    if (ls !== 0) return ls;
    const q =
      (b.quality?.lossless ? 1 : 0) - (a.quality?.lossless ? 1 : 0) ||
      (b.quality?.bitrateKbps ?? 0) - (a.quality?.bitrateKbps ?? 0);
    if (q !== 0) return q;
    return rankOf(a) - rankOf(b);
  });
}

/* ─── The screen itself ─────────────────────────────────────────────────── */

export interface GateResult {
  admitted: Track[];
  rejected: number;
  reasons: Record<string, number>;
}

export function gateTracks(
  tracks: Track[],
  mode: LicensingMode,
  opts: { isLocal?: (t: Track) => boolean; dedupe?: boolean; rank?: boolean } = {}
): GateResult {
  const reasons: Record<string, number> = {};
  const bump = (r: string) => {
    reasons[r] = (reasons[r] ?? 0) + 1;
  };

  const admitted: Track[] = [];
  for (const t of tracks) {
    const isLocal = opts.isLocal?.(t) ?? (t.source === "local" || t.local === true);
    if (isLocal) {
      admitted.push(t);
      continue;
    }
    if (t.license?.kind === "local-file") {
      admitted.push(t);
      continue;
    }
    const licenseCheck = licenseGate(t.license, mode);
    if (!licenseCheck.ok) {
      bump(licenseCheck.reason ?? "license");
      continue;
    }
    if (looksDerivative(t)) {
      bump("remix/cover/nightcore/slowed");
      continue;
    }
    if (looksSuspicious(t)) {
      bump("suspicious title");
      continue;
    }
    if (!passesQuality(t)) {
      bump("below quality floor");
      continue;
    }
    admitted.push(t);
  }

  let out = admitted;
  if (opts.dedupe !== false) out = dedupeTracks(out);
  if (opts.rank !== false) out = rankTracks(out);

  return { admitted: out, rejected: tracks.length - out.length, reasons };
}

/** One-line human summary for attribution displays. */
export function attributionLine(t: Track): string {
  if (t.source === "local" || t.license?.kind === "local-file") return "Local file — user provided";
  if (t.license) return t.license.attribution;
  return `${t.artist} — ${t.title}`;
}
