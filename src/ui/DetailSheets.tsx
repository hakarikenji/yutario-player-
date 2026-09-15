/**
 * Detail Sheets — rich Artist profile and Album matrix sub-sheets.
 * Resolves Jamendo discography by id with a local-library fallback,
 * then renders hero header + track rows + album cross-links.
 */
import { useEffect, useMemo, useState } from "react";
import { Play, Shuffle, Music, Disc3 } from "lucide-react";
import { cn, formatTime } from "../lib/utils";
import { music } from "../lib/music";
import { usePlayer } from "../state/player";
import { useLibrary } from "../state/library";
import { Sheet, Skeleton, Button } from "./primitives";
import { Artwork, TrackRow, AlbumCard, EmptyState } from "./shared";
import type { Track } from "../lib/types";

export interface DetailState {
  kind: "artist" | "album";
  /** Jamendo artist/album id; empty → resolve locally by name. */
  id: string;
  name: string;
  artwork?: string;
  /** Seed track carrying genre/local context. */
  seed?: Track;
}

export interface DetailActions {
  onFavorite: (track: Track) => void;
  favorite: (track: Track) => boolean;
  onQueue: (track: Track) => void;
  onShare: (track: Track) => void;
  onOpenArtist: (track: Track) => void;
  onOpenAlbum: (track: Track) => void;
}

