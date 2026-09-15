/**
 * Karaoke Space — immersive, full-screen lyric presentation with
 * millisecond word-level glow tracking, tap-to-scrub, and the vocal
 * suppression engine.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mic2, MicOff, Music, Play, Pause, SkipBack, SkipForward, ArrowLeft } from "lucide-react";
import { cn } from "../lib/utils";
import { t } from "../lib/i18n";
import { usePlayer } from "../state/player";
import { useSettings } from "../state/settings";
import { music } from "../lib/music";
import { parseLrc, activeLyricIndex, synthLyrics } from "../lib/lrc";
import { IconButton } from "../ui/primitives";
import { Artwork, SeekBar, EmptyState } from "../ui/shared";

export function KaraokePage({ onExit }: { onExit: () => void }) {
  const player = usePlayer();
  const { settings, update } = useSettings();
  const track = player.status.track;

  const [lrcLines, setLrcLines] = useState(track?.lyrics ?? null);
  const [fetching, setFetching] = useState(false);
  const [posMs, setPosMs] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Fetch real LRC for jamendo tracks (falls back to synthetic).
  useEffect(() => {
    let cancelled = false;
    if (!track) return;
    if (track.lyrics) {
      setLrcLines(track.lyrics);
      return;
    }
    if (track.source === "jamendo") {
      setFetching(true);
      void music
        .lyrics(track.id)
        .then(({ lyrics }) => {
          if (cancelled) return;
          const lines = lyrics ? parseLrc(lyrics) : synthLyrics(track.duration || 200, track.id.length);
          track.lyrics = lines;
          setLrcLines(lines);
        })
        .finally(() => !cancelled && setFetching(false));
    } else {
      const lines = synthLyrics(track.duration || 200, track.id.length);
      track.lyrics = lines;
      setLrcLines(lines);
    }
    return () => {
      cancelled = true;
    };
  }, [track]);

  // Local position clock: rAF-smooth over the engine ticker via ref.
  const statusRef = useRef(player.status);
  statusRef.current = player.status;
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setPosMs(statusRef.current.positionSec * 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const activeIdx = useMemo(() => (lrcLines ? activeLyricIndex(lrcLines, posMs) : -1), [lrcLines, posMs]);

  // Auto-scroll to active line.
  useEffect(() => {
    const el = lineRefs.current[activeIdx];
    if (el && scrollRef.current) {
      const container = scrollRef.current;
      const top = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
      container.scrollTo({ top, behavior: "smooth" });
    }
  }, [activeIdx]);

  if (!track) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6">
        <EmptyState
          icon={<Music size={22} />}
          title="Nothing playing"
          hint="Start a track from Home, then open the Karaoke Space for word-by-word synced lyrics and vocal suppression."
        />
        <button onClick={onExit} className="mt-6 flex items-center gap-2 text-sm font-semibold text-aura-400 hover:text-aura-300">
          <ArrowLeft size={15} /> Back to Home
        </button>
      </div>
    );
  }

  const vocal = settings.vocalCancel;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-ink">
      {/* Aura backdrop */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {track.artwork && <img src={track.artwork} alt="" className="h-full w-full scale-125 object-cover opacity-20 blur-3xl" />}
        <div className="absolute inset-x-0 top-0 h-80 bg-aura-radial" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/50 via-transparent to-ink" />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),14px)]">
        <IconButton onClick={onExit} aria-label="Exit karaoke">
          <ArrowLeft size={20} />
        </IconButton>
        <div className="flex items-center gap-2 rounded-full border border-aura-500/30 bg-aura-500/10 px-3 py-1">
          <Mic2 size={12} className="text-aura-300" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-aura-300">Karaoke Space</span>
        </div>
        <div className="w-10" />
      </div>

      {/* Track identity */}
      <div className="relative z-10 mt-4 flex items-center gap-3 px-5">
        <Artwork src={track.artwork} alt={track.title} size={48} rounded="rounded-2xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{track.title}</p>
          <p className="truncate text-xs text-silver">{track.artist}</p>
        </div>
        <button
          onClick={() => update("vocalCancel", vocal >= 0.95 ? 0 : VOICE_DEFAULT)}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full border transition-all",
            vocal >= 0.5
              ? "border-aura-500/60 bg-aura-500/25 text-aura-200 shadow-aura-sm"
              : "border-white/10 bg-white/5 text-silver hover:text-white"
          )}
          aria-label="Toggle vocal suppression"
        >
          {vocal >= 0.5 ? <MicOff size={18} /> : <Mic2 size={18} />}
        </button>
      </div>

      {/* Lyrics viewport — full-height immersive, overlays the transport */}
      <div
        ref={scrollRef}
        className="relative z-10 flex-1 overflow-y-auto px-6 pt-10 no-scrollbar"
        style={{ maskImage: "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)", WebkitMaskImage: "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)" }}
      >
        {!lrcLines ? (
          <p className="pt-20 text-center text-sm text-silver">{fetching ? "Tuning lyrics…" : "No lyrics available"}</p>
        ) : (
          <div className="mx-auto max-w-md space-y-5">
            {lrcLines.map((line, li) => {
              const isActive = li === activeIdx;
              const near = Math.abs(li - activeIdx) <= 1;
              return (
                <button
                  key={li}
                  ref={(el) => {
                    lineRefs.current[li] = el;
                  }}
                  onClick={() => player.seek(line.timeMs / 1000)}
                  className={cn(
                    "block w-full text-left transition-all duration-300",
                    isActive ? "scale-[1.02]" : "",
                    !isActive && !near && "opacity-35"
                  )}
                >
                  <p
                    className={cn(
                      "text-balance text-xl font-extrabold leading-snug tracking-tight transition-colors duration-300",
                      isActive ? "text-white" : "text-silver"
                    )}
                  >
                    {line.words.length === 0 && <span className="text-silver-dim">···</span>}
                    {line.words.map((w, wi) => {
                      const wordActive = isActive && posMs >= w.startMs && posMs <= w.endMs;
                      const sung = isActive && posMs > w.endMs;
                      return (
                        <span
                          key={wi}
                          className={cn(
                            "transition-all duration-150",
                            wordActive
                              ? "text-aura-300 [text-shadow:0_0_18px_rgba(168,85,247,0.8)]"
                              : sung
                              ? "text-aura-100/90"
                              : ""
                          )}
                        >
                          {w.text}{" "}
                        </span>
                      );
                    })}
                  </p>
                </button>
              );
            })}
            <div className="h-24" />
          </div>
        )}
      </div>

      {/* Vocal suppression slider */}
      <div className="relative z-10 mx-5 mb-2 rounded-2xl border border-white/10 bg-ink-200/70 px-4 py-3 backdrop-blur-xl">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-bold text-white">Voice Suppression</span>
          <span className="text-xs font-bold tabular-nums text-aura-300">{Math.round(vocal * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          value={vocal}
          onChange={(e) => update("vocalCancel", parseFloat(e.target.value))}
          className="w-full cursor-pointer accent-[#A855F7]"
          aria-label="Voice suppression"
        />
      </div>

      {/* Transport */}
      <div className="relative z-10 px-5 pb-[max(env(safe-area-inset-bottom),18px)]">
        <SeekBar position={player.status.positionSec} duration={player.status.durationSec} onSeek={player.seek} />
        <div className="mt-1 flex items-center justify-center gap-6">
          <IconButton onClick={player.prev} aria-label="Previous">
            <SkipBack size={22} />
          </IconButton>
          <button
            onClick={player.toggle}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-aura-btn text-white shadow-aura active:scale-95 transition-transform"
            aria-label={player.status.state === "playing" ? "Pause" : "Play"}
          >
            {player.status.state === "playing" ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
          </button>
          <IconButton onClick={player.next} aria-label="Next">
            <SkipForward size={22} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

const VOICE_DEFAULT = 0.7;

export function KaraokeHint() {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-center text-[11px] text-silver-dim"
    >
      Tap any line to jump. Tap the mic to cancel vocals.
    </motion.p>
  );
}
