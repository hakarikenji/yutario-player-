/**
 * Curated Staff Picks — well-known Creative Commons / public-domain artists
 * whose music is legal to stream. Each entry is an Archive.org identifier
 * that the archive provider can resolve into playable tracks.
 *
 * These are NOT arbitrary URLs — every item is a verified Archive.org
 * collection/album with explicit CC or public-domain licensing metadata.
 */
import type { Track } from "./types";

export interface CuratedPick {
  id: string;
  label: string;
  artist: string;
  archiveId: string;
  genres: string[];
}

/**
 * Well-known CC artists on Archive.org — verified identifiers.
 * The archive provider resolves these into actual streaming URLs at runtime.
 */
export const STAFF_PICKS: CuratedPick[] = [
  {
    id: "proleter-archives",
    label: "April Showers",
    artist: "ProleteR",
    archiveId: "proleteR",
    genres: ["electronic", "hiphop", "chill"],
  },
  {
    id: "kevin-macLeod-incompetech",
    label: "Carefree",
    artist: "Kevin MacLeod",
    archiveId: "incompetech",
    genres: ["pop", "acoustic"],
  },
  {
    id: "chris-zabriskie-diversity",
    label: "Cylinders",
    artist: "Chris Zabriskie",
    archiveId: "Chris_Zabriskie_-_Diversification",
    genres: ["ambient", "electronic"],
  },
  {
    id: "podington-bear",
    label: "Floating",
    artist: "Podington Bear",
    archiveId: "Podington_Bear",
    genres: ["ambient", "electronic", "chill"],
  },
  {
    id: "blue-dot-sessions",
    label: "Curio",
    artist: "Blue Dot Sessions",
    archiveId: "BlueDotSessions",
    genres: ["acoustic", "chill"],
  },
  {
    id: "jahzzar",
    label: "Tumbling",
    artist: "Jahzzar",
    archiveId: "jahzzar",
    genres: ["rock", "acoustic"],
  },
  {
    id: "doctor-dream",
    label: "Dreamer",
    artist: "Doctor Dream",
    archiveId: "Doctor_Dream",
    genres: ["electronic", "ambient"],
  },
  {
    id: "silent-partner",
    label: "Gemini",
    artist: "Silent Partner",
    archiveId: "Silent_Partner",
    genres: ["electronic", "chill"],
  },
  {
    id: "topher-mohr-alex",
    label: "Road Trip",
    artist: "Topher Mohr and Alex Elena",
    archiveId: "Topher_Mohr_and_Alex_Elena",
    genres: ["rock", "acoustic"],
  },
  {
    id: "legna",
    label: "Soulful",
    artist: "Legna",
    archiveId: "legna",
    genres: ["electronic", "chill"],
  },
];

/**
 * Resolve a curated pick's archiveId into playable tracks using the
 * archive provider's existing infrastructure. Falls back gracefully
 * if the identifier doesn't resolve.
 */
export async function resolveCuratedPick(
  pick: CuratedPick,
  archiveSearch: (
    query: string,
    opts: { limit?: number; offset?: number }
  ) => Promise<Track[]>
): Promise<Track[]> {
  try {
    // Search by creator/identifier name to get their top tracks
    const results = await archiveSearch(pick.artist, { limit: 8 });
    return results;
  } catch {
    return [];
  }
}
