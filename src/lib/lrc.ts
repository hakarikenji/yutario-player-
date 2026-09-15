/**
 * LRC lyrics utilities — parse timestamped lyrics into word-level lines,
 * distribute word timings for millisecond glow tracking, and generate a
 * synthetic LRC fallback (from duration) when no lyrics exist.
 */
import type { LrcLine } from "./types";

const LINE_RE = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

export function parseLrc(raw: string): LrcLine[] {
  const out: LrcLine[] = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    LINE_RE.lastIndex = 0;
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    let lastEnd = 0;
    while ((m = LINE_RE.exec(line))) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const fracRaw = m[3] ?? "0";
      const frac = parseInt(fracRaw.padEnd(3, "0").slice(0, 3), 10);
      stamps.push(min * 60_000 + sec * 1000 + frac);
      lastEnd = m.index + m[0].length;
    }
    if (!stamps.length) continue;
    const text = line.slice(lastEnd).trim();
    for (const timeMs of stamps) {
      out.push(makeLine(timeMs, text));
    }
  }
  out.sort((a, b) => a.timeMs - b.timeMs);
  return out;
}

function makeLine(timeMs: number, text: string): LrcLine {
  const tokens = text.length ? text.split(/\s+/) : [];
  const wordCount = Math.max(1, tokens.length);
  // Assume ~3.2s line duration, distribute word windows evenly with a
  // slight bias toward earlier words (natural speech envelope).
  const lineDur = 3200;
  const per = lineDur / wordCount;
  const words = tokens.map((w, i) => ({
    text: w,
    startMs: Math.round(timeMs + i * per),
    endMs: Math.round(timeMs + (i + 1) * per),
    isHot: false,
  }));
  return { timeMs, words, text };
}

export function activeLyricIndex(lines: LrcLine[], posMs: number): number {
  if (!lines.length) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= posMs) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** Deterministic pseudo-lyrics for offline/demo playback. */
const SYNTH_POOL = [
  "Neon lights are breathing slow tonight",
  "Every heartbeat syncs into the glow",
  "Midnight frequencies are calling out my name",
  "We are electric echoes in the rain",
  "Lift me up where the violet signals run",
  "One more chorus till the morning comes",
  "Shadows dancing on the edge of sound",
  "Gravity dissolves when you're around",
  "I can feel the aura rising with the bass",
  "Hold the moment, let the silence trace",
  "Endless night, we are satellites of song",
  "Turn it louder, this is where we belong",
];

export function synthLyrics(durationSec: number, seed = 0): LrcLine[] {
  const lines: LrcLine[] = [];
  const count = Math.max(6, Math.min(40, Math.floor(durationSec / 9)));
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  let time = 1400;
  for (let i = 0; i < count; i++) {
    const text = SYNTH_POOL[Math.floor(rand() * SYNTH_POOL.length)];
    lines.push(makeLine(Math.round(time), text));
    time += 6000 + rand() * 6000;
    if (time > durationSec * 1000 - 3000) break;
  }
  return lines;
}
