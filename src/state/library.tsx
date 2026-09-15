/**
 * Library — local audio indexing (File System Access API with <input>
 * fallback), user playlists, favorites, play history, and native share.
 * A persisted track registry keeps favorited/recent Jamendo tracks
 * resolvable across sessions (rehydrated on demand from the network).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Album, Artist, BitrateKey, LocalFolderHandle, Playlist, Track } from "../lib/types";
import { storageGet, storageSet } from "../lib/storage";
import { readAudioMetadata, fileToTrack, probeDuration } from "../lib/id3";
import { music } from "../lib/music";
import { uid } from "../lib/utils";

const PLAYLISTS_KEY = "playlists";
const FAVS_KEY = "favorites";
const HISTORY_KEY = "history";
const REGISTRY_KEY = "track_registry";

interface LibraryContextValue {
  localTracks: Track[];
  indexing: boolean;
  indexProgress: { done: number; total: number };
  localFolder: LocalFolderHandle | null;
  pickLocalFolder: () => Promise<void>;
  clearLocal: () => void;

  playlists: Playlist[];
  createPlaylist: (name: string, description?: string) => Playlist;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  addToPlaylist: (playlistId: string, track: Track) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;
  getPlaylist: (id: string) => Playlist | undefined;

  favorites: string[];
  toggleFavorite: (trackId: string) => void;
  isFavorite: (trackId: string) => boolean;

  history: { track: Track; playedAt: number; msPlayed: number }[];
  recordPlay: (track: Track, msPlayed: number) => void;
  clearHistory: () => void;

  localAlbums: Album[];
  localArtists: Artist[];
  findLocalByAlbum: (album: string) => Track[];
  findLocalByArtist: (artist: string) => Track[];
  shareTrack: (track: Track) => Promise<void>;

  /** Remember track objects so favorites/history resolve across sessions. */
  rememberTracks: (tracks: Track[]) => void;
  /** Favorites resolved to playable track objects when possible. */
  favoriteTracks: Track[];
  /** Aligns the rehydration resolver with the current bitrate setting. */
  setBitrate: (b: BitrateKey) => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

