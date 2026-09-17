/**
 * Home — Yutario Player brand header, My Device card, YOUR PLAYLISTS
 * editor (create-tile grid), and the FOR YOU row list (recent-first,
 * padded with live catalog). Search & moods live in the Discover tab.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronRight, Plus, ListMusic, Clock, Smartphone, Trash2, Heart, Loader2, Music4, WifiOff,
  FolderOpen, BellRing,
} from "lucide-react";
import { cn, formatTime } from "../lib/utils";
import { music } from "../lib/music";
import { getDemoTracks, isOfflineLikely } from "../lib/demo";
import { t } from "../lib/i18n";
import { usePlayer } from "../state/player";
import { useSettings } from "../state/settings";
import { useLibrary } from "../state/library";
import { PageContainer, HomeBannerAd } from "../ui/layout";
import { Artwork } from "../ui/shared";
import { Sheet, Button, useToast } from "../ui/primitives";
import { requestNotificationPermission } from "../lib/nativePermissions";
import type { Track } from "../lib/types";

export function HomePage({ onOpenDevice }: { onOpenDevice?: () => void }) {
  const player = usePlayer();
  const { settings } = useSettings();
  const library = useLibrary();
  const toast = useToast();

  const [trending, setTrending] = useState<Track[]>([]);
  const [newPlOpen, setNewPlOpen] = useState(false);
  const [newPlName, setNewPlName] = useState("");
  const offline = useMemo(() => isOfflineLikely(), []);

  /* Warm the FOR YOU pad with live catalog (silent failure → demo vault). */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await music.trending({ limit: 14, bitrate: settings.bitrate });
        if (!cancelled && r.length) setTrending(r);
      } catch {
        if (!cancelled) setTrending(getDemoTracks());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.bitrate]);

  /* FOR YOU — recently played first, padded with trending. */
  const forYou = useMemo(() => {
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const h of library.history) {
      if (!seen.has(h.track.id)) {
        seen.add(h.track.id);
        out.push(h.track);
      }
    }
    for (const tr of trending) {
      if (out.length >= 12) break;
      if (!seen.has(tr.id)) {
        seen.add(tr.id);
        out.push(tr);
      }
    }
    if (!out.length) return getDemoTracks().slice(0, 10);
    return out.slice(0, 12);
  }, [library.history, trending]);

  const playForYou = (index: number) => {
    player.setShuffle(false);
    player.playTracks(forYou, index);
  };

  /* Connect the app to the phone's music files: ask for the audio permission
   * (Android 13+ READ_MEDIA_AUDIO prompt), then scan the whole MediaStore
   * music index in one tap — no folder picking. Web falls back to pickers. */
  const connectPhoneFiles = async () => {
    try {
      const ok = await library.indexDeviceAudio();
      if (!ok) {
        toast("Audio access denied — allow it in the prompt or system settings", "error");
        return;
      }
      if (!library.localTracks.length) {
        toast("No music files found on this phone", "info");
      } else {
        toast(`Connected — ${library.localTracks.length} phone tracks ready`, "success");
      }
    } catch {
      /* user cancelled */
    }
  };

  /* One-tap media-notification setup so lock-screen controls & background
   * audio keep working (native POST_NOTIFICATIONS prompt on Android 13+). */
  const enableNotifications = async () => {
    const granted = await requestNotificationPermission();
    toast(
      granted ? "Notifications on — media controls active" : "Notifications blocked in system settings",
      granted ? "success" : "error"
    );
  };

  const createPlaylist = () => {
    const name = newPlName.trim();
    if (!name) return;
    library.createPlaylist(name);
    setNewPlName("");
    setNewPlOpen(false);
    toast("Playlist created", "success");
  };

  return (
    <PageContainer>
      {/* Brand header */}
      <header className="px-1 pb-4 pt-5">
        <h1 className="text-[28px] font-black leading-tight tracking-tight">
          <span className="text-aura-400">Yutario</span> <span className="text-white">Player</span>
        </h1>
        <p className="mt-0.5 text-[15px] font-medium text-silver">{t("home_recent")}</p>
      </header>

      {offline && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-aura-500/25 bg-aura-500/10 px-3.5 py-2.5 text-xs text-aura-200">
          <WifiOff size={14} className="shrink-0" />
          Offline mode — streaming the Hakari Studio demo vault.
        </div>
      )}

      {/* My Device card */}
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={onOpenDevice}
        className="group relative mb-7 flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-aura-500/15 bg-gradient-to-r from-aura-900/45 via-ink-200/80 to-ink-200/60 px-4 py-4 text-left transition-all duration-200 hover:border-aura-500/30 active:scale-[0.985]"
      >
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-aura-500 to-aura-800 shadow-aura-sm">
          <Smartphone size={24} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold text-white">My Device</p>
          <p className="truncate text-[13px] text-silver">{t("home_device_sub")}</p>
          {library.localTracks.length > 0 && (
            <p className="mt-0.5 text-[11px] font-semibold text-aura-300">
              {library.localTracks.length} tracks indexed · 100% offline
            </p>
          )}
        </div>
        <ChevronRight size={20} className="shrink-0 text-silver transition-transform group-active:translate-x-0.5" />
      </motion.button>

      {/* Device connect actions — the primary way to pair the app with the
          phone's own files, plus one-tap media-notification setup. */}
      <div className="mb-7 grid grid-cols-2 gap-2.5">
        <button
          onClick={() => void connectPhoneFiles()}
          disabled={library.indexing}
          className="flex items-center justify-center gap-2 rounded-2xl bg-aura-btn px-4 py-3.5 text-[14px] font-bold text-white shadow-cta transition-all hover:shadow-cta-lg active:scale-[0.97] disabled:opacity-50"
        >
          {library.indexing ? <Loader2 size={16} className="animate-spin" /> : <FolderOpen size={16} />}
          {library.localTracks.length ? "Scan More Files" : "Connect Phone Files"}
        </button>
        <button
          onClick={() => void enableNotifications()}
          className="flex items-center justify-center gap-2 rounded-2xl border border-aura-500/25 bg-aura-500/[0.08] px-4 py-3.5 text-[14px] font-bold text-aura-200 transition-all hover:border-aura-500/45 hover:bg-aura-500/[0.14] active:scale-[0.97]"
        >
          <BellRing size={16} />
          Enable Notifications
        </button>
      </div>

      {/* YOUR PLAYLISTS */}
      <section className="mb-7">
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="flex items-center gap-2 text-[13px] font-black uppercase tracking-[0.14em] text-silver">
            <ListMusic size={15} className="text-silver" />
            {t("section_playlists")}
          </p>
          <button
            onClick={() => setNewPlOpen(true)}
            className="flex items-center gap-1 text-[14px] font-bold text-aura-400 transition-colors hover:text-aura-300 active:scale-95"
          >
            <Plus size={15} /> New
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {/* Create tile */}
          <button
            onClick={() => setNewPlOpen(true)}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-2 py-3 transition-colors hover:border-aura-500/40 hover:bg-aura-500/[0.06] active:scale-[0.97]"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.07]">
              <Plus size={20} className="text-white" />
            </span>
            <span className="text-[12px] font-bold leading-tight text-white">Create Playlist</span>
            <span className="text-[10px] text-silver-dim">Tap to start</span>
          </button>

          {library.playlists.map((pl) => (
            <div key={pl.id} className="group relative">
              <button
                onClick={() => {
                  if (pl.tracks.length) {
                    player.setShuffle(false);
                    player.playTracks(pl.tracks, 0);
                  } else {
                    toast("Playlist is empty — add songs from Discover", "info");
                  }
                }}
                className="flex aspect-square w-full flex-col rounded-2xl bg-white/[0.04] p-2.5 text-left transition-all hover:bg-white/[0.07] active:scale-[0.97]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-aura-600 to-aura-900 shadow-aura-sm">
                  <Music4 size={18} className="text-white" />
                </span>
                <span className="mt-auto line-clamp-2 text-[12px] font-bold leading-tight text-white">{pl.name}</span>
                <span className="text-[10px] text-silver-dim">{pl.tracks.length} tracks</span>
              </button>
              <button
                onClick={() => {
                  library.deletePlaylist(pl.id);
                  toast("Playlist deleted");
                }}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/40 p-1 text-silver-dim opacity-0 backdrop-blur transition-opacity hover:text-red-300 group-hover:opacity-100"
                aria-label={`Delete ${pl.name}`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* FOR YOU */}
      {forYou.length > 0 && (
        <section className="mb-4">
          <div className="mb-3 flex items-center justify-between px-1">
            <p className="flex items-center gap-2 text-[13px] font-black uppercase tracking-[0.14em] text-silver">
              <Clock size={15} className="text-silver" />
              {t("section_foryou")}
            </p>
            <button
              onClick={() => playForYou(0)}
              className="text-[14px] font-bold text-aura-400 transition-colors hover:text-aura-300 active:scale-95"
            >
              {t("play_all")}
            </button>
          </div>

          <div className="space-y-2">
            {forYou.map((track, i) => {
              const active = player.status.track?.id === track.id;
              const fav = library.isFavorite(track.id);
              return (
                <motion.div
                  key={`${track.id}_${i}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors",
                    i === 0
                      ? "border border-aura-500/25 bg-gradient-to-r from-aura-900/35 via-ink-200/70 to-ink-200/40"
                      : "hover:bg-white/[0.04]",
                    active && !i && "shadow-aura-sm"
                  )}
                >
                  <button onClick={() => playForYou(i)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Artwork
                      src={track.artwork}
                      alt={track.title}
                      size={52}
                      rounded="rounded-xl"
                      className={cn("shrink-0", active && "ring-2 ring-aura-500/50")}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-[16px] font-bold", active || i === 0 ? "text-aura-300" : "text-white")}>
                        {track.title}
                      </p>
                      <p className="truncate text-[13px] text-silver">{track.artist}</p>
                    </div>
                  </button>
                  <span className="shrink-0 text-[13px] tabular-nums text-silver">{formatTime(track.duration)}</span>
                  <button
                    onClick={() => library.toggleFavorite(track.id)}
                    className="shrink-0 rounded-full p-1.5 transition-transform active:scale-90"
                    aria-label={fav ? "Unfavorite" : "Favorite"}
                  >
                    <Heart size={19} className={fav ? "fill-aura-500 text-aura-500" : "text-silver"} />
                  </button>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {library.indexing && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-aura-500/20 bg-aura-500/5 px-4 py-3.5">
          <Loader2 size={18} className="animate-spin text-aura-400" />
          <p className="text-sm font-semibold text-white">
            Scanning device audio… {library.indexProgress.done}/{library.indexProgress.total}
          </p>
        </div>
      )}

      <HomeBannerAd />

      {/* New playlist sheet */}
      <Sheet open={newPlOpen} onClose={() => setNewPlOpen(false)} title="Create Playlist">
        <div className="space-y-3">
          <input
            autoFocus
            value={newPlName}
            onChange={(e) => setNewPlName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createPlaylist()}
            placeholder="Playlist name…"
            className="h-14 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-[15px] font-semibold text-white placeholder:text-silver-dim focus:border-aura-500/50 focus:outline-none focus:ring-2 focus:ring-aura-500/20"
          />
          <Button className="w-full" size="lg" onClick={createPlaylist} disabled={!newPlName.trim()}>
            <Plus size={17} /> Create Playlist
          </Button>
        </div>
      </Sheet>
    </PageContainer>
  );
}
