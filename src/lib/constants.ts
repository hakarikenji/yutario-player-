/**
 * Global constants — build identity, network budgets, ad inventory, tunables.
 */

export const BUILD = {
  name: "Yutario Player",
  studio: "Hakari Studio",
  version: "1.0.0",
  buildNumber: 1000,
  channel: "stable",
  copyright: `© ${new Date().getFullYear()} Hakari Studio. All rights reserved.`,
} as const;

/**
 * Jamendo client id — provisioned by Hakari Studio (the app operator), never
 * by listeners. Injected at build time from VITE_JAMENDO_CLIENT_ID (scripts/
 * inject-keys.mjs bakes it into index.html for both the web deploy and the
 * Android APK). Listeners never see or manage keys.
 */
export const JAMENDO_FALLBACK_CLIENT_ID = "";

export const JAMENDO_BASE = "https://api.jamendo.com/v3.0";

export const NETWORK = {
  /** Jamendo free tier is generous; still, budget hard caps keep us safe. */
  MAX_CONCURRENT_FETCHES: 6,
  FETCH_TIMEOUT_MS: 9000,
  CACHE_TTL_MS: 10 * 60 * 1000,
  PREFETCH_BYTES_HINT: 256 * 1024,
} as const;

export const EQ_BANDS = [60, 230, 910, 3600, 14000];

export const EQ_PRESETS = [
  { id: "flat", name: "Flat", gated: false, gains: [0, 0, 0, 0, 0] },
  { id: "bass", name: "Bass Booster", gated: false, gains: [8, 5, 1, -1, 0] },
  { id: "vocal", name: "Vocal Clarity", gated: false, gains: [-2, 0, 4, 3, 0] },
  { id: "electronic", name: "Electronic", gated: false, gains: [6, 2, -2, 3, 5] },
  { id: "acoustic", name: "Acoustic", gated: false, gains: [3, 1, 2, 2, 1] },
  { id: "hiphop", name: "Hip-Hop", gated: false, gains: [7, 4, -1, 2, 3] },
  { id: "treble", name: "Treble", gated: false, gains: [-2, -1, 0, 4, 7] },
  {
    id: "ultra_hd",
    name: "Ultra-HD Audiophile",
    gated: true,
    gains: [5, 1, -1, 4, 8],
  },
] as const;

export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export const SLEEP_MINUTES = [5, 10, 15, 30, 45, 60] as const;

export const BITRATE_OPTIONS: { key: "low" | "balanced" | "hifi"; label: string; audioformat: "mp31" | "mp32"; note: string }[] = [
  { key: "low", label: "Low", audioformat: "mp31", note: "96 kbps — data saver" },
  { key: "balanced", label: "Balanced", audioformat: "mp31", note: "96 kbps — smart caching" },
  { key: "hifi", label: "High-Fidelity", audioformat: "mp32", note: "VBR — audiophile" },
];

export const ADS = {
  banner_home: { unit: "unity-banner-01", size: "320x50" },
  rewarded_eq: { unit: "unity-rewarded-eq", reward: "ultra_hd_eq" },
  rewarded_ai: { unit: "unity-rewarded-ai", reward: "ai_pro_session" },
  interstitial_karaoke: { unit: "unity-interstitial-karaoke", size: "fullscreen" },
} as const;

export const PLAYLIST_MOODS = [
  { id: "energetic", name: "Energetic Mix", tag: "energetic", emoji: "⚡" },
  { id: "chill", name: "Chill Vibes", tag: "chillout", emoji: "🌙" },
  { id: "focus", name: "Focus Flow", tag: "instrumental", emoji: "🎯" },
] as const;

export const VOICE_SUPPRESSION = {
  MIN: 0.2,
  MAX: 1.0,
  DEFAULT: 0.7,
} as const;

export const CROSSFADE_CURVE = "equalpower" as const;

export const LEGAL_LINKS = {
  terms: "https://www.jamendo.com/legal/terms-of-use",
  privacy: "https://www.jamendo.com/legal/privacy-policy",
  licenses: "https://www.jamendo.com/legal/creative-commons",
} as const;
