/**
 * Yutario AI Terminal — conversational prompt interface that parses
 * intent (genre, mood, energy, era keywords) and synthesizes playlists
 * from Jamendo + local tracks. Pro sessions gated by a rewarded ad.
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Send, Sparkles, User, Zap, Play, Shuffle } from "lucide-react";
import { cn, uid } from "../lib/utils";
import { music } from "../lib/music";
import { getDemoTracks } from "../lib/demo";
import { usePlayer } from "../state/player";
import { useSettings } from "../state/settings";
import { useLibrary } from "../state/library";
import { useAds } from "../state/ads";
import { Button, Chip, useToast } from "../ui/primitives";
import { TrackRow } from "../ui/shared";
import type { AiMessage, Track } from "../lib/types";

const SUGGESTIONS = [
  "neon synthwave for a midnight drive",
  "chill acoustic morning",
  "high-energy workout bangers",
  "instrumental focus, no vocals",
  "retro funk party",
];

const STOPWORDS = new Set(["with", "some", "that", "this", "music", "songs", "playlist", "give", "make", "want", "need", "please", "have", "like"]);

interface Intent {
  tags: string[];
  speed?: "low" | "high";
  instrumental: boolean;
  vibe: string;
}

function parseIntent(prompt: string): Intent {
  const p = prompt.toLowerCase();
  const tagMap: [RegExp, string[]][] = [
    [/synth|wave|retro|80s|neon/, ["synthpop", "electronic"]],
    [/chill|relax|calm|sleep|lofi|lo-fi/, ["chillout", "lounge"]],
    [/energ|workout|gym|run|sport|hype|banger/, ["energetic", "dance"]],
    [/focus|study|work|deep/, ["ambient", "instrumental"]],
    [/funk|groove|party|disco/, ["funk", "groove"]],
    [/rock|metal|guitar/, ["rock"]],
    [/jazz|blues|soul/, ["jazz"]],
    [/acoustic|folk|campfire/, ["acoustic", "folk"]],
    [/classical|piano|orchestr/, ["classical", "piano"]],
    [/hip.?hop|rap|beat/, ["hiphop"]],
    [/happy|uplift|summer/, ["happy", "upbeat"]],
    [/sad|melanchol|rain|cry/, ["melancholic", "sad"]],
  ];
  const tags = new Set<string>();
  for (const [re, list] of tagMap) if (re.test(p)) list.forEach((t) => tags.add(t));
  if (!tags.size) {
    p.split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w))
      .slice(0, 2)
      .forEach((w) => tags.add(w));
  }
  const instrumental = /instrumental|no vocal|without vocal/.test(p);
  const speed = /fast|energ|hype|workout/.test(p) ? "high" : /slow|chill|sleep|calm/.test(p) ? "low" : undefined;
  const vibe =
    tags.has("energetic") || tags.has("dance") ? "High-energy" :
    tags.has("chillout") || tags.has("lounge") ? "Mellow" :
    instrumental ? "Focused instrumental" : "Your signature mix";
  return { tags: [...tags], speed, instrumental, vibe };
}

export function AiTerminalPage() {
  const player = usePlayer();
  const { settings } = useSettings();
  const library = useLibrary();
  const ads = useAds();
  const toast = useToast();

  const [messages, setMessages] = useState<AiMessage[]>([
    {
      id: uid("m"),
      role: "yutario",
      text: "YUTARIO AI v1.0 online.\nI synthesize playlists from your prompts — genre, mood, energy, vocals. Free tier: 3 sessions. Unlock unlimited with a rewarded ad.",
      at: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const sendInternal = async (text: string) => {
    setThinking(true);
    setSessionCount((c) => c + 1);
    const userMsg: AiMessage = { id: uid("m"), role: "user", text, at: Date.now() };
    setMessages((prev) => [...prev, userMsg]);

    const intent = parseIntent(text);
    let resultTracks: Track[] = [];
    try {
      const remote = await music.byTag(intent.tags.join("+"), { limit: 20, bitrate: settings.bitrate });
      resultTracks = remote;
    } catch {
      resultTracks = [];
    }
    if (intent.instrumental) {
      try {
        const inst = await music.moods("focus", { bitrate: settings.bitrate });
        resultTracks = [...inst, ...resultTracks];
      } catch {
        /* non-fatal */
      }
    }
    const localMatches = library.localTracks.filter((t) =>
      intent.tags.some((tag) => `${t.title} ${t.artist} ${t.genres?.join(" ")}`.toLowerCase().includes(tag))
    );
    resultTracks = [...localMatches, ...resultTracks];
    if (!resultTracks.length) {
      const pool = getDemoTracks();
      resultTracks =
        intent.speed === "high" ? pool.filter((t) => t.genres?.includes("energetic")).concat(pool) :
        intent.speed === "low" ? pool.filter((t) => t.genres?.includes("chill")).concat(pool) :
        pool;
    }
    resultTracks = resultTracks.filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i).slice(0, 12);
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 800));

    const playlist = library.createPlaylist(`AI · ${intent.vibe}`, text);
    resultTracks.forEach((t) => library.addToPlaylist(playlist.id, t));

    const reply: AiMessage = {
      id: uid("m"),
      role: "yutario",
      text: `Synthesized “${intent.vibe}” — ${resultTracks.length} tracks matched from ${intent.tags.length ? `tags [${intent.tags.slice(0, 3).join(", ")}]` : "your vibe"}. Saved to Your Playlists.`,
      at: Date.now(),
      tracks: resultTracks,
      playlistId: playlist.id,
      commandEcho: text,
    };
    setMessages((prev) => [...prev, reply]);
    setThinking(false);
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || thinking) return;
    setInput("");

    if (sessionCount >= 3 && !ads.unlocks.aiPro) {
      ads.showRewarded("rewarded_ai", () => {
        toast("AI Pro unlocked — unlimited sessions", "success");
        setSessionCount(0);
        void sendInternal(text);
      });
      return;
    }
    await sendInternal(text);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Terminal header */}
      <div className="mx-auto w-full max-w-md px-3 pt-4">
        <div className="flex items-center gap-3 rounded-3xl border border-aura-500/25 bg-gradient-to-r from-aura-900/40 to-ink-200 px-4 py-3">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-aura-btn shadow-aura">
            <Bot size={20} className="text-white" />
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-ink bg-emerald-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black tracking-tight text-white">Yutario AI Terminal</p>
            <p className="text-[11px] text-silver">
              {ads.unlocks.aiPro ? "PRO · unlimited sessions" : `Free tier · ${Math.max(0, 3 - sessionCount)} sessions left`}
            </p>
          </div>
          {!ads.unlocks.aiPro && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                ads.showRewarded("rewarded_ai", () => {
                  toast("AI Pro unlocked", "success");
                  setSessionCount(0);
                })
              }
            >
              <Zap size={13} /> Go Pro
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="mx-auto w-full max-w-md flex-1 space-y-4 overflow-y-auto px-3 py-4 pb-56">
        {messages.map((m) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("flex gap-2.5", m.role === "user" && "flex-row-reverse")}
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                m.role === "yutario" ? "bg-aura-btn text-white shadow-aura-sm" : "bg-white/10 text-silver"
              )}
            >
              {m.role === "yutario" ? <Bot size={15} /> : <User size={15} />}
            </div>
            <div className={cn("max-w-[82%]", m.role === "user" && "text-right")}>
              <div
                className={cn(
                  "whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                  m.role === "yutario"
                    ? "border border-aura-500/20 bg-ink-200/90 text-white/90 backdrop-blur"
                    : "bg-aura-btn/90 font-medium text-white"
                )}
              >
                {m.commandEcho && <p className="mb-1.5 font-mono text-[10px] text-aura-400/80">&gt; {m.commandEcho}</p>}
                {m.text}
              </div>
              {m.tracks && m.tracks.length > 0 && (
                <div className="mt-2 rounded-2xl border border-white/10 bg-ink-100/80 p-2 backdrop-blur">
                  <div className="mb-1 flex gap-2 px-1 pt-1">
                    <Chip
                      onClick={() => player.playTracks(m.tracks!)}
                      className="!border-aura-500/40 !bg-aura-btn/20 !text-aura-200"
                    >
                      <Play size={11} className="mr-1 inline" /> Play
                    </Chip>
                    <Chip onClick={() => player.playTracks(m.tracks!, 0)}>
                      <Shuffle size={11} className="mr-1 inline" /> Shuffle
                    </Chip>
                  </div>
                  {m.tracks.slice(0, 5).map((t, i) => (
                    <TrackRow
                      key={t.id}
                      track={t}
                      index={i}
                      playing={player.status.track?.id === t.id}
                      onPlay={() => player.playTracks(m.tracks!, i)}
                    />
                  ))}
                  {m.tracks.length > 5 && <p className="px-2 py-1 text-[11px] text-silver-dim">+{m.tracks.length - 5} more in playlist</p>}
                </div>
              )}
            </div>
          </motion.div>
        ))}
        {thinking && (
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-aura-btn text-white">
              <Bot size={15} />
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl border border-aura-500/20 bg-ink-200/90 px-4 py-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-aura-400"
                  style={{ animation: `pulse-aura 1s ease-in-out ${i * 0.18}s infinite` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Suggestion chips + input (clears the mini player zone) */}
      <div className="fixed inset-x-0 bottom-[64px] z-30 mx-auto w-full max-w-md px-3 pb-2">
        {messages.length <= 1 && !thinking && (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {SUGGESTIONS.map((s) => (
              <Chip key={s} onClick={() => void send(s)}>
                {s}
              </Chip>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 rounded-3xl border border-aura-500/30 bg-ink-200/95 p-1.5 pl-4 shadow-aura backdrop-blur-2xl">
          <Sparkles size={16} className="shrink-0 text-aura-400" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void send()}
            placeholder="Describe your vibe…"
            className="h-10 flex-1 bg-transparent text-sm text-white placeholder:text-silver-dim focus:outline-none"
          />
          <button
            onClick={() => void send()}
            disabled={!input.trim() || thinking}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-aura-btn text-white shadow-aura-sm transition-opacity disabled:opacity-40"
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
