/**
 * Jamendo Hub — dedicated discovery space for the Jamendo catalog.
 * Trending, genre stations, radio-style autoplay, artist spotlight,
 * and connection status with in-app client-key management.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Play, Shuffle, Search, Radio, Flame, Loader2, KeyRound,
  CheckCircle2, AlertTriangle, ArrowRight, ExternalLink, Sparkles, Info,
} from "lucide-react";
import { cn } from "../lib/utils";
import { t } from "../lib/i18n";
import {
  getJamendoHealth, subscribeJamendoHealth, getJamendoClientId, clearJamendoCache,
} from "../lib/jamendo";
import { music } from "../lib/music";
import { getDemoTracks } from "../lib/demo";
import { STAFF_PICKS } from "../lib/curated";
import { usePlayer } from "../state/player";
import { useSettings } from "../state/settings";
import { useLibrary } from "../state/library";
import { PageContainer } from "../ui/layout";
import { Button, Chip, SectionHeader, Sheet, Skeleton, useToast } from "../ui/primitives";
import { Artwork, TrackRow, AlbumCard, EmptyState } from "../ui/shared";
import { DetailSheet, type DetailState, type DetailActions } from "../ui/DetailSheets";
import type { Track } from "../lib/types";

type Channel = { id: string; label: string; icon: typeof Flame; tag: string };

/* Channels are provider-agnostic tags — the facade fans out to every source. */
const CHANNELS: Channel[] = [
  { id: "trending", label: "Trending", icon: Flame, tag: "" },
  { id: "electronic", label: "Electronic", icon: Radio, tag: "electronic" },
  { id: "chill", label: "Chill", icon: Radio, tag: "chillout" },
  { id: "rock", label: "Rock", icon: Radio, tag: "rock" },
  { id: "hiphop", label: "Hip-Hop", icon: Radio, tag: "hiphop" },
  { id: "jazz", label: "Jazz", icon: Radio, tag: "jazz" },
  { id: "acoustic", label: "Acoustic", icon: Radio, tag: "acoustic" },
  { id: "classical", label: "Classical", icon: Radio, tag: "classical" },
  { id: "pop", label: "Pop", icon: Radio, tag: "pop" },
  { id: "metal", label: "Metal", icon: Radio, tag: "metal" },
  { id: "ambient", label: "Ambient", icon: Radio, tag: "ambient" },
  { id: "funk", label: "Funk", icon: Radio, tag: "funk" },
];

