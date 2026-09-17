/**
 * Device Library — full-page explorer for the phone's music.
 * Grid/list views, instant local search, artist & album grouping,
 * sort modes, play-all/shuffle, deep drill-in to detail sheets,
 * and offline-first indexing via the library provider.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  FolderOpen, Play, Shuffle, Search, List, LayoutGrid, Loader2, FolderX, Music,
  Clock, ArrowDownUp, X, Disc3, Mic2, ChevronLeft, RefreshCw, FileMusic, ScanLine,
} from "lucide-react";
import { cn, formatTime } from "../lib/utils";
import { t, useT } from "../lib/i18n";
import { usePlayer } from "../state/player";
import { useLibrary } from "../state/library";
import { PageContainer } from "../ui/layout";
import { Button, IconButton, SectionHeader, useToast } from "../ui/primitives";
import { Artwork, TrackRow, AlbumCard, EmptyState } from "../ui/shared";
import { DetailSheet, type DetailState, type DetailActions } from "../ui/DetailSheets";
import type { Track } from "../lib/types";

type ViewMode = "list" | "grid";
type GroupMode = "flat" | "album" | "artist";
type SortMode = "title" | "artist" | "duration" | "recent";

const SORTS: { key: SortMode; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "artist", label: "Artist" },
  { key: "duration", label: "Length" },
  { key: "recent", label: "Recent" },
];

export function DeviceLibraryPage({ onBack }: { onBack?: () => void }) {
  useT(); // re-render on language change
  const player = usePlayer();
  const library = useLibrary();
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("list");
  const [group, setGroup] = useState<GroupMode>("flat");
  const [sort, setSort] = useState<SortMode>("title");
  const [detail, setDetail] = useState<DetailState | null>(null);

  const tracks = library.localTracks;

  const openArtist = (track: Track) =>
    setDetail({ kind: "artist", id: "", name: track.artist, artwork: track.artwork, seed: track });
  const openAlbum = (track: Track) =>
    setDetail({ kind: "album", id: "", name: track.album || "Unknown Album", artwork: track.artwork, seed: track });

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
      onOpenAlbum: openAlbum,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [library.toggleFavorite, library.isFavorite, player.addToQueue, library.shareTrack]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? tracks.filter((tr) => `${tr.title} ${tr.artist} ${tr.album}`.toLowerCase().includes(q))
      : tracks;
    const sorted = [...base];
    sorted.sort((a, b) => {
      switch (sort) {
        case "title":
          return a.title.localeCompare(b.title);
        case "artist":
          return a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title);
        case "duration":
          return b.duration - a.duration;
        case "recent":
          return (a.fileName ?? a.title).localeCompare(b.fileName ?? b.title);
      }
    });
    return sorted;
  }, [tracks, query, sort]);

  const grouped = useMemo(() => {
    if (group === "flat") return null;
    const map = new Map<string, Track[]>();
    for (const tr of filtered) {
      const key = group === "album" ? tr.album || "Unknown Album" : tr.artist;
      const list = map.get(key);
      if (list) list.push(tr);
      else map.set(key, [tr]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, group]);

  const totalDuration = useMemo(() => tracks.reduce((s, tr) => s + (tr.duration || 0), 0), [tracks]);

  const playAll = (list: Track[], shuffled = false) => {
    if (!list.length) return;
    player.setShuffle(shuffled);
    player.playTracks(list, 0);
  };

  const rowFor = (track: Track, list: Track[], i: number) => (
    <TrackRow
      key={`${track.id}_${i}`}
      track={track}
      index={i}
      playing={player.status.track?.id === track.id}
      onPlay={() => {
        player.setShuffle(false);
        player.playTracks(list, i);
      }}
      onFavorite={() => library.toggleFavorite(track.id)}
      favorite={library.isFavorite(track.id)}
      onQueue={() => {
        player.addToQueue(track);
        toast("Added to queue", "success");
      }}
      onShare={() => void library.shareTrack(track)}
      onOpenArtist={openArtist}
      onOpenAlbum={openAlbum}
    />
  );

  const rescan = () => {
    void library.pickLocalFolder();
  };

  return (
    <PageContainer>
      {/* Header — sheet-style, back + title */}
      <div className="flex items-center gap-2 px-1 pb-2 pt-4">
        {onBack && (
          <IconButton onClick={onBack} aria-label="Back" className="h-10 w-10 shrink-0">
            <ChevronLeft size={22} />
          </IconButton>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <FileMusic size={22} className="shrink-0 text-aura-400" />
          <div className="min-w-0">
            <h1 className="truncate text-[20px] font-black leading-tight tracking-tight text-white">
              {t("section_device")} — Offline Files
            </h1>
            <p className="truncate text-[12px] text-silver">Only music stored on this phone (MP3 / M4A) — nothing from streaming</p>
          </div>
        </div>
        {tracks.length > 0 && (
          <div className="flex shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
            <IconButton className="h-8 w-8 rounded-xl" active={view === "list"} onClick={() => setView("list")} aria-label="List view">
              <List size={15} />
            </IconButton>
            <IconButton className="h-8 w-8 rounded-xl" active={view === "grid"} onClick={() => setView("grid")} aria-label="Grid view">
              <LayoutGrid size={15} />
            </IconButton>
          </div>
        )}
      </div>

      {/* Scanning state — matches the reference scanning card */}
      {library.indexing && (
        <div className="mb-4 rounded-2xl border border-aura-500/25 bg-aura-500/[0.07] px-4 py-4">
          <div className="flex items-center gap-3">
            <ScanLine size={22} className="animate-pulse text-aura-400" />
            <p className="text-[15px] font-bold text-white">Scanning device audio…</p>
          </div>
          <p className="mt-1 pl-9 text-xs text-silver">
            {library.indexProgress.done}/{library.indexProgress.total} files
          </p>
          <div className="ml-9 mt-2 h-1 w-[calc(100%-2.25rem)] overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-aura-500 to-aura-400 transition-all"
              style={{ width: `${library.indexProgress.total ? (library.indexProgress.done / library.indexProgress.total) * 100 : 8}%` }}
            />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!library.indexing && tracks.length === 0 && (
        <button
          onClick={() => void library.pickLocalFolder()}
          className="flex w-full flex-col items-center gap-2 rounded-3xl border border-dashed border-aura-500/30 bg-aura-500/[0.04] px-6 py-10 transition-colors hover:bg-aura-500/10"
        >
          <FolderOpen size={28} className="text-aura-400" />
          <p className="text-sm font-bold text-white">Index your device music</p>
          <p className="max-w-[260px] text-center text-xs text-silver">
            Pick a folder — MP3 / M4A / WAV / FLAC get auto-tagged with album art. Everything stays on this device.
          </p>
        </button>
      )}

      {/* Search always visible once indexing completes */}
      {!library.indexing && (
        <div className="relative mb-3">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-silver-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search local files…"
            className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] pl-11 pr-10 text-sm font-medium text-white placeholder:text-silver-dim focus:border-aura-500/50 focus:outline-none focus:ring-2 focus:ring-aura-500/20"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-silver-dim hover:text-white"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Empty footer — count + refresh, matching the reference */}
      {!library.indexing && (
        <div className="mt-2 flex items-center justify-between px-1">
          <p className="text-sm text-silver">
            {tracks.length ? `${tracks.length} file${tracks.length === 1 ? "" : "s"}${tracks.length ? ` · ${formatTime(totalDuration)}` : ""}` : "No local files"}
          </p>
          <button
            onClick={rescan}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[14px] font-bold text-silver transition-colors hover:text-white active:scale-95"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      )}

      {/* Controls (only when there is content) */}
      {tracks.length > 0 && (
        <>
          {/* Primary actions — premium CTA pair */}
          <div className="mb-4 flex gap-2.5">
            <Button size="lg" className="flex-1" onClick={() => playAll(filtered)}>
              <Play size={17} /> Play All
            </Button>
            <Button size="lg" variant="outline" className="flex-1" onClick={() => playAll(filtered, true)}>
              <Shuffle size={16} /> Shuffle
            </Button>
          </div>

          {/* Group / sort chips */}
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {(
                [
                  { key: "flat", label: "All", icon: null },
                  { key: "album", label: "Albums", icon: Disc3 },
                  { key: "artist", label: "Artists", icon: Mic2 },
                ] as const
              ).map((g) => (
                <button
                  key={g.key}
                  onClick={() => setGroup(g.key)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all duration-200 active:scale-95",
                    group === g.key
                      ? "border-aura-500/50 bg-aura-500/20 text-aura-200 shadow-aura-sm"
                      : "border-white/10 bg-white/[0.04] text-silver hover:text-white"
                  )}
                >
                  {g.icon && <g.icon size={12} />}
                  {g.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                const order: SortMode[] = ["title", "artist", "duration", "recent"];
                setSort(order[(order.indexOf(sort) + 1) % order.length]);
              }}
              className="flex shrink-0 items-center gap-1 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-silver transition-colors hover:text-white active:scale-95"
              aria-label="Cycle sort mode"
            >
              <ArrowDownUp size={12} />
              {SORTS.find((s) => s.key === sort)?.label}
            </button>
          </div>

          {/* Content */}
          {filtered.length === 0 ? (
            <EmptyState icon={<Search size={18} />} title="No matches on device" hint={`Nothing found for “${query}”.`} />
          ) : group === "flat" && view === "grid" ? (
            <div className="grid grid-cols-3 gap-2.5">
              {filtered.map((track, i) => (
                <button
                  key={`${track.id}_${i}`}
                  onClick={() => {
                    player.setShuffle(false);
                    player.playTracks(filtered, i);
                  }}
                  className="group text-left"
                >
                  <div className="relative mb-1.5 overflow-hidden rounded-2xl shadow-lg">
                    <Artwork src={track.artwork} alt={track.title} size={112} rounded="rounded-2xl" className="w-full" />
                    {player.status.track?.id === track.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-aura-600/25">
                        <span className="h-2.5 w-2.5 rounded-full bg-aura-300 shadow-aura-sm" />
                      </div>
                    )}
                  </div>
                  <p className={cn("truncate text-[12px] font-semibold", player.status.track?.id === track.id ? "text-aura-300" : "text-white")}>
                    {track.title}
                  </p>
                  <p className="truncate text-[10px] text-silver">{track.artist}</p>
                </button>
              ))}
            </div>
          ) : grouped ? (
            <div className="space-y-6">
              {grouped.map(([key, list]) => (
                <section key={key}>
                  <SectionHeader
                    title={key}
                    action={t("play_all")}
                    onAction={() => playAll(list)}
                  />
                  {view === "grid" ? (
                    <div className="grid grid-cols-3 gap-2.5">
                      {list.map((track, i) => (
                        <button key={`${track.id}_${i}`} onClick={() => playAll(list, false)} className="text-left">
                          <div className="mb-1.5 overflow-hidden rounded-2xl shadow-lg">
                            <Artwork src={track.artwork} alt={track.title} size={112} rounded="rounded-2xl" className="w-full" />
                          </div>
                          <p className="truncate text-[12px] font-semibold text-white">{track.title}</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-0.5">{list.map((track, i) => rowFor(track, list, i))}</div>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">{filtered.map((track, i) => rowFor(track, filtered, i))}</div>
          )}

          {/* Folder management */}
          <div className="mt-8 flex items-center justify-between gap-2 rounded-3xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {library.localFolder ? `Indexed: ${library.localFolder.name}` : "No folder indexed"}
              </p>
              <p className="text-[11px] text-silver">{tracks.length} tracks · stored locally, never uploaded</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <IconButton onClick={() => void library.pickLocalFolder()} aria-label="Add folder">
                <FolderOpen size={16} />
              </IconButton>
              <IconButton
                onClick={() => {
                  library.clearLocal();
                  toast("Device index cleared", "success");
                }}
                aria-label="Clear device index"
              >
                <FolderX size={16} />
              </IconButton>
            </div>
          </div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 text-center">
            <Music size={14} className="mx-auto text-silver-dim/60" />
            <p className="mt-1 text-[10px] text-silver-dim">Offline-first · files never leave this device</p>
          </motion.div>
        </>
      )}

      <DetailSheet detail={detail} onClose={() => setDetail(null)} actions={detailActions} />
    </PageContainer>
  );
}
