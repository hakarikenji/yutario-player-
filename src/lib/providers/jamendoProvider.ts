/**
 * Jamendo provider — 500k+ Creative Commons original tracks via the official
 * Jamendo API v3.0. Licensing: catalog is CC-licensed under Jamendo's terms;
 * commercial playback requires Jamendo's commercial licensing program, so
 * `commercialUse` is false at the API tier and the gate enforces that.
 */
import type { BitrateKey, LicenseInfo, ProviderId, Track } from "../types";
import type { FetchOpts, MusicProvider, ProviderCapabilities } from "./types";
import { jamendo, getJamendoClientId } from "../jamendo";
import { LEGAL_LINKS } from "../constants";

const ID: ProviderId = "jamendo";

/** Catalog-level license descriptor applied to every Jamendo track. */
function jamendoLicense(artist: string, title: string, pageUrl?: string): LicenseInfo {
  return {
    kind: "jamendo-cc",
    label: "Creative Commons (Jamendo catalog)",
    url: LEGAL_LINKS.licenses,
    attribution: `${artist} — ${title}${pageUrl ? ` (${pageUrl})` : ""} · via Jamendo, CC-licensed`,
    commercialUse: false,
    attributionRequired: true,
    derivativesAllowed: false,
  };
}

function decorate(list: Track[]): Track[] {
  return list.map((t) => {
    const pageUrl = (t as Track & { pageUrl?: string }).pageUrl;
    return {
      ...t,
      provider: ID,
      pageUrl: pageUrl ?? (t.id.startsWith("jm_") ? `https://www.jamendo.com/track/${t.id.slice(3)}` : undefined),
      license: jamendoLicense(t.artist, t.title, pageUrl),
    };
  });
}

const capabilities: ProviderCapabilities = {
  search: true,
  trending: true,
  moods: true,
  lyrics: true,
  artistDetail: true,
  albumDetail: true,
  trackById: true,
};

export const jamendoProvider: MusicProvider = {
  id: ID,
  displayName: "Jamendo",
  licensing: {
    exposure: "per-track",
    notes:
      "Catalog is Creative Commons–licensed under Jamendo's terms. Streaming/attribution is permitted for personal use; monetized playback requires Jamendo's commercial licensing program. Original artist uploads only — the platform does not host major-label recordings.",
    commercialProgramUrl: "https://www.jamendo.com/legal/commercial-licensing",
    trackCountHint: "500,000+ originals",
  },
  requiresKey: true,
  browserEnabled: true,
  rank: 0,
  capabilities,

  isConfigured(): boolean {
    return !!getJamendoClientId();
  },

  trending(opts: FetchOpts): Promise<Track[]> {
    return jamendo.trending(opts).then(decorate);
  },

  search(query: string, opts: FetchOpts): Promise<Track[]> {
    return jamendo.freeTextSearch(query, opts).then(decorate);
  },

  byTag(tag: string, opts: FetchOpts): Promise<Track[]> {
    return jamendo.byTag(tag, opts).then(decorate);
  },

  moods(kind: "energetic" | "chill" | "focus", opts: FetchOpts): Promise<Track[]> {
    return jamendo.mood(kind, opts).then(decorate);
  },

  trackById(id: string, bitrate: BitrateKey): Promise<Track[]> {
    return jamendo.trackById(id, bitrate).then(decorate);
  },

  lyrics(trackId: string) {
    return jamendo.lyrics(trackId);
  },

  artistTopTracks(artistId: string, opts: FetchOpts): Promise<Track[]> {
    return jamendo.artistTopTracks(artistId, opts).then(decorate);
  },

  albumTracks(albumId: string, opts: FetchOpts): Promise<Track[]> {
    return jamendo.albumTracks(albumId, opts).then(decorate);
  },
};