export function JamendoHubPage() {
  const player = usePlayer();
  const { settings } = useSettings();
  const library = useLibrary();
  const toast = useToast();

  const [channel, setChannel] = useState<string>("trending");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [keySheet, setKeySheet] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [fetchVersion, setFetchVersion] = useState(0);
  const [health, setHealth] = useState(getJamendoHealth());
  const [staffTracks, setStaffTracks] = useState<Track[]>([]);
  const searchTimer = useRef<number | null>(null);

  useEffect(() => subscribeJamendoHealth(setHealth), []);

  /* Load staff picks on mount */
  useEffect(() => {
    let cancelled = false;
    // Pick 3 random curated artists to feature
    const picks = [...STAFF_PICKS].sort(() => Math.random() - 0.5).slice(0, 3);
    Promise.all(
      picks.map((p) =>
        music.freeTextSearch(p.artist, { limit: 6, bitrate: settings.bitrate }).catch(() => [])
      )
    ).then((results) => {
      if (cancelled) return;
      const merged = results.flat().slice(0, 12);
      if (merged.length > 0) setStaffTracks(merged);
    });
    return () => { cancelled = true; };
  }, [settings.bitrate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const ch = CHANNELS.find((c) => c.id === channel) ?? CHANNELS[0];
    const fetcher = channel === "trending"
      ? music.trending({ limit: 32, bitrate: settings.bitrate })
      : music.byTag(ch.tag, { limit: 32, bitrate: settings.bitrate });
    fetcher
      .then((list) => {
        if (cancelled) return;
        if (list.length > 0) {
          library.rememberTracks(list);
          setTracks(list);
        } else {
          // All providers returned empty (no key, CORS, network) →
          // always show the synth demo vault so the page is never blank.
          setTracks(getDemoTracks().slice(0, 12));
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Unexpected error — still show demo vault instead of blank page.
        setTracks(getDemoTracks().slice(0, 12));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, settings.bitrate, fetchVersion]);

  /* Debounced search */
  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = window.setTimeout(async () => {
      try {
        const res = await music.freeTextSearch(q, { limit: 30, bitrate: settings.bitrate });
        setSearchResults(res);
        library.rememberTracks(res);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 420);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, settings.bitrate]);

  const openArtist = (tr: Track) =>
    setDetail({ kind: "artist", id: tr.artistId ?? "", name: tr.artist, artwork: tr.artwork, seed: tr });
  const openAlbum = (tr: Track) =>
    setDetail({ kind: "album", id: tr.albumId ?? "", name: tr.album || "Unknown Album", artwork: tr.artwork, seed: tr });

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

  const activeTracks = searchResults ?? tracks;
  const activeLabel = searchResults ? `Results for “${query}”` : CHANNELS.find((c) => c.id === channel)?.label ?? "Jamendo";

  const play = (list: Track[], shuffled = false) => {
    if (!list.length) return;
    player.setShuffle(shuffled);
    player.playTracks(list, 0);
  };

  const albums = useMemo(() => {
    const map = new Map<string, { id: string; title: string; artist: string; artwork?: string }>();
    for (const tr of activeTracks) {
      if (!tr.album) continue;
      const key = tr.albumId ?? tr.album;
      if (!map.has(key)) map.set(key, { id: key, title: tr.album, artist: tr.artist, artwork: tr.artwork });
    }
    return [...map.values()].slice(0, 12);
  }, [activeTracks]);

  const saveKey = () => {
    // Keys are provisioned by Hakari Studio at build time — listeners never
    // enter them. The sheet is a read-only connection status panel now.
    clearJamendoCache();
    setKeySheet(false);
    setFetchVersion((v) => v + 1);
    toast(getJamendoClientId() ? "Reconnecting with the built-in catalog key…" : "Reconnecting via Archive.org…", "info");
  };

  return (
    <PageContainer>
      {/* Header with live connection status */}
      <div className="flex items-end justify-between px-1 pb-3 pt-4">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-aura-400">
            <Sparkles size={11} /> Jamendo Hub
          </p>
          <h1 className="text-xl font-black tracking-tight text-white">Discover free music</h1>
        </div>
        <button
          onClick={() => setKeySheet(true)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold transition-all active:scale-95",
            health.ok === true && "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
            health.ok === false && "border-red-500/40 bg-red-500/10 text-red-300",
            health.ok === null && "border-white/10 bg-white/[0.04] text-silver"
          )}
          title={health.message}
        >
          {health.ok === true ? (
            <CheckCircle2 size={12} />
          ) : health.ok === false ? (
            <AlertTriangle size={12} />
          ) : (
            <Loader2 size={12} className="animate-spin" />
          )}
          {health.ok === true ? "Live API" : health.ok === false ? "Key needed" : "…"}
        </button>
      </div>

      {/* Status banner when the built-in Jamendo key can't serve */}
      {health.ok === false && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left"
        >
          <KeyRound size={18} className="shrink-0 text-silver" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-white">Jamendo catalog paused</span>
            <span className="block text-xs text-silver">Streaming continues via Archive.org originals — nothing for you to set up.</span>
          </span>
          <ArrowRight size={15} className="shrink-0 text-silver-dim" />
        </motion.div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-silver-dim" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search popular free tracks…"
          className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] pl-11 pr-10 text-sm font-medium text-white placeholder:text-silver-dim focus:border-aura-500/50 focus:outline-none focus:ring-2 focus:ring-aura-500/20"
        />
        {searching && <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-aura-400" />}
      </div>

      {/* Channel chips */}
      {!searchResults && (
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {CHANNELS.map((c) => (
            <Chip key={c.id} active={channel === c.id} onClick={() => setChannel(c.id)}>
              <c.icon size={11} className="mr-1 inline" />
              {c.label}
            </Chip>
          ))}
        </div>
      )}

      {/* Hero actions */}
      {!searchResults && activeTracks.length > 0 && (
        <div className="mb-5 flex gap-2.5">
          <Button size="lg" className="flex-1" onClick={() => play(activeTracks)}>
            <Play size={17} /> Play Channel
          </Button>
          <Button size="lg" variant="outline" className="flex-1" onClick={() => play(activeTracks, true)}>
            <Shuffle size={16} /> Radio Mix
          </Button>
        </div>
      )}

      {/* Staff Picks — curated popular free music */}
      {!searchResults && staffTracks.length > 0 && (
        <section className="mb-6">
          <SectionHeader title="✨ Staff Picks" />
          <div className="space-y-0.5">
            {staffTracks.slice(0, 8).map((track, i) => (
              <TrackRow
                key={`sp_${track.id}_${i}`}
                track={track}
                index={i}
                playing={player.status.track?.id === track.id}
                onPlay={() => {
                  player.setShuffle(false);
                  player.playTracks(staffTracks, i);
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
            ))}
          </div>
        </section>
      )}

      {/* Content */}
      {searchResults ? (
        <section className="mb-6">
          <SectionHeader
            title={activeLabel}
            action="Close"
            onAction={() => {
              setQuery("");
              setSearchResults(null);
            }}
          />
          {searchResults.length === 0 ? (
            <EmptyState icon={<Search size={18} />} title="No results" hint={`Nothing on Jamendo for “${query}”.`} />
          ) : (
            <div className="space-y-0.5">
              {searchResults.map((track, i) => (
                <TrackRow
                  key={`${track.id}_${i}`}
                  track={track}
                  index={i}
                  playing={player.status.track?.id === track.id}
                  onPlay={() => {
                    player.setShuffle(false);
                    player.playTracks(searchResults, i);
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
              ))}
            </div>
          )}
        </section>
      ) : loading ? (
        <div className="space-y-4">
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36 w-36 shrink-0" />
            ))}
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Album strip */}
          {albums.length > 1 && (
            <section className="mb-6">
              <SectionHeader title="Albums in this channel" />
              <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                {albums.map((a) => (
                  <AlbumCard
                    key={a.id}
                    title={a.title}
                    artist={a.artist}
                    artwork={a.artwork}
                    onOpen={() => {
                      const tr = activeTracks.find((x) => x.album === a.title);
                      if (tr) openAlbum(tr);
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="mb-6">
            <SectionHeader
              title={activeLabel}
              action={t("shuffle_all")}
              onAction={() => play(activeTracks, true)}
            />
            {activeTracks.length === 0 ? (
              <EmptyState
                icon={<AlertTriangle size={18} />}
                title="No tracks found"
                hint="Try another channel or check your connection."
              />
            ) : (
              <div className="space-y-0.5">
                {activeTracks.map((track, i) => (
                  <TrackRow
                    key={`${track.id}_${i}`}
                    track={track}
                    index={i}
                    playing={player.status.track?.id === track.id}
                    onPlay={() => {
                      player.setShuffle(false);
                      player.playTracks(activeTracks, i);
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
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Attribution footer */}
      <div className="mb-4 flex items-center justify-center gap-2 rounded-3xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5">
        <Info size={14} className="shrink-0 text-silver-dim" />
        <p className="text-center text-[11px] leading-relaxed text-silver">
          Multi-source: every track passes the licensing gate — CC metadata
          verified, originals only (remixes/covers/nightcore excluded) — via{" "}
          <a
            href="https://developer.jamendo.com"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-0.5 font-semibold text-aura-400 hover:text-aura-300"
          >
            Jamendo <ExternalLink size={10} />
          </a>{" "}
          +{" "}
          <a
            href="https://archive.org/details/netlabels"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-0.5 font-semibold text-aura-400 hover:text-aura-300"
          >
            Archive.org netlabels <ExternalLink size={10} />
          </a>
        </p>
      </div>

      <DetailSheet detail={detail} onClose={() => setDetail(null)} actions={detailActions} />

      {/* Connection status sheet (read-only — keys are operator-managed) */}
      <Sheet open={keySheet} onClose={() => setKeySheet(false)} title="Music Sources">
        <KeySheetBody
          value={keyInput}
          onValue={setKeyInput}
          onSave={saveKey}
          onCancel={() => setKeySheet(false)}
        />
      </Sheet>
    </PageContainer>
  );
}

function KeySheetBody({
  onSave,
  onCancel,
}: {
  value: string;
  onValue: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const current = getJamendoClientId();
  return (
    <div className="space-y-4 pb-2">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5">
        <p className="text-sm font-bold text-white">Catalogs are managed for you</p>
        <p className="mt-1 text-xs leading-relaxed text-silver">
          Yutario connects to Jamendo and Archive.org with keys provisioned by
          Hakari Studio — there is nothing to sign up for or paste. If a
          catalog is ever paused, the app streams from the remaining sources
          automatically.
        </p>
      </div>
      <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5">
        <div>
          <p className="text-sm font-bold text-white">Jamendo</p>
          <p className="text-[11px] text-silver">500,000+ Creative Commons originals</p>
        </div>
        {current ? (
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black tracking-wider text-emerald-300">CONNECTED</span>
        ) : (
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black tracking-wider text-silver">STANDBY</span>
        )}
      </div>
      <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5">
        <div>
          <p className="text-sm font-bold text-white">Archive.org Netlabels</p>
          <p className="text-[11px] text-silver">Original netlabel releases, CC-licensed</p>
        </div>
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black tracking-wider text-emerald-300">CONNECTED</span>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onCancel}>
          Close
        </Button>
        <Button className="flex-1" onClick={onSave}>
          <CheckCircle2 size={15} /> Reconnect
        </Button>
      </div>
    </div>
  );
}
