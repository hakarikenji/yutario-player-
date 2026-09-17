/**
 * Now Playing — full-screen immersive player matching the Yutario design:
 * Queue + Gapless header chips, concentric aura-ring artwork, live
 * visualizer, Lyrics / Go to Radio / Karaoke pills, gradient transport,
 * and the heart / volume / speed / sleep utility row. Keeps the queue,
 * EQ, and Playback Lab sheets with rewarded gating.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown, Heart, ListMusic, Gauge, MoonStar, Repeat, Repeat1, Shuffle,
  SkipBack, SkipForward, Play, Pause, Mic2, Sliders, Volume2, VolumeX, Radio,
  X, FileMusic, ChevronRight, ShieldCheck,
} from "lucide-react";
import { cn, formatTime } from "../lib/utils";
import { t, useT } from "../lib/i18n";
import { usePlayer } from "../state/player";
import { useSettings } from "../state/settings";
import { useLibrary } from "../state/library";
import { useAds } from "../state/ads";
import { useToast } from "./primitives";
import { Artwork, SeekBar, VolumeSlider, EmptyState } from "./shared";
import { Visualizer } from "./visualizer";
import { Button, Chip, IconButton, Sheet } from "./primitives";
import { useBackClose } from "../hooks/useBackClose";
import { DetailSheet, type DetailState, type DetailActions } from "./DetailSheets";
import { EQ_PRESETS, RATES, SLEEP_MINUTES } from "../lib/constants";
import { music } from "../lib/music";
import { synthLyrics, activeLyricIndex } from "../lib/lrc";
import type { LrcLine, Track } from "../lib/types";

export function NowPlaying({ open, onClose, onKaraoke }: { open: boolean; onClose: () => void; onKaraoke: () => void }) {
  useT(); // re-render on language change
  const player = usePlayer();
  const { settings, update, setEqBand, applyPreset, setEqEnabled } = useSettings();
  const library = useLibrary();
  const ads = useAds();
  const toast = useToast();

  const [sheet, setSheet] = useState<"queue" | "eq" | "more" | "sleep" | "lyrics" | "license" | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [radioOn, setRadioOn] = useState(false);
  const status = player.status;
  const track = status.track;

  const isFavorite = track ? library.isFavorite(track.id) : false;

  // Hardware back closes the full-screen player (sheets register themselves).
  useBackClose(!!open, "now-playing", onClose);

  /* Reset ephemeral views when the player closes. */
  useEffect(() => {
    if (!open) {
      setSheet(null);
      setRadioOn(false);
    }
  }, [open]);

  const openArtist = (tr: Track) =>
    setDetail({ kind: "artist", id: tr.artistId ?? "", name: tr.artist, artwork: tr.artwork, seed: tr });

  const detailActions = useMemo<DetailActions>(
    () => ({
      onFavorite: (tr) => library.toggleFavorite(tr.id),
      favorite: (tr) => library.isFavorite(tr.id),
      onQueue: (tr) => {
        player.addToQueue(tr);
        toast("Added to queue", "success");
      },
      onShare: (tr) => void library.shareTrack(tr),
      onOpenArtist: openArtist,
      onOpenAlbum: (tr) =>
        setDetail({ kind: "album", id: tr.albumId ?? "", name: tr.album || "Unknown Album", artwork: tr.artwork, seed: tr }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [library.toggleFavorite, library.isFavorite, player.addToQueue, library.shareTrack]
  );

  /* Radio: append similar tracks after the current one (playback continues). */
  const startRadio = async () => {
    if (!track) return;
    setRadioOn(true);
    try {
      const seedGenre = track.genres?.[0];
      const similar = seedGenre
        ? await music.freeTextSearch(seedGenre, { bitrate: settings.bitrate, limit: 15 })
        : await music.trending({ bitrate: settings.bitrate, limit: 15 });
      const fresh = similar.filter((s) => !player.queue.some((q) => q.id === s.id)).slice(0, 12);
      if (fresh.length) {
        fresh.forEach((s) => player.addToQueue(s));
        toast(`Radio on — ${fresh.length} tracks added`, "success");
      } else {
        toast("Radio is already full", "info");
      }
    } catch {
      toast("Radio needs a connection — offline vault queued instead", "info");
    }
  };

  const cycleRate = () => {
    const idx = RATES.findIndex((r) => r === settings.rate);
    const nextRate = RATES[(idx + 1) % RATES.length] ?? 1;
    update("rate", nextRate);
    player.setRate(nextRate);
  };

  const rateLabel = `${settings.rate}x`;

  return (
    <AnimatePresence>
      {open && track && (
        <motion.div
          className="fixed inset-0 z-[70] flex flex-col bg-ink"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 32, stiffness: 300 }}
        >
          {/* Blurred artwork backdrop */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {track.artwork && (
              <img src={track.artwork} alt="" className="h-full w-full scale-125 object-cover opacity-20 blur-3xl" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-ink/60 via-ink/40 to-ink" />
            <div className="absolute inset-x-0 top-0 h-72 bg-aura-radial opacity-70" />
          </div>

          {/* Header — close · Queue chip · Gapless chip */}
          <div className="relative z-10 flex items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),14px)]">
            <IconButton onClick={onClose} aria-label="Close player">
              <ChevronDown size={24} />
            </IconButton>
            <div className="flex flex-1 items-center justify-center gap-2.5">
              <button
                onClick={() => setSheet("queue")}
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/[0.09] active:scale-95"
              >
                <ListMusic size={14} className="text-aura-300" />
                {t("queue")}
                {player.queue.length > 0 && (
                  <span className="rounded-full bg-aura-600 px-1.5 text-[10px] font-black leading-4 text-white">
                    {player.queue.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  const on = !settings.gapless;
                  update("gapless", on);
                  toast(on ? "Gapless hand-off on" : "Gapless off", on ? "success" : "info");
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-all active:scale-95",
                  settings.gapless
                    ? "border-aura-500/40 bg-aura-500/15 text-aura-200"
                    : "border-white/10 bg-white/[0.05] text-silver hover:text-white"
                )}
              >
                <Gauge size={13} />
                Gapless
              </button>
            </div>
            <div className="w-10" />
          </div>

          {/* Body */}
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 no-scrollbar">
            {/* Artwork: concentric aura rings when bare, glowing disc when art exists */}
            <motion.div
              className="relative my-5"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.18}
              onDragEnd={(_, info) => {
                if (info.offset.x > 80) player.next();
                if (info.offset.x < -80) player.prev();
              }}
            >
              {track.artwork ? (
                <div className="relative">
                  <div className="absolute -inset-3 rounded-full bg-gradient-to-tr from-blue-600/50 via-indigo-500/40 to-aura-500/50 blur-xl animate-pulse-aura" />
                  <div className={cn("relative", status.state === "playing" && "animate-spin-slow")}>
                    <Artwork
                      src={track.artwork}
                      alt={track.title}
                      size={270}
                      rounded="rounded-full"
                      className="border-4 border-aura-500/30 shadow-aura-lg"
                    />
                  </div>
                </div>
              ) : (
                <div className={cn("relative h-[270px] w-[270px]", status.state === "playing" && "animate-spin-slow")}>
                  <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-blue-500 via-indigo-500 to-purple-500 p-[14px] shadow-aura-lg">
                    <div className="h-full w-full rounded-full bg-ink-300 p-[26px]">
                      <div className="h-full w-full rounded-full bg-gradient-to-tr from-purple-700 via-indigo-600 to-blue-500 p-[30px]">
                        <div className="flex h-full w-full items-center justify-center rounded-full bg-ink-400">
                          <FileMusic size={40} className="text-aura-300" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Visualizer */}
            {settings.visualizerStyle !== "off" && (
              <Visualizer mode={settings.visualizerStyle === "wave" ? "wave" : "bars"} className="h-12 w-full max-w-[300px]" />
            )}

            {/* Feature pills */}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2.5">
              <button
                onClick={() => setSheet("lyrics")}
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/[0.09] active:scale-95"
              >
                <Mic2 size={14} className="text-silver" /> {t("lyrics")}
              </button>
              <button
                onClick={() => void startRadio()}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-semibold transition-all active:scale-95",
                  radioOn
                    ? "border-aura-500/40 bg-aura-500/15 text-aura-200"
                    : "border-aura-500/25 bg-aura-500/[0.07] text-aura-300 hover:bg-aura-500/15"
                )}
              >
                <Radio size={14} />
                {radioOn ? "Radio On" : "Go to Radio"}
              </button>
              <button
                onClick={onKaraoke}
                className="flex items-center gap-1.5 rounded-full border border-fuchsia-500/25 bg-fuchsia-500/[0.08] px-4 py-2 text-[13px] font-semibold text-fuchsia-300 transition-colors hover:bg-fuchsia-500/15 active:scale-95"
              >
                <Mic2 size={14} /> Karaoke
              </button>
              {track.license && (
                <button
                  onClick={() => setSheet("license")}
                  className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.07] px-4 py-2 text-[13px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/15 active:scale-95"
                >
                  <ShieldCheck size={14} /> {track.license.label}
                </button>
              )}
            </div>

            {/* Title / meta */}
            <div className="mt-4 w-full max-w-sm text-center">
              <h2 className="truncate text-[26px] font-black tracking-tight text-white">{track.title}</h2>
              <button
                onClick={() => openArtist(track)}
                className="mt-1 max-w-full truncate text-[17px] font-medium text-silver transition-colors hover:text-aura-300"
              >
                {track.artist}
              </button>
              {track.album && <p className="mt-0.5 truncate text-[13px] text-silver-dim">{track.album}</p>}
            </div>

            {/* Seek + transport */}
            <div className="mb-4 mt-3 w-full max-w-sm">
              <SeekBar position={status.positionSec} duration={status.durationSec} buffered={status.bufferedSec} onSeek={player.seek} />
              <div className="mt-4 flex items-center justify-between">
                <IconButton active={status.shuffle} onClick={player.toggleShuffle} aria-label="Shuffle">
                  <Shuffle size={20} />
                </IconButton>
                <IconButton onClick={player.prev} aria-label="Previous">
                  <SkipBack size={26} />
                </IconButton>
                <button
                  onClick={player.toggle}
                  className="flex h-[74px] w-[74px] items-center justify-center rounded-full bg-gradient-to-br from-aura-400 via-aura-600 to-aura-800 text-white shadow-aura transition-transform active:scale-95"
                  aria-label={status.state === "playing" ? "Pause" : "Play"}
                >
                  {status.state === "loading" ? (
                    <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : status.state === "playing" ? (
                    <Pause size={30} />
                  ) : (
                    <Play size={30} className="ml-1" />
                  )}
                </button>
                <IconButton onClick={player.next} aria-label="Next">
                  <SkipForward size={26} />
                </IconButton>
                <IconButton
                  active={status.repeat !== "off"}
                  onClick={player.cycleRepeat}
                  aria-label={`Repeat: ${status.repeat}`}
                >
                  {status.repeat === "one" ? <Repeat1 size={20} /> : <Repeat size={20} />}
                </IconButton>
              </div>

              {status.error && <p className="mt-2 text-center text-xs text-red-300">{status.error}</p>}
            </div>
          </div>

          {/* Bottom utility row — heart · volume · speed · sleep */}
          <div className="relative z-10 border-t border-white/[0.05] bg-ink/60 px-5 pb-[max(env(safe-area-inset-bottom),14px)] pt-3 backdrop-blur-xl">
            <div className="mx-auto flex max-w-md items-center justify-between gap-3">
              <IconButton
                active={isFavorite}
                onClick={() => library.toggleFavorite(track.id)}
                aria-label="Favorite"
                className="h-10 w-10"
              >
                <Heart size={22} className={isFavorite ? "fill-aura-500 text-aura-500" : ""} />
              </IconButton>

              <div className="flex min-w-0 flex-1 items-center gap-2">
                <IconButton onClick={() => player.toggleMute()} aria-label="Mute" className="h-8 w-8 shrink-0">
                  {status.muted || status.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </IconButton>
                <VolumeSlider value={status.muted ? 0 : status.volume} onChange={(v) => player.setVolume(v)} />
              </div>

              <button
                onClick={cycleRate}
                className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[14px] font-bold text-white transition-transform active:scale-95"
                aria-label={`Playback speed: ${rateLabel}`}
              >
                <Gauge size={15} className="text-silver" />
                {rateLabel}
              </button>
              <button
                onClick={() => setSheet("sleep")}
                className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[14px] font-semibold text-white transition-transform active:scale-95"
              >
                <MoonStar size={15} className={status.sleepTimer.active ? "text-aura-400" : "text-silver"} />
                Sleep
              </button>
            </div>
          </div>

          {/* Sheets */}
          <QueueSheet open={sheet === "queue"} onClose={() => setSheet(null)} />
          <LyricsSheet open={sheet === "lyrics"} onClose={() => setSheet(null)} track={track} />
          <SleepSheet open={sheet === "sleep"} onClose={() => setSheet(null)} />
          <LicenseSheet open={sheet === "license"} onClose={() => setSheet(null)} track={track} />
          <EqSheet
            open={sheet === "eq"}
            onClose={() => setSheet(null)}
            eqEnabled={settings.eqEnabled}
            onToggleEq={(on) => setEqEnabled(on)}
            gains={settings.eqGains}
            presetId={settings.eqPresetId}
            onBand={(i, g) => setEqBand(i, g)}
            onPreset={(id) => {
              const p = EQ_PRESETS.find((x) => x.id === id);
              if (p?.gated && !ads.unlocks.ultraHdEq) {
                ads.showRewarded("rewarded_eq", () => {
                  applyPreset(id);
                  toast("Ultra-HD Audiophile unlocked", "success");
                });
                return;
              }
              applyPreset(id);
              toast(`${p?.name ?? "Preset"} applied`, "success");
            }}
            vocalCancel={settings.vocalCancel}
            onVocalCancel={(v) => update("vocalCancel", v)}
          />
          <MoreSheet open={sheet === "more"} onClose={() => setSheet(null)} />
          <DetailSheet detail={detail} onClose={() => setDetail(null)} actions={detailActions} elevated />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Lyrics sheet — tap-to-seek, auto-follow ──────────────────────────── */

function LyricsSheet({ open, onClose, track }: { open: boolean; onClose: () => void; track: Track }) {
  const player = usePlayer();
  const [lines, setLines] = useState<LrcLine[] | null>(null);
  const [pos, setPos] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !track) return;
    let cancelled = false;
    setLines(null);
    void (async () => {
      try {
        if (track.lyrics?.length) {
          if (!cancelled) setLines(track.lyrics);
          return;
        }
        if (track.source === "jamendo") {
          const res = await music.lyrics(track.id);
          const text = res?.lyrics ?? "";
          if (cancelled) return;
          if (text.trim()) {
            const parsed = synthLinesFromPlain(text, track.duration || 200);
            setLines(parsed);
            return;
          }
        }
        setLines(synthLyrics(track.duration || 200, track.id.length));
      } catch {
        if (!cancelled) setLines(synthLyrics(track.duration || 200, track.id.length));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, track]);

  /* Smooth clock */
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const tick = () => {
      setPos(player.status.positionSec * 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, player]);

  const activeIdx = lines ? activeLyricIndex(lines, pos) : -1;

  /* Keep the active line centered */
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-line="${activeIdx}"]`);
    if (el && listRef.current) {
      const top = el.offsetTop - listRef.current.clientHeight / 2 + el.clientHeight / 2;
      listRef.current.scrollTo({ top, behavior: "smooth" });
    }
  }, [activeIdx]);

  return (
    <Sheet open={open} onClose={onClose} title={t("lyrics")} full>
      {lines == null ? (
        <div className="space-y-4 pt-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-5 animate-pulse rounded-full bg-white/[0.06]" style={{ width: `${55 + ((i * 13) % 40)}%` }} />
          ))}
        </div>
      ) : (
        <div ref={listRef} className="max-h-[62vh] space-y-3 overflow-y-auto pr-1 no-scrollbar">
          {lines.map((line, i) => {
            const active = i === activeIdx;
            return (
              <button
                key={i}
                data-line={i}
                onClick={() => player.seek(line.timeMs / 1000)}
                className={cn(
                  "block w-full text-left text-[19px] font-bold leading-snug transition-all duration-300",
                  active ? "text-aura-300 [text-shadow:0_0_24px_rgba(168,85,247,0.45)]" : "text-silver-dim hover:text-silver"
                )}
              >
                {line.text || "♪"}
              </button>
            );
          })}
          <p className="pt-2 text-center text-[11px] text-silver-dim">Tap any line to jump there</p>
        </div>
      )}
    </Sheet>
  );
}

/** Distribute plain-text lyrics evenly across the track duration. */
function synthLinesFromPlain(text: string, durationSec: number): LrcLine[] {
  const raw = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!raw.length) return synthLyrics(durationSec, 7);
  const per = Math.max(2.2, (durationSec - 4) / raw.length);
  return raw.map((lineText, i) => {
    const timeMs = Math.round((2 + i * per) * 1000);
    const tokens = lineText.split(/\s+/);
    const step = (per * 1000) / Math.max(1, tokens.length);
    return {
      timeMs,
      text: lineText,
      words: tokens.map((w, j) => ({
        text: w,
        startMs: Math.round(timeMs + j * step),
        endMs: Math.round(timeMs + (j + 1) * step),
        isHot: false,
      })),
    };
  });
}

/* ─── Sleep sheet ──────────────────────────────────────────────────────── */

function SleepSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const player = usePlayer();
  const active = player.status.sleepTimer.active;
  return (
    <Sheet open={open} onClose={onClose} title="Sleep Timer">
      {active ? (
        <div className="flex items-center justify-between rounded-2xl bg-aura-500/10 px-4 py-4">
          <p className="text-sm font-semibold text-aura-200">
            {player.status.sleepTimer.remainingSec > 0
              ? `Ends in ${formatTime(player.status.sleepTimer.remainingSec)}`
              : "Stops after this track"}
          </p>
          <Button size="sm" variant="danger" onClick={player.cancelSleep}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {SLEEP_MINUTES.map((m) => (
            <Chip key={m} onClick={() => player.startSleep(m)}>
              {m} min
            </Chip>
          ))}
          <Chip onClick={() => player.startSleep(0)}>End of track</Chip>
        </div>
      )}
    </Sheet>
  );
}

/* ─── Queue sheet ──────────────────────────────────────────────────────── */

function QueueSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const player = usePlayer();
  const toast = useToast();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const currentIdx = player.status.track ? player.queue.findIndex((q) => q.id === player.status.track?.id) : -1;

  return (
    <Sheet open={open} onClose={onClose} title={t("queue")} full>
      {player.queue.length === 0 ? (
        <EmptyState icon={<ListMusic size={20} />} title={t("empty_queue")} />
      ) : (
        <div className="space-y-1">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-silver-dim">{t("up_next")}</p>
            <button onClick={player.clearUpNext} className="text-xs font-semibold text-red-300 hover:text-red-200">
              Clear
            </button>
          </div>
          {player.queue.map((track, idx) => (
            <motion.div
              key={`${track.id}_${idx}`}
              layout
              className={cn(
                "group flex items-center gap-2.5 rounded-2xl px-2 py-2",
                idx === currentIdx ? "bg-aura-500/10" : "hover:bg-white/[0.04]",
                dragIdx === idx && "opacity-40"
              )}
              draggable
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx != null && dragIdx !== idx) player.reorder(dragIdx, idx);
                setDragIdx(null);
              }}
            >
              <button onClick={() => player.jumpTo(idx)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                <Artwork src={track.artwork} alt={track.title} size={40} />
                <div className="min-w-0">
                  <p className={cn("truncate text-[13px] font-semibold", idx === currentIdx ? "text-aura-300" : "text-white")}>
                    {track.title}
                  </p>
                  <p className="truncate text-[11px] text-silver">{track.artist}</p>
                </div>
              </button>
              <span className="text-[11px] tabular-nums text-silver-dim">{formatTime(track.duration)}</span>
              <button
                onClick={() => player.removeAt(idx)}
                className="rounded-full p-1.5 text-silver-dim hover:text-red-300"
                aria-label="Remove"
              >
                <X size={15} />
              </button>
            </motion.div>
          ))}
          <button
            onClick={() => {
              const last = player.queue[player.queue.length - 1];
              if (last) player.addToQueue(last);
              toast("Repeated last track", "success");
            }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/10 py-2.5 text-xs font-semibold text-silver hover:text-white"
          >
            <ChevronRight size={13} /> Repeat last track
          </button>
        </div>
      )}
    </Sheet>
  );
}

/* ─── EQ sheet ─────────────────────────────────────────────────────────── */

function EqSheet({
  open,
  onClose,
  eqEnabled,
  onToggleEq,
  gains,
  presetId,
  onBand,
  onPreset,
  vocalCancel,
  onVocalCancel,
}: {
  open: boolean;
  onClose: () => void;
  eqEnabled: boolean;
  onToggleEq: (on: boolean) => void;
  gains: number[];
  presetId: string;
  onBand: (i: number, g: number) => void;
  onPreset: (id: string) => void;
  vocalCancel: number;
  onVocalCancel: (v: number) => void;
}) {
  const bands = [60, 230, 910, 3600, 14000];
  const bandLabels = ["60", "230", "910", "3.6k", "14k"];

  return (
    <Sheet open={open} onClose={onClose} title={t("equalizer")}>
      <div className="space-y-5">
        <div className="flex items-center justify-between rounded-2xl bg-white/[0.04] px-4 py-3">
          <span className="text-sm font-semibold text-white">Enable EQ</span>
          <Toggle on={eqEnabled} onChange={onToggleEq} />
        </div>

        {/* Sliders */}
        <div className={cn("rounded-2xl bg-white/[0.03] px-4 py-4", !eqEnabled && "opacity-40 pointer-events-none")}>
          <div className="flex items-end justify-between gap-2">
            {gains.map((g, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-[10px] tabular-nums text-silver">{g > 0 ? `+${g.toFixed(0)}` : g.toFixed(0)}</span>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={g}
                  onChange={(e) => onBand(i, parseFloat(e.target.value))}
                  className="eq-vertical h-32 w-8 cursor-pointer"
                  aria-label={`${bands[i]} Hz`}
                />
                <span className="text-[10px] font-semibold text-silver-dim">{bandLabels[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Presets */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-silver-dim">Presets</p>
          <div className="flex flex-wrap gap-2">
            {EQ_PRESETS.map((p) => (
              <Chip key={p.id} active={presetId === p.id} onClick={() => onPreset(p.id)} className={cn(p.gated && "relative")}>
                {p.gated && <span className="mr-1">🔒</span>}
                {p.name}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-silver-dim">🔒 Ultra-HD Audiophile unlocks via a rewarded ad.</p>
        </div>

        {/* Vocal suppression */}
        <div className="rounded-2xl bg-white/[0.03] px-4 py-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Vocal Suppression</span>
            <span className="text-xs tabular-nums text-aura-300">{Math.round(vocalCancel * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={vocalCancel}
            onChange={(e) => onVocalCancel(parseFloat(e.target.value))}
            className="w-full cursor-pointer accent-[#A855F7]"
            aria-label="Vocal suppression"
          />
          <p className="mt-1 text-[11px] text-silver-dim">Center-channel cancellation for instant karaoke practice.</p>
        </div>
      </div>
    </Sheet>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-7 w-12 rounded-full transition-colors duration-200",
        on ? "bg-aura-btn shadow-aura-sm" : "bg-white/10"
      )}
      role="switch"
      aria-checked={on}
    >
      <motion.span
        layout
        className="absolute top-1 h-5 w-5 rounded-full bg-white shadow"
        animate={{ left: on ? 26 : 4 }}
        transition={{ type: "spring", damping: 26, stiffness: 420 }}
      />
    </button>
  );
}

/* ─── License / attribution sheet ────────────────────────────────────── */

function LicenseSheet({ open, onClose, track }: { open: boolean; onClose: () => void; track: Track }) {
  const license = track.license;
  return (
    <Sheet open={open} onClose={onClose} title="License & Attribution">
      {!license ? (
        <p className="px-1 pb-4 text-sm text-silver">
          Local file — provided by you; Yutario never redistributes it.
        </p>
      ) : (
        <div className="space-y-4 pb-4">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3.5">
            <p className="flex items-center gap-2 text-sm font-bold text-emerald-300">
              <ShieldCheck size={16} /> {license.label}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-silver">
              {license.commercialUse
                ? "Commercial use permitted by this license."
                : "Personal / non-commercial use — excluded when licensing mode is Commercial."}
            </p>
          </div>
          <div className="rounded-2xl bg-white/[0.04] px-4 py-3.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-silver-dim">Attribution</p>
            <p className="mt-1.5 select-text text-[13px] leading-relaxed text-white">{license.attribution}</p>
            <button
              onClick={() => void navigator.clipboard?.writeText(license.attribution)}
              className="mt-2 text-xs font-semibold text-aura-400 hover:text-aura-300"
            >
              Copy attribution
            </button>
          </div>
          {license.url && (
            <a
              href={license.url}
              target="_blank"
              rel="noreferrer noopener"
              className="block text-xs font-semibold text-aura-400 hover:text-aura-300"
            >
              Read the license text →
            </a>
          )}
          {track.pageUrl && (
            <a
              href={track.pageUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="block text-xs font-semibold text-aura-400 hover:text-aura-300"
            >
              Track page →
            </a>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ─── More sheet (speed / crossfade / lab) ─────────────────────────────── */

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const player = usePlayer();
  const { settings, update } = useSettings();

  return (
    <Sheet open={open} onClose={onClose} title="Playback Lab">
      <div className="space-y-6">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-silver-dim">
            <Gauge size={13} /> Speed (pitch-preserved)
          </p>
          <div className="flex flex-wrap gap-2">
            {RATES.map((r) => (
              <Chip key={r} active={settings.rate === r} onClick={() => { update("rate", r); player.setRate(r); }}>
                {r}×
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-silver-dim">Crossfade</p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={12}
              step={1}
              value={settings.crossfadeSec}
              onChange={(e) => { const v = parseInt(e.target.value, 10); update("crossfadeSec", v); player.setCrossfade(v); }}
              className="flex-1 cursor-pointer accent-[#A855F7]"
              aria-label="Crossfade seconds"
            />
            <span className="w-12 text-right text-xs tabular-nums text-aura-300">{settings.crossfadeSec}s</span>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-white/[0.04] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-white">Visualizer Style</p>
            <p className="text-[11px] text-silver">Now Playing aura render</p>
          </div>
          <div className="flex gap-1.5">
            {(["bars", "wave", "off"] as const).map((m) => (
              <Chip key={m} active={settings.visualizerStyle === m} onClick={() => update("visualizerStyle", m)}>
                {m}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/* ─── Reward ad overlay ────────────────────────────────────────────────── */

export function RewardedAdOverlay() {
  const ads = useAds();
  const r = ads.rewarded;
  // Hardware back dismisses the ad overlay (never navigates away mid-ad).
  useBackClose(!!r?.open, "rewarded-ad", ads.closeRewarded);
  if (!r?.open) return null;
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md px-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          className="w-full max-w-sm overflow-hidden rounded-3xl border border-aura-500/30 bg-ink-200 p-6 text-center shadow-aura-lg"
        >
          <p className="text-[10px] font-black tracking-[0.25em] text-aura-300">UNITY ADS · REWARDED</p>
          {!r.done ? (
            <>
              <div className="my-6 flex items-center justify-center">
                <div className="relative flex h-24 w-24 items-center justify-center">
                  <span className="absolute inset-0 rounded-full bg-aura-600/30 blur-xl animate-pulse-aura" />
                  <span className="text-4xl font-black text-white tabular-nums">{r.secondsLeft}</span>
                </div>
              </div>
              <p className="text-sm text-silver">Watch to unlock your reward…</p>
              <button onClick={ads.closeRewarded} className="mt-5 text-xs font-semibold text-silver-dim hover:text-white">
                Skip (no reward)
              </button>
            </>
          ) : (
            <>
              <div className="my-6 text-5xl">🎁</div>
              <p className="text-base font-bold text-white">Reward earned!</p>
              <Button className="mt-5 w-full" onClick={ads.closeRewarded}>Claim</Button>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
