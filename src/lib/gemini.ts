/**
 * gemini.ts — Yutario AI's brain. Talks to the Google Gemini API.
 *
 * Keys belong to Hakari Studio (the app operator), never to listeners: the
 * key is baked into index.html at build time from VITE_GEMINI_API_KEY
 * (scripts/inject-keys.mjs), exactly like the Jamendo client id. Users never
 * paste keys in-app; the AI Terminal just shows connection status.
 *
 * Degradation contract: every entry point resolves instead of throwing —
 * when the key is missing or the network fails, the AI Terminal falls back
 * to its offline intent parser and catalog search. The app never blocks.
 */

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";
/** Tried in order; first 404 (unknown model) advances the list. */
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;

function readKey(): string {
  try {
    return (window.__YUTARIO_CONFIG__?.geminiApiKey || "").trim();
  } catch {
    return "";
  }
}

/* ─── health (reactive, like jamendo health) ─────────────────────────────── */

export type GeminiStatus = "not_configured" | "checking" | "connected" | "error";

let status: GeminiStatus = readKey() ? "checking" : "not_configured";
let lastError: string | undefined;
const listeners = new Set<(s: GeminiStatus) => void>();

function setStatus(next: GeminiStatus, error?: string): void {
  status = next;
  lastError = error;
  listeners.forEach((fn) => fn(status));
}

export function getGeminiStatus(): GeminiStatus {
  return status;
}

export function getGeminiError(): string | undefined {
  return lastError;
}

export function hasGeminiKey(): boolean {
  return readKey().length > 0;
}

export function subscribeGeminiHealth(fn: (s: GeminiStatus) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * verifyGemini — real API round-trip (model list). Cheap, consumes no
 * tokens. Resolves the final status; never rejects.
 */
export async function verifyGemini(): Promise<GeminiStatus> {
  const key = readKey();
  if (!key) {
    setStatus("not_configured");
    return status;
  }
  setStatus("checking");
  try {
    const res = await fetch(`${API_ROOT}/models`, {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      setStatus("connected");
    } else {
      const detail =
        res.status === 400 || res.status === 403
          ? "invalid key"
          : res.status === 429
            ? "quota exceeded"
            : `HTTP ${res.status}`;
      setStatus("error", detail);
    }
  } catch (e) {
    setStatus("error", e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network error");
  }
  return status;
}

/* ─── structured chat ────────────────────────────────────────────────────── */

export interface GeminiAdvice {
  /** Friendly conversational reply in the user's language. */
  reply: string;
  /** English catalog search keywords (1–3 entries). */
  queries: string[];
  /** Words to match against the user's own library (titles/artists). */
  localMatch: string[];
  /** Short vibe label shown in the terminal. */
  vibe: string;
}

interface ChatContext {
  /** Up to ~15 "Title — Artist" entries from the user's device. */
  deviceSample: string[];
  /** Up to ~8 recently played entries. */
  recentSample: string[];
  /** The user's prompt, any language. */
  prompt: string;
  /** User's app language, so the reply matches. */
  language: string;
}

const SYSTEM = `You are Yutario AI, the music brain inside Yutario Player (a premium music app).
You chat about music and turn any mood into a playlist using the app's catalogs (free Creative Commons streaming) and the user's own device library.
Rules:
- reply: warm, 1-3 short sentences, in the user's language (${ "{lang}" }).
- queries: 1-3 ENGLISH keyword search strings that fit the mood (genres, adjectives like "neon synthwave", "chill acoustic morning"). These are used against a Creative Commons catalog, so favor descriptive genre/mood words.
- localMatch: 0-4 lowercase words likely to match titles or artist names in the user's own library for this mood; empty array if nothing fits.
- vibe: 1-3 word playlist name in the user's language.
Respond with ONLY minified JSON: {"reply":"...","queries":["..."],"localMatch":["..."],"vibe":"..."}`;

/** One conversational turn with the brain. Falls back to null on any failure. */
export async function askGemini(ctx: ChatContext): Promise<GeminiAdvice | null> {
  const key = readKey();
  if (!key) return null;

  const contextLines: string[] = [];
  if (ctx.deviceSample.length) contextLines.push(`User's device library (sample): ${ctx.deviceSample.join("; ")}`);
  if (ctx.recentSample.length) contextLines.push(`Recently played: ${ctx.recentSample.join("; ")}`);
  contextLines.push(`User said: ${ctx.prompt}`);

  const body = {
    contents: [{ role: "user", parts: [{ text: contextLines.join("\n") }] }],
    systemInstruction: { parts: [{ text: SYSTEM.replace("{lang}", ctx.language) }] },
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 400,
      responseMimeType: "application/json",
    },
  };

  for (let m = 0; m < MODELS.length; m++) {
    try {
      const res = await fetch(`${API_ROOT}/models/${MODELS[m]}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 404 && m < MODELS.length - 1) continue; // try next model
      if (!res.ok) {
        setStatus(status === "connected" ? "connected" : "error", `HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const parsed = JSON.parse(raw.replace(/^```json\s*|```$/g, "").trim()) as Partial<GeminiAdvice>;
      const queries = (parsed.queries ?? []).filter((q) => typeof q === "string" && q.trim()).slice(0, 3);
      return {
        reply: typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : "Here's your mix.",
        queries: queries.length ? queries : ["chill music"],
        localMatch: (parsed.localMatch ?? []).filter((w) => typeof w === "string").map((w) => w.toLowerCase()).slice(0, 4),
        vibe: typeof parsed.vibe === "string" && parsed.vibe.trim() ? parsed.vibe.trim().slice(0, 32) : "Your mix",
      };
    } catch {
      if (m === MODELS.length - 1) return null;
    }
  }
  return null;
}
