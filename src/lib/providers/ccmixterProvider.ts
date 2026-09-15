/**
 * ccMixter provider — DISABLED in the browser runtime by design:
 *
 *  • Its content API returns good license metadata, but audio files are served
 *    WITHOUT CORS headers, so a browser <audio>/Web Audio pipeline cannot
 *    legally-and-technically stream them; proxying would circumvent that.
 *  • The catalog is predominantly derivative works (remixes/pells) — exactly
 *    the category Yutario excludes in favor of originals.
 *
 * Kept as an explicit, documented stub so the provider registry reflects the
 * full policy: excluded from commercial playback, not guessed around. A native
 * shell (no CORS constraints) could enable it after curation.
 */
import type { MusicProvider, ProviderCapabilities } from "./types";

const disabled = (what: string): never => {
  throw new Error(`ccMixter provider disabled in web runtime: ${what}`);
};

const capabilities: ProviderCapabilities = {
  search: false,
  trending: false,
  moods: false,
  lyrics: false,
  artistDetail: false,
  albumDetail: false,
  trackById: false,
};

export const ccmixterProvider: MusicProvider = {
  id: "ccmixter",
  displayName: "ccMixter",
  licensing: {
    exposure: "per-track",
    notes:
      "Excluded from browser playback: audio endpoints send no CORS headers (a proxy would circumvent origin controls) and the catalog is predominantly derivative works (remix stems/pells) that Yutario filters out. Revisit via a native shell with curated original uploads only.",
  },
  requiresKey: false,
  browserEnabled: false,
  rank: 2,
  capabilities,

  isConfigured(): boolean {
    return false;
  },

  trending(): Promise<never> {
    return disabled("trending");
  },
  search(): Promise<never> {
    return disabled("search");
  },
};
