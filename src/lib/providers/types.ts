/**
 * MusicProvider — the single contract every catalog source implements.
 * The facade (lib/music.ts) fans requests out across enabled providers,
 * then screens everything through the licensing/quality gate.
 */
import type { BitrateKey, ProviderId, Track } from "../types";

export interface FetchOpts {
  limit?: number;
  offset?: number;
  bitrate?: BitrateKey;
}

export interface LyricsResult {
  lyrics: string | null;
}

export interface ProviderCapabilities {
  search: boolean;
  trending: boolean;
  moods: boolean;
  lyrics: boolean;
  artistDetail: boolean;
  albumDetail: boolean;
  trackById: boolean;
}

export interface MusicProvider {
  id: ProviderId;
  displayName: string;

  /** Licensing transparency — surfaced verbatim in Settings. */
  licensing: {
    /** How this provider exposes license metadata. */
    exposure: "per-track" | "catalog-level" | "none";
    notes: string;
    /** Where commercial licensing can be arranged, if offered. */
    commercialProgramUrl?: string;
    /** Rough catalog size for the UI. */
    trackCountHint?: string;
  };

  /** Needs an API key (user-supplied or env) before any call can succeed. */
  requiresKey: boolean;
  /** Reachable from the browser runtime (CORS on API + audio streams). */
  browserEnabled: boolean;
  /** Lower ranks are preferred when merging multi-provider results. */
  rank: number;
  capabilities: ProviderCapabilities;

  isConfigured(): boolean;

  trending(opts: FetchOpts): Promise<Track[]>;
  search(query: string, opts: FetchOpts): Promise<Track[]>;
  byTag?(tag: string, opts: FetchOpts): Promise<Track[]>;
  moods?(kind: "energetic" | "chill" | "focus", opts: FetchOpts): Promise<Track[]>;
  trackById?(id: string, bitrate: BitrateKey): Promise<Track[]>;
  lyrics?(trackId: string): Promise<LyricsResult>;
  artistTopTracks?(artistId: string, opts: FetchOpts): Promise<Track[]>;
  albumTracks?(albumId: string, opts: FetchOpts): Promise<Track[]>;
}

export function providerSupports(p: MusicProvider, key: keyof ProviderCapabilities): boolean {
  return p.browserEnabled && p.capabilities[key] === true;
}
