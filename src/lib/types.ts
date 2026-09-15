/**
 * Yutario Player — core domain types.
 * Single source of truth shared by audio engine, providers, and UI.
 */

export type TrackSource = "jamendo" | "archive" | "local";

/** Every pluggable music provider. "local" is the user's own files. */
export type ProviderId = "jamendo" | "archive" | "ccmixter" | "local";

/** Canonical license kinds the app understands. */
export type LicenseKind =
  | "cc-by"
  | "cc-by-sa"
  | "cc-by-nd"
  | "cc-by-nc"
  | "cc-by-nc-sa"
  | "cc-by-nc-nd"
  | "cc0"
  | "public-domain"
  | "jamendo-cc"
  | "local-file"
  | "unknown";

/**
 * Licensing/usage metadata inspected for every provider track. Tracks without
 * reliable license info are excluded from commercial playback rather than
 * guessed (see providers/gate.ts).
 */
export interface LicenseInfo {
  kind: LicenseKind;
  /** Human label, e.g. "CC BY-NC-SA 4.0". */
  label: string;
  /** Canonical license text URL. */
  url?: string;
  /** Ready-to-paste attribution line. */
  attribution: string;
  /** Provider explicitly permits commercial use for this track. */
  commercialUse: boolean;
  /** Attribution is required by the license. */
  attributionRequired: boolean;
  /** Derivative works are allowed (ND licenses = false). */
  derivativesAllowed: boolean;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId?: string;
  artistId?: string;
  /** Direct playable URL (stream) or blob/object URL for local files. */
  url: string;
  /** Download URL when the license allows it. */
  downloadUrl?: string;
  artwork?: string;
  duration: number; // seconds
  source: TrackSource;
  /** Which music provider served this track (equals source for catalogs). */
  provider?: ProviderId;
  /** Licensing/usage metadata — provider tracks are gated on this. */
  license?: LicenseInfo;
  /** Audio quality hints used by the quality floor. */
  quality?: { bitrateKbps?: number; lossless?: boolean };
  /** Canonical track page (Jamendo page, archive.org details, …). */
  pageUrl?: string;
  genres?: string[];
  lyrics?: LrcLine[] | null;
  local?: boolean;
  fileName?: string;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  artwork?: string;
  year?: string;
  trackCount?: number;
  source: TrackSource;
}

export interface Artist {
  id: string;
  name: string;
  image?: string;
  genres?: string[];
  source: TrackSource;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  tracks: Track[];
  /** Editor-created playlists persist; smart ones re-derive. */
  smart?: boolean;
  smartQuery?: string;
  smartTag?: string;
  createdAt: number;
  updatedAt: number;
}

export interface LrcLine {
  timeMs: number;
  words: { text: string; startMs: number; endMs: number; isHot: boolean }[];
  text: string;
}

export interface PlayHistoryEntry {
  track: Track;
  playedAt: number;
  msPlayed: number;
}

export interface LocalFolderHandle {
  name: string;
  kind: "fs-access" | "input";
  handle?: FileSystemDirectoryHandle;
}

/* ─── Audio engine ─────────────────────────────────────────────────────── */

export type RepeatMode = "off" | "all" | "one";
export type PlayState = "stopped" | "loading" | "playing" | "paused" | "error";
export type ShuffleState = boolean;

export interface PlaybackStatus {
  state: PlayState;
  track: Track | null;
  positionSec: number;
  durationSec: number;
  bufferedSec: number;
  volume: number;
  muted: boolean;
  rate: number;
  shuffle: boolean;
  repeat: RepeatMode;
  crossfadeSec: number;
  vocalCancelStrength: number;
  sleepTimer: SleepTimerState;
  error?: string;
}

export interface SleepTimerState {
  active: boolean;
  /** Epoch ms when playback should stop; null if inactive. */
  endsAt: number | null;
  /** Remaining seconds, for UI display. */
  remainingSec: number;
  /** Minutes configured; 0 = end of track. */
  configMinutes: number;
}

/* ─── EQ / audio processing ────────────────────────────────────────────── */

export interface EqBand {
  freq: number;
  gainDb: number;
  q?: number;
  type?: BiquadFilterType;
}

export interface EqPreset {
  id: string;
  name: string;
  /** true = requires rewarded-ad unlock (Ultra-HD Audiophile). */
  gated?: boolean;
  gains: number[]; // dB per band, matches EQ_BANDS order
}

export type BitrateKey = "low" | "balanced" | "hifi";
export type AudioOutputMode = "auto" | "speaker" | "headphones";

/* ─── Settings ─────────────────────────────────────────────────────────── */

export type LangKey = "en" | "es" | "ja" | "pt" | "fr";

export interface AppSettings {
  darkMode: boolean;
  language: LangKey;
  /** "noncommercial" = personal listening (CC NC allowed). "commercial" = monetized use; only providers with per-track commercial permissions pass the gate. */
  licensingMode: "noncommercial" | "commercial";
  /** Provider ids the user switched off. */
  blockedSources: ProviderId[];
  volume: number;
  muted: boolean;
  rate: number;
  shuffle: boolean;
  repeat: RepeatMode;
  crossfadeSec: number;
  gapless: boolean;
  visualizerStyle: "bars" | "wave" | "off";
  eqEnabled: boolean;
  eqPresetId: string;
  eqGains: number[];
  vocalCancel: number; // 0..1 strength
  bitrate: BitrateKey;
  autoplayRelated: boolean;
  sleepTimerMinutes: number;
  notifications: boolean;
  hapticsEnabled: boolean;
  dataSaver: boolean;
  prefetch: boolean;
}

/* ─── Music providers ─────────────────────────────────────────────────── */

export interface ProviderStatus {
  id: ProviderId;
  displayName: string;
  enabled: boolean;
  /** Why it is unavailable right now (missing key, user block, no CORS…). */
  reason?: string;
  licensingExposure: "per-track" | "catalog-level" | "none";
  licensingNotes: string;
  commercialProgramUrl?: string;
  trackCountHint?: string;
}

/* ─── Ads / monetization ───────────────────────────────────────────────── */

export type AdPlacement = "banner_home" | "rewarded_eq" | "rewarded_ai" | "interstitial_karaoke";
export type AdEventKind = "loaded" | "shown" | "clicked" | "rewarded" | "closed" | "failed";

export interface AdEvent {
  placement: AdPlacement;
  kind: AdEventKind;
  at: number;
  error?: string;
}

/* ─── Auth ─────────────────────────────────────────────────────────────── */

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarSeed: string;
  provider: "otp" | "guest";
  createdAt: number;
  lastSeenAt: number;
}

/* ─── AI terminal ──────────────────────────────────────────────────────── */

export interface AiMessage {
  id: string;
  role: "user" | "yutario";
  text: string;
  at: number;
  tracks?: Track[];
  playlistId?: string;
  commandEcho?: string;
}
