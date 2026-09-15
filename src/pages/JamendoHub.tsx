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
  getJamendoHealth, subscribeJamendoHealth, setJamendoClientId,
  getJamendoClientId, hasCustomJamendoKey, clearJamendoCache,
} from "../lib/jamendo";
import { music } from "../lib/music";
import { getDemoTracks } from "../lib/demo";
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
  const searchTimer = useRef<number | null>(null);

  useEffect(() => subscribeJamendoHealth(setHealth), []);

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
        library.rememberTracks(list);
        setTracks(list);
      })
      .catch(() => {
        if (cancelled) return;
        // Invalid/missing key → empty (banner explains); network blip → demo vault.
        setTracks(getJamendoClientId() ? getDemoTracks().slice(0, 12) : []);
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
    const id = keyInput.trim();
    if (!id) {
      setJamendoClientId("");
      clearJamendoCache();
      toast("Key cleared — back to app default", "info");
      setKeySheet(false);
      setFetchVersion((v) => v + 1);
      return;
    }      setJamendoClientId(id);
      clearJamendoCache();
      setKeySheet(false);
      setFetchVersion((v) => v + 1); // retrigger channel fetch
      toast("Jamendo key saved — reconnecting…", "success");
  };

  return (
    <PageContainer>
      {/* Header with live connection status */}
      <div className="flex items-end justify-between px-1 pb-3 pt-4">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-aura-400">
            <Sparkles size={11} /> Jamendo Hub
          </p>
          <h1 className="text-xl font-black tracking-tight text-white">Free music, infinite radio</h1>
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

      {/* Key banner when invalid */}
      {health.ok === false && (
        <motion.button
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => {
            setKeyInput(getJamendoClientId());
            setKeySheet(true);
          }}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-aura-500/30 bg-aura-500/[0.08] px-4 py-3 text-left transition-colors hover:bg-aura-500/[0.14]"
        >
          <KeyRound size={18} className="shrink-0 text-aura-400" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-white">Connect your Jamendo API key</span>
            <span className="block text-xs text-silver">Free at developer.jamendo.com — takes 30 seconds</span>
          </span>
          <ArrowRight size={15} className="shrink-0 text-aura-400" />
        </motion.button>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-silver-dim" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search 500,000+ free tracks…"
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
                title={health.ok === false ? "API key not connected" : "Channel unavailable"}
                hint={health.ok === false ? "Add your free Jamendo client id to stream the live catalog." : "Try another channel."}
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

      {/* Key management sheet */}
      <Sheet open={keySheet} onClose={() => setKeySheet(false)} title="Jamendo API Key">
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
  value,
  onValue,
  onSave,
  onCancel,
}: {
  value: string;
  onValue: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const custom = hasCustomJamendoKey();
  const current = getJamendoClientId();
  return (
    <div className="space-y-4 pb-2">
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5">
        <p className="text-sm font-bold text-white">Bring your own free key</p>
        <p className="mt-1 text-xs leading-relaxed text-silver">
          Jamendo streams 500,000+ Creative Commons tracks for free — you just need a personal client id.
          Create one at{" "}
          <a href="https://devportal.jamendo.com" target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 font-semibold text-aura-400 hover:text-aura-300">
            devportal.jamendo.com <ExternalLink size={10} />
          </a>
          , then paste it below. It's stored only on this device.
        </p>
      </div>
      <div className="relative">
        <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-silver-dim" />
        <input
          value={value}
          onChange={(e) => onValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSave()}
          placeholder="e.g. 8f2a91c0"
          className="h-14 w-full rounded-2xl border border-white/10 bg-white/[0.05] pl-11 pr-4 text-sm font-medium text-white placeholder:text-silver-dim focus:border-aura-500/50 focus:outline-none focus:ring-2 focus:ring-aura-500/20"
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-silver-dim">
        <span>
          Status:{" "}
          {custom ? (
            <span className="font-semibold text-emerald-300">Custom key active</span>
          ) : current ? (
            <span className="font-semibold text-aura-300">Bundled key</span>
          ) : (
            <span className="font-semibold text-red-300">No key — demo vault only</span>
          )}
        </span>
        {custom && (
          <button
            onClick={() => {
              onValue("");
              onSave();
            }}
            className="font-semibold text-red-300 hover:text-red-200"
          >
            Remove key
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={onSave}>
          <CheckCircle2 size={15} /> Save & Connect
        </Button>
      </div>
    </div>
  );
}
