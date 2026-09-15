/**
 * Shared domain UI components — artwork, track rows, cards, sliders.
 */
import { useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Heart, Music, Play, Pause, ListPlus, Share2, Disc3 } from "lucide-react";
import { cn, formatTime } from "../lib/utils";
import type { Track } from "../lib/types";
import { IconButton } from "./primitives";

export function Artwork({
  src,
  alt,
  size = 48,
  rounded = "rounded-xl",
  className,
}: {
  src?: string;
  alt: string;
  size?: number;
  rounded?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden bg-gradient-to-br from-aura-900/60 via-ink-400 to-ink-300",
        "flex items-center justify-center",
        rounded,
        className
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <Music size={size * 0.4} className="text-aura-500/60" />
      )}
    </div>
  );
}

export function TrackRow({
  track,
  index,
  playing,
  onPlay,
  onFavorite,
  favorite,
  onQueue,
  onShare,
  onAddToPlaylist,
  onOpenArtist,
  onOpenAlbum,
}: {
  track: Track;
  index?: number;
  playing?: boolean;
  onPlay: () => void;
  onFavorite?: () => void;
  favorite?: boolean;
  onQueue?: () => void;
  onShare?: () => void;
  onAddToPlaylist?: () => void;
  onOpenArtist?: (track: Track) => void;
  onOpenAlbum?: (track: Track) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors",
        playing ? "bg-aura-500/10 shadow-aura-sm" : "hover:bg-white/[0.04]"
      )}
    >
      <button onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Play ${track.title}`}>
        <Artwork src={track.artwork} alt={track.title} size={44} />
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-sm font-semibold", playing ? "text-aura-300" : "text-white")}>{track.title}</p>
          <div className="flex min-w-0 items-center gap-1 text-xs text-silver">
            {onOpenArtist ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenArtist(track);
                }}
                className="max-w-[45%] shrink-0 truncate text-left hover:text-aura-300 hover:underline underline-offset-2 transition-colors"
              >
                {track.artist}
              </button>
            ) : (
              <span className="max-w-[45%] shrink-0 truncate">{track.artist}</span>
            )}
            {track.album && (
              <>
                <span className="shrink-0 text-silver-dim">·</span>
                {onOpenAlbum ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenAlbum(track);
                    }}
                    className="min-w-0 truncate text-left hover:text-aura-300 hover:underline underline-offset-2 transition-colors"
                  >
                    {track.album}
                  </button>
                ) : (
                  <span className="min-w-0 truncate">{track.album}</span>
                )}
              </>
            )}
          </div>
        </div>
        {typeof index === "number" && (
          <span className="w-8 text-right text-xs tabular-nums text-silver-dim group-hover:hidden">{index + 1}</span>
        )}
        <span className={cn("hidden w-8 items-center justify-end text-xs tabular-nums text-silver", "group-hover:hidden")}>
          {formatTime(track.duration)}
        </span>
        <span className="hidden group-hover:flex items-center justify-center w-8 text-aura-400">
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </span>
      </button>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-60">
        {onFavorite && (
          <IconButton className="h-8 w-8" onClick={onFavorite} aria-label="Favorite">
            <Heart size={15} className={favorite ? "fill-aura-500 text-aura-500" : ""} />
          </IconButton>
        )}
        {onQueue && (
          <IconButton className="h-8 w-8" onClick={onQueue} aria-label="Add to queue">
            <ListPlus size={15} />
          </IconButton>
        )}
        {onAddToPlaylist && (
          <IconButton className="h-8 w-8" onClick={onAddToPlaylist} aria-label="Add to playlist">
            <Music size={15} />
          </IconButton>
        )}
        {onShare && (
          <IconButton className="h-8 w-8" onClick={onShare} aria-label="Share">
            <Share2 size={15} />
          </IconButton>
        )}
      </div>
    </motion.div>
  );
}

export function TrackCard({
  track,
  playing,
  onPlay,
}: {
  track: Track;
  playing?: boolean;
  onPlay: () => void;
}) {
  return (
    <button onClick={onPlay} className="group w-36 shrink-0 text-left">
      <div className="relative mb-2 overflow-hidden rounded-2xl shadow-lg">
        <Artwork src={track.artwork} alt={track.title} size={144} rounded="rounded-2xl" />
        {playing && (
          <div className="absolute inset-0 bg-aura-600/20 flex items-center justify-center">
            <div className="flex items-end gap-0.5">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="w-1 rounded-full bg-aura-300"
                  style={{ height: 6 + ((i * 7) % 14), animation: `pulse-aura 1.${i + 2}s ease-in-out infinite` }}
                />
              ))}
            </div>
          </div>
        )}
        <div className="absolute inset-0 flex items-end justify-end p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-aura-btn text-white shadow-aura">
            <Play size={16} className="ml-0.5" />
          </span>
        </div>
      </div>
      <p className={cn("truncate text-[13px] font-semibold", playing ? "text-aura-300" : "text-white")}>{track.title}</p>
      <p className="truncate text-xs text-silver">{track.artist}</p>
    </button>
  );
}

export function AlbumCard({
  title,
  artist,
  artwork,
  onOpen,
}: {
  title: string;
  artist: string;
  artwork?: string;
  onOpen: () => void;
}) {
  return (
    <button onClick={onOpen} className="group w-36 shrink-0 text-left">
      <div className="relative mb-2 overflow-hidden rounded-2xl shadow-lg">
        <Artwork src={artwork} alt={title} size={144} rounded="rounded-2xl" />
        <div className="absolute inset-0 flex items-end justify-end p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-aura-btn text-white shadow-aura">
            <Disc3 size={16} />
          </span>
        </div>
      </div>
      <p className="truncate text-[13px] font-semibold text-white">{title}</p>
      <p className="truncate text-xs text-silver">{artist}</p>
    </button>
  );
}

export function MoodCard({
  emoji,
  name,
  count,
  gradient,
  onClick,
}: {
  emoji: string;
  name: string;
  count?: number;
  gradient: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex h-24 w-40 shrink-0 items-start justify-between overflow-hidden rounded-2xl p-3.5 text-left transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]",
        gradient
      )}
    >
      <div className="z-10">
        <p className="text-sm font-bold text-white drop-shadow">{name}</p>
        {count != null && <p className="mt-1 text-[11px] text-white/70">{count} tracks</p>}
      </div>
      <span className="z-10 text-2xl drop-shadow">{emoji}</span>
      <div className="absolute -bottom-4 -right-4 h-20 w-20 rounded-full bg-white/10 blur-xl" />
    </button>
  );
}

export function SeekBar({
  position,
  duration,
  onSeek,
  buffered,
}: {
  position: number;
  duration: number;
  onSeek: (sec: number) => void;
  buffered?: number;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const posFromEvent = (clientX: number): number => {
    const el = barRef.current;
    if (!el || duration <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return frac * duration;
  };

  return (
    <div className="w-full">
      <div
        ref={barRef}
        className="group relative h-6 cursor-pointer touch-none"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          onSeek(posFromEvent(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragging.current) onSeek(posFromEvent(e.clientX));
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
        }}
        onPointerCancel={() => (dragging.current = false)}
      >
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
          {buffered != null && buffered > position && (
            <div className="absolute h-full bg-white/10" style={{ width: `${Math.min(100, (buffered / duration) * 100)}%` }} />
          )}
          <div
            className="absolute h-full bg-gradient-to-r from-aura-600 to-aura-400 shadow-aura-sm"
            style={{ width: `${duration > 0 ? (position / duration) * 100 : 0}%` }}
          />
        </div>
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-aura transition-opacity group-hover:opacity-100"
          style={{ left: `calc(${duration > 0 ? (position / duration) * 100 : 0}% - 7px)` }}
        />
      </div>
      <div className="flex justify-between text-[11px] tabular-nums text-silver-dim">
        <span>{formatTime(position)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

export function VolumeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-6 flex-1">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Volume"
        />
        <div className="pointer-events-none absolute top-1/2 h-1.5 w-full -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-gradient-to-r from-aura-600 to-aura-400" style={{ width: `${value * 100}%` }} />
        </div>
      </div>
      <span className="w-9 text-right text-[11px] tabular-nums text-silver-dim">{Math.round(value * 100)}%</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/10 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-aura-500/10 text-aura-400">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        {hint && <p className="mt-1 max-w-xs text-xs text-silver">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
