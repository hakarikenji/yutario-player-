/**
 * Yutario AI Terminal — conversational brain powered by Google Gemini.
 * With a studio-provisioned key baked at build time, Gemini reads the
 * user's device library + recent plays and returns natural replies plus
 * structured queries that are executed against the free catalogs and the
 * user's own tracks. Without a key it degrades to the offline intent
 * parser — the terminal always works. Deep sessions gated by a rewarded
 * ad every 3 uses.
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Send, Sparkles, User, Zap, Play, Shuffle, Brain, CheckCircle2, KeyRound, Library, RefreshCw } from "lucide-react";
import { cn, uid } from "../lib/utils";
import { music } from "../lib/music";
import { getDemoTracks } from "../lib/demo";
import {
  askGemini,
  getGeminiError,
  getGeminiStatus,
  hasGeminiKey,
  subscribeGeminiHealth,
  verifyGemini,
  type GeminiStatus,
} from "../lib/gemini";
import { getLanguage, useT } from "../lib/i18n";
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
  const t = useT();
  const player = usePlayer();
  const { settings } = useSettings();
  const library = useLibrary();
  const ads = useAds();
  const toast = useToast();

  const [geminiStatus, setGeminiStatus] = useState<GeminiStatus>(getGeminiStatus);
  const [verifying, setVerifying] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  useEffect(() => subscribeGeminiHealth(setGeminiStatus), []);
  // Initial probe once per mount when a key is baked in.
  useEffect(() => {
    if (hasGeminiKey() && getGeminiStatus() === "checking") void verifyGemini();
  }, []);

  const [messages, setMessages] = useState<AiMessage[]>([
    {
      id: uid("m"),
      role: "yutario",
      text: "YUTARIO AI v2.0 online.\nGemini brain + your library. Tell me a mood — I'll build the mix from your phone's music and the free catalog. Free tier: 3 sessions.",
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

  /** Ask the Gemini brain for a conversational reply + structured queries. */
  const askBrain = async (text: string): Promise<{ advice: Awaited<ReturnType<typeof askGemini>>; usedBrain: boolean }> => {
    if (getGeminiStatus() !== "connected") {
      if (hasGeminiKey() && getGeminiStatus() === "checking") {
        const s = await verifyGemini();
        if (s !== "connected") return { advice: null, usedBrain: false };
      } else {
        return { advice: null, usedBrain: false };
      }
    }
    const deviceSample = library.localTracks.slice(0, 15).map((tr) => `${tr.title} — ${tr.artist}`);
    const recentSample = library.history.slice(0, 8).map((h) => `${h.track.title} — ${h.track.artist}`);
    const advice = await askGemini({
      prompt: text,
      deviceSample,
      recentSample,
      language: getLanguage(),
    });
    return { advice, usedBrain: advice !== null };
  };

  const sendInternal = async (text: string) => {
    setThinking(true);
    setSessionCount((c) => c + 1);
    const userMsg: AiMessage = { id: uid("m"), role: "user", text, at: Date.now() };
    setMessages((prev) => [...prev, userMsg]);

    const { advice, usedBrain } = await askBrain(text);
    const intent = parseIntent(text); // offline fallback always computed

    /* 1. Catalog tracks — Gemini queries when connected, tag intent otherwise. */
    let resultTracks: Track[] = [];
    const queries = advice?.queries.length ? advice.queries : intent.tags.length ? [intent.tags.join("+")] : [];
    for (const q of queries.slice(0, 2)) {
      try {
        const found = await music.searchTracks(q, { limit: 12, bitrate: settings.bitrate });
        resultTracks = [...resultTracks, ...found];
      } catch {
        /* provider failures are non-fatal */
      }
    }
    if (intent.instrumental) {
      try {
        const inst = await music.moods("focus", { bitrate: settings.bitrate });
        resultTracks = [...inst, ...resultTracks];
      } catch {
        /* non-fatal */
      }
    }

    /* 2. The user's own library — matched by Gemini's words or the raw prompt. */
    const matchWords = (advice?.localMatch.length ? advice.localMatch : [...intent.tags, ...text.toLowerCase().split(/\s+/).filter((w) => w.length > 3)]).slice(0, 6);
    const localMatches = library.localTracks.filter((tr) => {
      const hay = `${tr.title} ${tr.artist} ${tr.album ?? ""} ${tr.genres?.join(" ") ?? ""}`.toLowerCase();
      return matchWords.some((w) => hay.includes(w));
    });
    resultTracks = [...localMatches, ...resultTracks];

    if (!resultTracks.length) {
      const pool = getDemoTracks();
      resultTracks =
        intent.speed === "high" ? pool.filter((t) => t.genres?.includes("energetic")).concat(pool) :
        intent.speed === "low" ? pool.filter((t) => t.genres?.includes("chill")).concat(pool) :
        pool;
    }
    resultTracks = resultTracks.filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i).slice(0, 12);
    await new Promise((r) => setTimeout(r, 300));

    const vibe = advice?.vibe ?? intent.vibe;
    const playlist = library.createPlaylist(`AI · ${vibe}`, text);
    resultTracks.forEach((t) => library.addToPlaylist(playlist.id, t));

    const brainLine = usedBrain
      ? `${advice!.reply}\n\nMix built from ${localMatches.length ? `${localMatches.length} of your tracks + ` : ""}${resultTracks.length - localMatches.length} catalog matches.`
      : getGeminiStatus() === "not_configured"
        ? `Offline match for “${vibe}” — ${resultTracks.length} tracks${localMatches.length ? ` (${localMatches.length} yours)` : ""}. Connect the AI brain above for real conversations.`
        : `${t("ai_sorry")}\nOffline match: ${resultTracks.length} tracks.`;

    const reply: AiMessage = {
      id: uid("m"),
      role: "yutario",
      text: brainLine,
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

        {/* ── AI Brain connection card (like the platform integration panel) ── */}
        <div className="mt-3 rounded-3xl border border-white/[0.07] bg-ink-100/80 p-4 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.06]">
                <Brain size={18} className="text-aura-300" />
              </div>
              <div>
                <p className="text-sm font-black text-white">{t("ai_brain")}</p>
                <p className="text-[11px] leading-snug text-silver">{t("ai_brain_sub")}</p>
              </div>
            </div>
            {geminiStatus === "connected" && (
              <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-300">
                ✓ {t("ai_connected")}
              </span>
            )}
            {geminiStatus === "checking" && (
              <span className="shrink-0 rounded-full border border-aura-500/30 bg-aura-500/10 px-2.5 py-1 text-[10px] font-bold text-aura-300">
                {t("ai_checking")}
              </span>
            )}
            {geminiStatus === "error" && (
              <span className="shrink-0 rounded-full border border-red-400/30 bg-red-400/10 px-2.5 py-1 text-[10px] font-bold text-red-300">
                {getGeminiError() ?? "error"}
              </span>
            )}
            {geminiStatus === "not_configured" && (
              <span className="shrink-0 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-silver">
                {t("ai_offline")}
              </span>
            )}
          </div>

          {/* Status detail line */}
          <p className="mt-2.5 text-[11px] text-silver-dim">
            {geminiStatus === "not_configured" && t("ai_offline_sub")}
            {geminiStatus === "connected" && t("ai_librarian_sub")}
            {geminiStatus === "checking" && t("ai_checking")}
            {geminiStatus === "error" && t("ai_sorry")}
          </p>

          {geminiStatus !== "connected" && !showSetup && (
            <Button size="sm" className="mt-3 w-full" onClick={() => setShowSetup(true)}>
              <KeyRound size={13} /> {t("ai_connect")}
            </Button>
          )}

          {/* Numbered setup steps — mirror of the platform integration panel */}
          {showSetup && geminiStatus !== "connected" && (
            <div className="mt-3 space-y-2.5">
              {[t("ai_step1"), t("ai_step2"), t("ai_step3")].map((step, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[10px] font-bold text-silver">
                    {i + 1}
                  </span>
                  <p className="text-[12px] leading-snug text-white/85">{step}</p>
                </div>
              ))}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="!mt-1 flex h-10 items-center justify-center gap-1.5 rounded-2xl bg-aura-btn text-[13px] font-bold text-white shadow-aura-sm"
              >
                aistudio.google.com ↗
              </a>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={verifying}
                onClick={async () => {
                  setVerifying(true);
                  const s = await verifyGemini();
                  setVerifying(false);
                  toast(s === "connected" ? "Gemini connected ✓" : s === "error" ? `Still failing: ${getGeminiError()}` : "No key found in this build", s === "connected" ? "success" : "info");
                }}
              >
                <RefreshCw size={13} className={verifying ? "animate-spin" : ""} /> {t("ai_verify")}
              </Button>
            </div>
          )}

          {/* Library badge */}
          {geminiStatus === "connected" && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
              <Library size={14} className="shrink-0 text-emerald-300" />
              <p className="text-[11px] leading-snug text-silver">
                {t("ai_librarian")} — {library.localTracks.length} {library.localTracks.length === 1 ? "track" : "tracks"}
              </p>
            </div>
          )}

          {/* Ad-gate explainer */}
          {!ads.unlocks.aiPro && (
            <p className="mt-3 text-[10px] leading-relaxed text-silver-dim">{t("ai_ad_gate")}</p>
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