const AUDIO_RE = /\.(mp3|m4a|mp4|aac|wav|ogg|flac)$/i;

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState({ done: 0, total: 0 });
  const [localFolder, setLocalFolder] = useState<LocalFolderHandle | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>(() => storageGet<Playlist[]>(PLAYLISTS_KEY, []));
  const [favorites, setFavorites] = useState<string[]>(() => storageGet<string[]>(FAVS_KEY, []));
  const [history, setHistory] = useState<{ track: Track; playedAt: number; msPlayed: number }[]>(() =>
    storageGet<{ track: Track; playedAt: number; msPlayed: number }[]>(HISTORY_KEY, [])
  );
  const urlRegistry = useRef<Set<string>>(new Set());
  const bitrateRef = useRef<BitrateKey>("balanced");

  /* ── cross-session track registry ──
   * Favorites/history store only ids; the registry persists lightweight
   * track metadata so lists rebuild on load, and Jamendo favorites are
   * rehydrated with fresh stream URLs when missing.
   */
  const registryRef = useRef<Map<string, Track>>(new Map(storageGet<[string, Track][]>(REGISTRY_KEY, [])));
  const [registryVersion, setRegistryVersion] = useState(0);

  const registryPut = useCallback((track: Track) => {
    const reg = registryRef.current;
    if (reg.has(track.id)) return;
    reg.set(track.id, track);
    try {
      storageSet(REGISTRY_KEY, [...reg.values()].slice(-240));
    } catch {
      /* quota — drop silently */
    }
    setRegistryVersion((v) => v + 1);
  }, []);

  const rememberTracks = useCallback(
    (tracks: Track[]) => {
      const reg = registryRef.current;
      let changed = false;
      for (const tr of tracks) {
        if (!reg.has(tr.id)) {
          reg.set(tr.id, tr);
          changed = true;
        }
      }
      if (!changed) return;
      try {
        storageSet(REGISTRY_KEY, [...reg.values()].slice(-240));
      } catch {
        /* quota — drop silently */
      }
      setRegistryVersion((v) => v + 1);
    },
    []
  );

  /* Rehydrate Jamendo favorites missing from the registry (fresh stream URL). */
  useEffect(() => {
    const missing = favorites.filter((id) => id.startsWith("jm_") && !registryRef.current.has(id));
    if (!missing.length) return;
    let cancelled = false;
    void Promise.all(
      missing.slice(0, 40).map((id) => music.trackById(id, bitrateRef.current).catch(() => []))
    ).then((batches) => {
      if (cancelled) return;
      for (const batch of batches) for (const tr of batch) registryPut(tr);
    });
    return () => {
      cancelled = true;
    };
  }, [favorites, registryPut]);

  useEffect(() => storageSet(PLAYLISTS_KEY, playlists), [playlists]);
  useEffect(() => storageSet(FAVS_KEY, favorites), [favorites]);
  useEffect(() => storageSet(HISTORY_KEY, history.slice(0, 100)), [history]);

  /* ── local indexing ── */

  const indexFiles = useCallback(async (files: File[], folderName: string, kind: LocalFolderHandle["kind"]) => {
    const audio = files.filter((f) => AUDIO_RE.test(f.name));
    if (!audio.length) {
      setLocalFolder({ name: folderName, kind });
      setIndexing(false);
      return;
    }
    setIndexing(true);
    setIndexProgress({ done: 0, total: audio.length });
    const tracks: Track[] = [];
    let done = 0;
    for (const file of audio) {
      try {
        const meta = await readAudioMetadata(file);
        const track = await fileToTrack(file, meta);
        if (!track.duration) track.duration = await probeDuration(track.url);
        tracks.push(track);
        urlRegistry.current.add(track.url);
      } catch {
        /* skip unreadable file */
      }
      done++;
      setIndexProgress({ done, total: audio.length });
    }
    tracks.sort((a, b) => a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album) || a.title.localeCompare(b.title));
    setLocalTracks((prev) => [...prev, ...tracks.filter((t) => !prev.some((p) => p.fileName === t.fileName))]);
    setLocalFolder({ name: folderName, kind });
    setIndexing(false);
  }, []);

  const pickLocalFolder = useCallback(async () => {
    const w = window as unknown as {
      showDirectoryPicker?: (opts?: { mode?: "read" }) => Promise<FileSystemDirectoryHandle>;
    };
    if (w.showDirectoryPicker) {
      try {
        const dir = await w.showDirectoryPicker({ mode: "read" });
        const files: File[] = [];
        const walk = async (handle: FileSystemDirectoryHandle, depth: number): Promise<void> => {
          if (depth > 3) return;
          for await (const entry of (handle as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
            if (entry.kind === "file") {
              const f = await (entry as FileSystemFileHandle).getFile();
              if (AUDIO_RE.test(f.name)) files.push(f);
            } else if (entry.kind === "directory") {
              await walk(entry as FileSystemDirectoryHandle, depth + 1);
            }
          }
        };
        await walk(dir, 0);
        await indexFiles(files, dir.name, "fs-access");
      } catch {
        /* user cancelled */
      }
      return;
    }
    // Fallback: multiple-file input.
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac";
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      await indexFiles(files, "Selected Files", "input");
    };
    input.click();
  }, [indexFiles]);

  const clearLocal = useCallback(() => {
    urlRegistry.current.forEach((u) => URL.revokeObjectURL(u));
    urlRegistry.current.clear();
    setLocalTracks([]);
    setLocalFolder(null);
  }, []);

  /* ── playlists ── */

  const createPlaylist = useCallback((name: string, description?: string): Playlist => {
    const pl: Playlist = {
      id: uid("pl"),
      name: name.trim() || "New Playlist",
      description,
      tracks: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setPlaylists((prev) => [pl, ...prev]);
    return pl;
  }, []);

  const deletePlaylist = useCallback((id: string) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const renamePlaylist = useCallback((id: string, name: string) => {
    setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, name, updatedAt: Date.now() } : p)));
  }, []);

  const addToPlaylist = useCallback((playlistId: string, track: Track) => {
    setPlaylists((prev) =>
      prev.map((p) =>
        p.id === playlistId && !p.tracks.some((t) => t.id === track.id)
          ? { ...p, tracks: [...p.tracks, track], updatedAt: Date.now() }
          : p
      )
    );
  }, []);

  const removeFromPlaylist = useCallback((playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((p) => (p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId), updatedAt: Date.now() } : p))
    );
  }, []);

  const getPlaylist = useCallback((id: string) => playlists.find((p) => p.id === id), [playlists]);

  /* ── favorites & history ── */

  const toggleFavorite = useCallback((trackId: string) => {
    setFavorites((prev) => (prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [trackId, ...prev]));
  }, []);

  const isFavorite = useCallback((trackId: string) => favorites.includes(trackId), [favorites]);

  const recordPlay = useCallback(
    (track: Track, msPlayed: number) => {
      registryPut(track);
      setHistory((prev) => [{ track, playedAt: Date.now(), msPlayed }, ...prev.filter((h) => h.track.id !== track.id)].slice(0, 100));
    },
    [registryPut]
  );

  const clearHistory = useCallback(() => setHistory([]), []);

  /* ── derived matrices ── */

  const localAlbums = useMemo<Album[]>(() => {
    const map = new Map<string, Album>();
    for (const t of localTracks) {
      const key = `${t.artist}::${t.album}`;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          title: t.album || "Unknown Album",
          artist: t.artist,
          artwork: t.artwork,
          trackCount: 0,
          source: "local",
        });
      }
      const a = map.get(key)!;
      a.trackCount = (a.trackCount ?? 0) + 1;
      if (!a.artwork && t.artwork) a.artwork = t.artwork;
    }
    return [...map.values()].sort((x, y) => x.artist.localeCompare(y.artist));
  }, [localTracks]);

  const localArtists = useMemo<Artist[]>(() => {
    const map = new Map<string, Artist>();
    for (const t of localTracks) {
      if (!map.has(t.artist)) {
        map.set(t.artist, { id: t.artist, name: t.artist, image: t.artwork, source: "local" });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [localTracks]);

  const findLocalByAlbum = useCallback((album: string) => localTracks.filter((t) => t.album === album), [localTracks]);
  const findLocalByArtist = useCallback((artist: string) => localTracks.filter((t) => t.artist === artist), [localTracks]);

  const setBitrate = useCallback((b: BitrateKey) => {
    bitrateRef.current = b;
  }, []);

  const favoriteTracks = useMemo<Track[]>(() => {
    void registryVersion;
    const out: Track[] = [];
    for (const id of favorites) {
      const resolved = localTracks.find((t) => t.id === id) ?? registryRef.current.get(id);
      if (resolved) out.push(resolved);
    }
    return out;
  }, [favorites, localTracks, registryVersion]);

  const shareTrack = useCallback(async (track: Track) => {
    const text = `${track.title} — ${track.artist} · via Yutario Player`;
    const url =
      track.pageUrl ??
      (track.source === "jamendo"
        ? `https://www.jamendo.com/track/${track.id.replace("jm_", "")}`
        : location.href);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Yutario Player", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
    } catch {
      /* user cancelled share */
    }
  }, []);

  const value = useMemo<LibraryContextValue>(
    () => ({
      localTracks,
      indexing,
      indexProgress,
      localFolder,
      pickLocalFolder,
      clearLocal,
      playlists,
      createPlaylist,
      deletePlaylist,
      renamePlaylist,
      addToPlaylist,
      removeFromPlaylist,
      getPlaylist,
      favorites,
      toggleFavorite,
      isFavorite,
      history,
      recordPlay,
      clearHistory,
      localAlbums,
      localArtists,
      findLocalByAlbum,
      findLocalByArtist,
      shareTrack,
      rememberTracks,
      favoriteTracks,
      setBitrate,
    }),
    [
      localTracks, indexing, indexProgress, localFolder, pickLocalFolder, clearLocal,
      playlists, createPlaylist, deletePlaylist, renamePlaylist, addToPlaylist, removeFromPlaylist, getPlaylist,
      favorites, toggleFavorite, isFavorite, history, recordPlay, clearHistory,
      localAlbums, localArtists, findLocalByAlbum, findLocalByArtist, shareTrack,
      rememberTracks, favoriteTracks, setBitrate,
    ]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within LibraryProvider");
  return ctx;
}
