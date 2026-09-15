/**
 * Offline demo synth — deterministic, zero-network Web Audio rendered
 * WAV tracks. Used when Jamendo is unreachable (dev-sandbox client id,
 * offline) so every feature stays fully functional offline.
 */
import type { Track } from "./types";

export function isOfflineLikely(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return false;
}

interface DemoSpec {
  title: string;
  artist: string;
  album: string;
  bpm: number;
  scale: number[];
  mood: string;
  durationSec: number;
}

const SPECS: DemoSpec[] = [
  { title: "Cursed Aura", artist: "Hakari Studio", album: "Aura Sessions", bpm: 92, scale: [0, 3, 5, 7, 10], mood: "chill", durationSec: 74 },
  { title: "Neon Pulse", artist: "Hakari Studio", album: "Aura Sessions", bpm: 128, scale: [0, 2, 4, 7, 9], mood: "energetic", durationSec: 68 },
  { title: "Violet Signal", artist: "Kira Waves", album: "Midnight Frequencies", bpm: 104, scale: [0, 3, 7, 10, 12], mood: "focus", durationSec: 80 },
  { title: "Glass Corridor", artist: "Kira Waves", album: "Midnight Frequencies", bpm: 76, scale: [0, 2, 3, 7, 8], mood: "chill", durationSec: 88 },
  { title: "Overdrive Bloom", artist: "Yuta Reworks", album: "Electric Echoes", bpm: 140, scale: [0, 2, 5, 7, 9], mood: "energetic", durationSec: 62 },
  { title: "Deep Static", artist: "Yuta Reworks", album: "Electric Echoes", bpm: 118, scale: [0, 5, 7, 10, 12], mood: "focus", durationSec: 84 },
  { title: "Afterglow Drive", artist: "Rin Shadow", album: "Night Autonomy", bpm: 96, scale: [0, 3, 5, 8, 10], mood: "chill", durationSec: 90 },
  { title: "Kinji's Gambit", artist: "Rin Shadow", album: "Night Autonomy", bpm: 132, scale: [0, 2, 4, 6, 9], mood: "energetic", durationSec: 70 },
];

const cache = new Map<string, Track>();

export function getDemoTracks(): Track[] {
  return SPECS.map((spec, i) => makeDemoTrack(spec, i));
}

function makeDemoTrack(spec: DemoSpec, index: number): Track {
  const id = `demo_${index}`;
  const cached = cache.get(id);
  if (cached) return cached;
  const track: Track = {
    id,
    title: spec.title,
    artist: spec.artist,
    album: spec.album,
    url: "",
    duration: spec.durationSec,
    source: "local",
    local: true,
    genres: [spec.mood],
    lyrics: null,
    fileName: `${spec.title}.wav (synth)`,
  };
  cache.set(id, track);
  return track;
}

/**
 * Render a demo track to a WAV blob URL with an OfflineAudioContext.
 * Deterministic per track id; results are cached as object URLs.
 */
export async function ensureDemoUrl(track: Track): Promise<string> {
  if (track.url) return track.url;
  const index = parseInt(track.id.replace("demo_", ""), 10) || 0;
  const spec = SPECS[index % SPECS.length];
  const blob = await renderDemoWav(spec, index);
  const url = URL.createObjectURL(blob);
  track.url = url;
  return url;
}

async function renderDemoWav(spec: DemoSpec, seed: number): Promise<Blob> {
  const sampleRate = 32000;
  const OfflineCtor: typeof OfflineAudioContext =
    (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const ctx = new OfflineCtor(2, Math.ceil(sampleRate * spec.durationSec), sampleRate);

  const master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);

  const beat = 60 / spec.bpm;
  let s = seed * 7919 + 17;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const bassHz = 55 * Math.pow(2, spec.scale[0] / 12);
  for (let bar = 0; bar * beat * 4 < spec.durationSec; bar++) {
    const barAt = bar * beat * 4;
    // Kick
    for (let b = 0; b < 4; b++) {
      const t = barAt + b * beat;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.25);
    }
    // Hats on eighths
    for (let e = 0; e < 8; e++) {
      if (rand() < 0.25) continue;
      const t = barAt + e * (beat / 2);
      const noise = makeNoiseBurst(ctx, 0.03);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 8000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      noise.connect(hp).connect(g).connect(master);
      noise.start(t);
    }
    // Bass line
    const deg = spec.scale[Math.floor(rand() * spec.scale.length)];
    const bass = ctx.createOscillator();
    bass.type = "sawtooth";
    const bassF = ctx.createBiquadFilter();
    bassF.type = "lowpass";
    bassF.frequency.value = 220;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0, barAt);
    bg.gain.linearRampToValueAtTime(0.22, barAt + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.02, barAt + beat * 3.6);
    bass.frequency.value = bassHz * Math.pow(2, deg / 12);
    bass.connect(bassF).connect(bg).connect(master);
    bass.start(barAt);
    bass.stop(barAt + beat * 3.8);
    // Chord pad
    if (bar % 2 === 0) {
      const chordDeg = spec.scale[Math.floor(rand() * spec.scale.length)];
      [0, 3, 7].forEach((iv, i) => {
        const osc = ctx.createOscillator();
        osc.type = i === 2 ? "triangle" : "sine";
        osc.frequency.value = 220 * Math.pow(2, (chordDeg + iv) / 12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0, barAt);
        g.gain.linearRampToValueAtTime(0.05, barAt + 0.4);
        g.gain.linearRampToValueAtTime(0.03, barAt + beat * 3.5);
        g.gain.linearRampToValueAtTime(0.0001, barAt + beat * 4);
        osc.connect(g).connect(master);
        osc.start(barAt);
        osc.stop(barAt + beat * 4.05);
      });
    }
  }

  const rendered = await ctx.startRendering();
  return audioBufferToWavBlob(rendered);
}

function makeNoiseBurst(ctx: BaseAudioContext, durSec: number): AudioBufferSourceNode {
  const len = Math.max(1, Math.floor(ctx.sampleRate * durSec));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length;
  const sr = buffer.sampleRate;
  const bytesPerSample = 2;
  const dataSize = len * numCh * bytesPerSample;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const wstr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  wstr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  wstr(8, "WAVE");
  wstr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * bytesPerSample, true);
  view.setUint16(32, numCh * bytesPerSample, true);
  view.setUint16(34, 16, true);
  wstr(36, "data");
  view.setUint32(40, dataSize, true);
  let off = 44;
  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}