export function DetailSheet({
  detail,
  onClose,
  actions,
  elevated,
}: {
  detail: DetailState | null;
  onClose: () => void;
  actions: DetailActions;
  elevated?: boolean;
}) {
  const player = usePlayer();
  const library = useLibrary();
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!detail) return;
    let cancelled = false;
    setTracks(null);
    setFailed(false);

    const load = async () => {
      // Local resolution when there is no Jamendo id (or it's a local seed).
      if (!detail.id || detail.seed?.source === "local") {
        const local =
          detail.kind === "artist"
            ? library.findLocalByArtist(detail.name)
            : library.findLocalByAlbum(detail.name);
        if (local.length) {
          setTracks(local);
          return;
        }
      }
      try {
        const remote =
          detail.kind === "artist"
            ? await music.artistTopTracks(detail.id, { limit: 30, bitrate: "balanced" })
            : await music.albumTracks(detail.id, { bitrate: "balanced" });
        if (cancelled) return;
        if (remote.length) {
          library.rememberTracks(remote);
          setTracks(remote);
        } else {
          const local =
            detail.kind === "artist"
              ? library.findLocalByArtist(detail.name)
              : library.findLocalByAlbum(detail.name);
          setTracks(local.length ? local : []);
          if (!local.length) setFailed(true);
        }
      } catch {
        if (cancelled) return;
        const local =
          detail.kind === "artist"
            ? library.findLocalByArtist(detail.name)
            : library.findLocalByAlbum(detail.name);
        setTracks(local.length ? local : []);
        setFailed(!local.length);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.kind, detail?.id, detail?.name]);

  /* Album cross-links derived from the loaded discography. */
  const albums = useMemo(() => {
    if (!tracks) return [];
    const map = new Map<string, { id: string; title: string; artist: string; artwork?: string; count: number }>();
    for (const t of tracks) {
      const key = detail?.kind === "artist" ? t.albumId ?? t.album : t.album;
      if (!key || !t.album) continue;
      const found = map.get(key);
      if (found) {
        found.count += 1;
        if (!found.artwork && t.artwork) found.artwork = t.artwork;
      } else {
        map.set(key, { id: detail?.kind === "artist" ? t.albumId ?? "" : t.albumId ?? "", title: t.album, artist: t.artist, artwork: t.artwork, count: 1 });
      }
    }
    return [...map.values()];
  }, [tracks, detail?.kind]);

  const totalDuration = useMemo(() => (tracks ?? []).reduce((sum, t) => sum + (t.duration || 0), 0), [tracks]);

  const play = (shuffled = false) => {
    if (!tracks?.length) return;
    player.setShuffle(shuffled);
    player.playTracks(tracks, 0);
  };

  return (
    <Sheet open={!!detail} onClose={onClose} full elevated={elevated}>
      {detail && (
        <div className="pb-4">
          {/* Hero */}
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <div className="absolute -inset-2 -z-10 rounded-3xl bg-aura-600/25 blur-2xl animate-pulse-aura" />
              <Artwork src={detail.artwork ?? tracks?.[0]?.artwork} alt={detail.name} size={104} rounded="rounded-3xl" />
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-aura-400">
                {detail.kind === "artist" ? "Artist" : "Album"}
              </p>
              <h2 className="mt-0.5 truncate text-xl font-black tracking-tight text-white">{detail.name}</h2>
              <p className="mt-1 text-xs text-silver">
                {tracks == null
                  ? "Loading…"
                  : `${tracks.length} track${tracks.length === 1 ? "" : "s"} · ${formatTime(totalDuration)}${
                      detail.seed?.genres?.length ? ` · ${detail.seed.genres.slice(0, 2).join(", ")}` : ""
                    }`}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" onClick={() => play(false)} disabled={!tracks?.length}>
                  <Play size={14} className="mr-1" /> Play
                </Button>
                <Button size="sm" variant="ghost" onClick={() => play(true)} disabled={!tracks?.length}>
                  <Shuffle size={14} className="mr-1" /> Shuffle
                </Button>
              </div>
            </div>
          </div>

          {/* Body */}
          {tracks == null ? (
            <div className="mt-5 space-y-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-11 w-11 rounded-xl" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : tracks.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={failed ? <Music size={20} /> : <Disc3 size={20} />}
                title={failed ? "Could not load discography" : "No tracks found"}
                hint={failed ? "Network hiccup — try again in a moment." : "This selection has no playable tracks yet."}
              />
            </div>
          ) : (
            <>
              {detail.kind === "artist" && albums.length > 1 && (
                <section className="mt-6">
                  <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-silver-dim">Albums</p>
                  <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                    {albums.map((a) => (
                      <AlbumCard
                        key={a.id || a.title}
                        title={a.title}
                        artist={a.artist}
                        artwork={a.artwork}
                        onOpen={() => {
                          const t = tracks.find((x) => x.album === a.title);
                          if (t) actions.onOpenAlbum(t);
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}

              <div className="mt-5 space-y-0.5">
                {tracks.map((track, i) => (
                  <TrackRow
                    key={`${track.id}_${i}`}
                    track={track}
                    index={i}
                    playing={player.status.track?.id === track.id}
                    onPlay={() => {
                      player.setShuffle(false);
                      player.playTracks(tracks, i);
                    }}
                    onFavorite={() => actions.onFavorite(track)}
                    favorite={actions.favorite(track)}
                    onQueue={() => actions.onQueue(track)}
                    onShare={() => actions.onShare(track)}
                    onOpenArtist={detail.kind === "artist" ? undefined : actions.onOpenArtist}
                    onOpenAlbum={detail.kind === "album" ? undefined : actions.onOpenAlbum}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

/** Compact "Loved" row used by Home — keeps the heart icon semantic. */
export function LovedTrackRow({
  track,
  playing,
  onPlay,
  onUnfavorite,
  onOpenArtist,
  onOpenAlbum,
  onShare,
}: {
  track: Track;
  playing?: boolean;
  onPlay: () => void;
  onUnfavorite: () => void;
  onOpenArtist?: (track: Track) => void;
  onOpenAlbum?: (track: Track) => void;
  onShare?: (track: Track) => void;
}) {
  return (
    <TrackRow
      track={track}
      playing={playing}
      onPlay={onPlay}
      onFavorite={onUnfavorite}
      favorite
      onShare={onShare ? () => onShare(track) : undefined}
      onOpenArtist={onOpenArtist}
      onOpenAlbum={onOpenAlbum}
    />
  );
}
