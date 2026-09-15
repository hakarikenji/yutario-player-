/**
 * Player — React bridge over the imperative audio engine. Subscribes via
 * useSyncExternalStore; exposes transport, queue, and discovery state.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { audioEngine } from "../audio/engine";
import { useLibrary } from "./library";
import type { PlaybackStatus, Track } from "../lib/types";

interface PlayerContextValue {
  status: PlaybackStatus;
  playTracks: (tracks: Track[], startIndex?: number) => void;
  playTrack: (track: Track) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (sec: number) => void;
  seekBy: (d: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setRate: (r: number) => void;
  setShuffle: (on: boolean) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setCrossfade: (s: number) => void;
  setVocalCancel: (s: number) => void;
  queue: Track[];
  upNext: Track[];
  jumpTo: (idx: number) => void;
  removeAt: (idx: number) => void;
  reorder: (from: number, to: number) => void;
  addToQueue: (t: Track, playNext?: boolean) => void;
  clearUpNext: () => void;
  startSleep: (minutes: number) => void;
  cancelSleep: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  nowPlayingOpen: boolean;
  setNowPlayingOpen: (open: boolean) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PlaybackStatus>(() => audioEngine.getStatus());
  const [queue, setQueue] = useState<Track[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const library = useLibrary();
  const libRef = useRef(library);
  libRef.current = library;

  useEffect(() => audioEngine.subscribe(() => {
    setStatus(audioEngine.getStatus());
    setQueue([...audioEngine.getQueue()]);
  }), []);

  useEffect(() => {
    audioEngine.onHistory((track, ms) => libRef.current.recordPlay(track, ms));
  }, []);

  const playTracks = useCallback((tracks: Track[], startIndex = 0) => {
    if (!tracks.length) return;
    audioEngine.setQueue(tracks, startIndex, true);
    setQueue([...tracks]);
  }, []);

  const value = useMemo<PlayerContextValue>(
    () => ({
      status,
      playTracks,
      playTrack: (t) => playTracks([t], 0),
      toggle: () => audioEngine.toggle(),
      next: () => void audioEngine.next(),
      prev: () => void audioEngine.prev(),
      seek: (s) => audioEngine.seek(s),
      seekBy: (d) => audioEngine.seekBy(d),
      setVolume: (v) => audioEngine.setVolume(v),
      toggleMute: () => audioEngine.setMuted(!audioEngine.getStatus().muted),
      setRate: (r) => audioEngine.setRate(r),
      setShuffle: (on) => audioEngine.setShuffle(on),
      toggleShuffle: () => audioEngine.setShuffle(!audioEngine.getStatus().shuffle),
      cycleRepeat: () => {
        const order: PlaybackStatus["repeat"][] = ["off", "all", "one"];
        const cur = audioEngine.getStatus().repeat;
        audioEngine.setRepeat(order[(order.indexOf(cur) + 1) % 3]);
      },
      setCrossfade: (s) => audioEngine.setCrossfade(s),
      setVocalCancel: (s) => audioEngine.setVocalCancel(s),
      queue,
      upNext: audioEngine.upNextTracks(30),
      jumpTo: (i) => audioEngine.jumpToQueueIndex(i),
      removeAt: (i) => audioEngine.removeFromQueue(i),
      reorder: (from, to) => audioEngine.reorderQueue(from, to),
      addToQueue: (t, playNext) => audioEngine.addToQueue(t, playNext),
      clearUpNext: () => audioEngine.clearUpNext(),
      startSleep: (m) => audioEngine.startSleepTimer(m),
      cancelSleep: () => audioEngine.cancelSleepTimer(),
      searchQuery,
      setSearchQuery,
      nowPlayingOpen,
      setNowPlayingOpen,
    }),
    [status, queue, searchQuery, nowPlayingOpen, playTracks]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
