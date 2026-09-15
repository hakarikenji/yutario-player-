/**
 * Yutario Audio Engine — dual-deck Web Audio graph.
 *
 * Signal flow:
 *   elA ──► gainA ──┐
 *                   ├─► vcIn ─► [vocal-cancel dry/wet] ─► EQ(5 bands) ─► master ─► analyser ─► out
 *   elB ──► gainB ──┘
 *
 * Dual HTMLAudioElement decks enable true gapless hand-off (preloaded
 * standby deck swapped on `ended`) and sample-accurate crossfades.
 */
import type { PlaybackStatus, RepeatMode, SleepTimerState, Track } from "../lib/types";
import { clamp } from "../lib/utils";
import { ensureDemoUrl } from "../lib/demo";
import { synthLyrics } from "../lib/lrc";
import { VOICE_SUPPRESSION, CROSSFADE_CURVE } from "../lib/constants";

type Listener = () => void;

const EMPTY_SLEEP: SleepTimerState = { active: false, endsAt: null, remainingSec: 0, configMinutes: 0 };

function newAudioEl(): HTMLAudioElement {
  const el = new Audio();
  el.preload = "auto";
  el.crossOrigin = "anonymous";
  return el;
}

export class YutarioAudioEngine {
  /* ── decks ── */
  private elA: HTMLAudioElement = newAudioEl();
  private elB: HTMLAudioElement = newAudioEl();
  private activeIsA = true;

  /* ── graph ── */
  private ctx: AudioContext | null = null;
  private gainA: GainNode | null = null;
  private gainB: GainNode | null = null;
  private vcIn: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private eqNodes: BiquadFilterNode[] = [];
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array = new Uint8Array(0);
  private waveData: Uint8Array = new Uint8Array(0);

  /* ── state ── */
  private queue: Track[] = [];
  private order: number[] = [];
  private orderPos = -1;

  private state: PlaybackStatus = {
    state: "stopped",
    track: null,
    positionSec: 0,
    durationSec: 0,
    bufferedSec: 0,
    volume: 0.9,
    muted: false,
    rate: 1,
    shuffle: false,
    repeat: "off",
    crossfadeSec: 0,
    vocalCancelStrength: VOICE_SUPPRESSION.DEFAULT,
    sleepTimer: { ...EMPTY_SLEEP },
  };

  private listeners = new Set<Listener>();
  private ticker: number | null = null;
  private fading = false;
  private sleepDeadline: number | null = null;
  private sleepInterval: number | null = null;
  private historySink: ((track: Track, msPlayed: number) => void) | null = null;
  private loadToken = 0;

  /* ── subscriptions ── */

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getStatus = (): PlaybackStatus => this.state;

  onHistory(fn: (track: Track, msPlayed: number) => void): void {
    this.historySink = fn;
  }

  private emit(): void {
    this.state = { ...this.state };
    for (const fn of this.listeners) fn();
  }

  private patch(p: Partial<PlaybackStatus>): void {
    this.state = { ...this.state, ...p };
    for (const fn of this.listeners) fn();
  }

  /* ── graph construction ── */

  private ensureGraph(): AudioContext {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    }
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.gainA = ctx.createGain();
    this.gainB = ctx.createGain();
    this.gainA.gain.value = 1;
    this.gainB.gain.value = 0;

    // Vocal cancellation: center-channel suppression via L + (−R) summing,
    // blended dry/wet by strength. Mid content (vocals) collapses; sides stay.
    this.vcIn = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();
    this.dryGain.gain.value = 1 - this.state.vocalCancelStrength * 0.92;
    this.wetGain.gain.value = this.state.vocalCancelStrength;
    const splitter = ctx.createChannelSplitter(2);
    const invertR = ctx.createGain();
    invertR.gain.value = -1;
    const sum = ctx.createGain();
    sum.gain.value = 0.9;
    this.vcIn.connect(splitter);
    splitter.connect(sum, 0);
    splitter.connect(invertR, 1);
    invertR.connect(sum);
    sum.connect(this.wetGain);
    this.vcIn.connect(this.dryGain);

    const freqs = [60, 230, 910, 3600, 14000];
    const types: BiquadFilterType[] = ["lowshelf", "peaking", "peaking", "peaking", "highshelf"];
    this.eqNodes = freqs.map((f, i) => {
      const n = ctx.createBiquadFilter();
      n.type = types[i];
      n.frequency.value = f;
      n.Q.value = 1.1;
      n.gain.value = 0;
      return n;
    });
    for (let i = 0; i < this.eqNodes.length - 1; i++) this.eqNodes[i].connect(this.eqNodes[i + 1]);

    this.master = ctx.createGain();
    this.master.gain.value = 1;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.82;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.waveData = new Uint8Array(this.analyser.fftSize);

    this.dryGain.connect(this.eqNodes[0]);
    this.wetGain.connect(this.eqNodes[0]);
    this.eqNodes[this.eqNodes.length - 1].connect(this.master);
    this.master.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    ctx.createMediaElementSource(this.elA).connect(this.gainA);
    ctx.createMediaElementSource(this.elB).connect(this.gainB);
    this.gainA.connect(this.vcIn);
    this.gainB.connect(this.vcIn);

    this.wireDeck(this.elA);
    this.wireDeck(this.elB);
    return ctx;
  }

  private wireDeck(el: HTMLAudioElement): void {
    el.addEventListener("loadedmetadata", () => {
      if (el !== this.activeEl()) return;
      this.patch({
        durationSec: isFinite(el.duration) ? el.duration : this.state.durationSec,
        state: this.state.state === "loading" ? "playing" : this.state.state,
      });
    });
    el.addEventListener("waiting", () => {
      if (el === this.activeEl()) this.patch({ state: "loading" });
    });
    el.addEventListener("playing", () => {
      if (el === this.activeEl() && !this.fading) this.patch({ state: "playing" });
    });
    el.addEventListener("ended", () => {
      if (el === this.activeEl() && !this.fading) void this.advance(true);
    });
    el.addEventListener("error", () => {
      if (el !== this.activeEl()) return;
      this.patch({ state: "error", error: "Stream failed — skipping…" });
      window.setTimeout(() => {
        if (this.state.state === "error") void this.advance(false);
      }, 1200);
    });
  }

  private bufferedAhead(el: HTMLAudioElement): number {
    try {
      if (el.buffered.length > 0) return el.buffered.end(el.buffered.length - 1);
    } catch {
      /* noop */
    }
    return 0;
  }

  private activeEl(): HTMLAudioElement {
    return this.activeIsA ? this.elA : this.elB;
  }

  private standbyEl(): HTMLAudioElement {
    return this.activeIsA ? this.elB : this.elA;
  }

  private activeGain(): GainNode | null {
    return this.activeIsA ? this.gainA : this.gainB;
  }

  private standbyGain(): GainNode | null {
    return this.activeIsA ? this.gainB : this.gainA;
  }

  /* ── queue ── */

  getQueue(): Track[] {
    return this.queue;
  }

  currentQueueIndex(): number {
    return this.orderPos >= 0 && this.order[this.orderPos] != null ? this.order[this.orderPos] : -1;
  }

  upNextTracks(n = 5): Track[] {
    const out: Track[] = [];
    for (let i = this.orderPos + 1; i < this.order.length && out.length < n; i++) {
      out.push(this.queue[this.order[i]]);
    }
    return out;
  }

  setQueue(tracks: Track[], startIndex = 0, autoplay = true): void {
    this.queue = [...tracks];
    this.rebuildOrder();
    const idx = clamp(startIndex, 0, Math.max(0, this.queue.length - 1));
    this.orderPos = this.order.indexOf(idx);
    if (this.orderPos < 0) this.orderPos = 0;
    void this.loadAndPlay(this.queue[this.order[this.orderPos]], autoplay);
  }

  addToQueue(track: Track, playNext = false): void {
    if (playNext && this.orderPos >= 0) {
      const currentQueueIdx = this.order[this.orderPos];
      this.queue.splice(currentQueueIdx + 1, 0, track);
      this.rebuildOrder();
      this.orderPos = this.order.indexOf(currentQueueIdx);
      if (this.orderPos < 0) this.orderPos = 0;
    } else {
      this.queue.push(track);
      this.rebuildOrder();
      if (this.orderPos < 0 && this.queue.length) this.orderPos = 0;
    }
    this.emit();
  }

  removeFromQueue(queueIndex: number): void {
    if (queueIndex < 0 || queueIndex >= this.queue.length) return;
    const wasCurrent = this.currentQueueIndex() === queueIndex;
    this.queue.splice(queueIndex, 1);
    if (!this.queue.length) {
      this.stop();
      return;
    }
    this.rebuildOrder();
    if (wasCurrent) {
      const nextIdx = clamp(queueIndex, 0, this.queue.length - 1);
      this.orderPos = Math.max(0, this.order.indexOf(nextIdx));
      void this.loadAndPlay(this.queue[this.order[this.orderPos]], this.state.state === "playing");
    } else {
      this.emit();
    }
  }

  reorderQueue(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= this.queue.length || to >= this.queue.length) return;
    const [moved] = this.queue.splice(from, 1);
    this.queue.splice(to, 0, moved);
    this.rebuildOrder();
    this.emit();
  }

  jumpToQueueIndex(queueIndex: number): void {
    const orderIdx = this.order.indexOf(queueIndex);
    this.orderPos = orderIdx >= 0 ? orderIdx : clamp(queueIndex, 0, Math.max(0, this.queue.length - 1));
    void this.loadAndPlay(this.queue[this.order[this.orderPos]] ?? this.queue[queueIndex], true);
  }

  clearUpNext(): void {
    if (this.orderPos < 0) return;
    const keepCurrent = this.queue[this.order[this.orderPos]];
    this.queue = keepCurrent ? [keepCurrent] : [];
    this.orderPos = keepCurrent ? 0 : -1;
    this.rebuildOrder();
    this.emit();
  }

  private rebuildOrder(): void {
    const n = this.queue.length;
    this.order = Array.from({ length: n }, (_, i) => i);
    if (this.state.shuffle && n > 1) {
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
      }
      if (this.orderPos >= 0) {
        const cur = this.order[this.orderPos] ?? this.order[0];
        const at = this.order.indexOf(cur);
        if (at > 0) {
          [this.order[0], this.order[at]] = [this.order[at], this.order[0]];
        }
        this.orderPos = 0;
      }
    }
  }

  /* ── transport ── */

  play(track?: Track): void {
    if (track) {
      const idx = this.queue.findIndex((t) => t.id === track.id);
      if (idx >= 0) {
        this.jumpToQueueIndex(idx);
        return;
      }
      this.setQueue([track], 0, true);
      return;
    }
    if (this.orderPos < 0 || !this.queue.length) return;
    void this.loadAndPlay(this.queue[this.order[this.orderPos]], true);
  }

  pause(): void {
    this.stopTicker();
    this.activeEl().pause();
    this.patch({ state: "paused" });
    this.syncMediaSession();
  }

  resume(): void {
    if (this.orderPos < 0 || !this.queue.length) return;
    this.ensureGraph();
    this.flushPendingEq();
    void this.activeEl()
      .play()
      .then(() => this.patch({ state: "playing" }))
      .catch(() => this.patch({ state: "error", error: "Playback blocked" }));
    this.startTicker();
    this.syncMediaSession();
  }

  toggle(): void {
    if (this.state.state === "playing") this.pause();
    else this.resume();
  }

  stop(): void {
    this.stopTicker();
    this.elA.pause();
    this.elB.pause();
    this.elA.removeAttribute("src");
    this.elB.removeAttribute("src");
    this.elA.load();
    this.elB.load();
    this.orderPos = -1;
    this.patch({ state: "stopped", track: null, positionSec: 0, durationSec: 0 });
  }

  async next(): Promise<void> {
    await this.advance(false);
  }

  async prev(): Promise<void> {
    if (this.state.positionSec > 3.5) {
      this.seek(0);
      return;
    }
    if (this.orderPos > 0) {
      this.orderPos--;
    } else if (this.state.repeat === "all") {
      this.orderPos = this.order.length - 1;
    } else {
      this.seek(0);
      return;
    }
    await this.loadAndPlay(this.queue[this.order[this.orderPos]], true);
  }

  private async advance(naturalEnd: boolean): Promise<void> {
    void naturalEnd;
    if (!this.queue.length || this.orderPos < 0) return;

    if (this.state.repeat === "one") {
      this.seek(0);
      void this.activeEl().play();
      return;
    }

    const last = this.orderPos >= this.order.length - 1;
    if (last && this.state.repeat === "off") {
      this.stopTicker();
      this.activeEl().pause();
      this.patch({ state: "paused", positionSec: 0 });
      return;
    }

    this.orderPos = last ? 0 : this.orderPos + 1;
    await this.loadAndPlay(this.queue[this.order[this.orderPos]], true);
  }

  private async loadAndPlay(track: Track | undefined, autoplay: boolean): Promise<void> {
    if (!track) {
      this.patch({ state: "stopped", track: null });
      return;
    }
    const token = ++this.loadToken;
    this.fading = false;
    this.ensureGraph();
    this.patch({
      state: autoplay ? "loading" : "paused",
      track,
      positionSec: 0,
      durationSec: track.duration || 0,
      error: undefined,
    });

    if (!track.url && track.source === "local") {
      try {
        await ensureDemoUrl(track);
      } catch {
        this.patch({ state: "error", error: "Failed to render offline track" });
        return;
      }
      if (token !== this.loadToken) return;
    }

    if (!track.lyrics && track.source === "local") {
      track.lyrics = synthLyrics(track.duration || 180, hashStr(track.id));
    }

    const el = this.activeEl();
    const standby = this.standbyEl();
    const activeGain = this.activeGain();
    const standbyGain = this.standbyGain();

    standby.pause();
    if (activeGain && standbyGain && this.ctx) {
      const t = this.ctx.currentTime;
      activeGain.gain.cancelScheduledValues(t);
      standbyGain.gain.cancelScheduledValues(t);
      activeGain.gain.setValueAtTime(1, t);
      standbyGain.gain.setValueAtTime(0, t);
    }

    el.src = track.url;
    el.playbackRate = this.state.rate;
    setPreservesPitch(el, true);
    el.volume = this.state.muted ? 0 : this.state.volume;
    el.load();

    if (autoplay) {
      try {
        await el.play();
        if (token !== this.loadToken) return;
        this.patch({ state: "playing" });
        this.startTicker();
        this.historySink?.(track, 0);
        this.prefetchNext();
        this.syncMediaSession();
      } catch {
        if (token !== this.loadToken) return;
        this.patch({ state: "error", error: "Playback blocked or unavailable" });
      }
    }
  }

  /** Preload the next track into the standby deck (gapless hand-off). */
  private prefetchNext(): void {
    const nextIdx = this.orderPos + 1;
    const nextTrack = nextIdx < this.order.length ? this.queue[this.order[nextIdx]] : null;
    if (!nextTrack || !nextTrack.url) return;
    const standby = this.standbyEl();
    if (standby.src === nextTrack.url) return;
    standby.src = nextTrack.url;
    standby.load();
  }

  /* ── crossfade ── */

  private maybeBeginCrossfade(): void {
    if (this.fading || this.state.crossfadeSec <= 0 || this.state.state !== "playing") return;
    const el = this.activeEl();
    if (!isFinite(el.duration) || el.duration <= 0) return;
    const remaining = el.duration - el.currentTime;
    if (remaining > this.state.crossfadeSec) return;
    const nextIdx = this.orderPos + 1;
    if (nextIdx >= this.order.length && this.state.repeat !== "all") return;
    this.beginCrossfade();
  }

  private beginCrossfade(): void {
    const nextIdx = this.orderPos + 1 >= this.order.length ? 0 : this.orderPos + 1;
    const nextTrack = this.queue[this.order[nextIdx]];
    if (!nextTrack || !nextTrack.url) return;
    this.fading = true;
    this.orderPos = nextIdx;

    const ctx = this.ctx;
    const outEl = this.activeEl();
    const outGain = this.activeGain();
    const inEl = this.standbyEl();
    const inGain = this.standbyGain();
    if (!ctx || !outGain || !inGain) {
      void this.loadAndPlay(nextTrack, true).then(() => {
        this.fading = false;
      });
      return;
    }

    this.activeIsA = !this.activeIsA;
    const now = ctx.currentTime;
    const curve = CROSSFADE_CURVE === "equalpower" ? 0.55 : 1.0;

    inEl.src = nextTrack.url;
    inEl.playbackRate = this.state.rate;
    setPreservesPitch(inEl, true);
    inEl.volume = this.state.muted ? 0 : this.state.volume;
    inEl.load();
    inEl.currentTime = 0;

    inGain.gain.cancelScheduledValues(now);
    inGain.gain.setValueAtTime(0.0001, now);
    inGain.gain.exponentialRampToValueAtTime(1, now + this.state.crossfadeSec * curve);
    outGain.gain.cancelScheduledValues(now);
    outGain.gain.setValueAtTime(Math.max(0.0001, outGain.gain.value), now);
    outGain.gain.exponentialRampToValueAtTime(0.0001, now + this.state.crossfadeSec);

    void inEl
      .play()
      .then(() => {
        this.patch({
          track: nextTrack,
          state: "playing",
          positionSec: 0,
          durationSec: nextTrack.duration || 0,
        });
        this.historySink?.(nextTrack, 0);
        this.prefetchNext();
        this.syncMediaSession();
        window.setTimeout(() => {
          outEl.pause();
          this.fading = false;
        }, this.state.crossfadeSec * 1000 + 150);
      })
      .catch(() => {
        this.fading = false;
        void this.loadAndPlay(nextTrack, true);
      });
  }

  /* ── seek / volume / rate ── */

  seek(sec: number): void {
    const el = this.activeEl();
    if (isFinite(el.duration)) {
      el.currentTime = clamp(sec, 0, el.duration);
      this.patch({ positionSec: el.currentTime });
    }
  }

  seekBy(delta: number): void {
    this.seek(this.state.positionSec + delta);
  }

  setVolume(v: number): void {
    const vol = clamp(v, 0, 1);
    this.elA.volume = vol;
    this.elB.volume = vol;
    this.patch({ volume: vol, muted: vol === 0 ? this.state.muted : false });
  }

  setMuted(m: boolean): void {
    this.elA.muted = m;
    this.elB.muted = m;
    this.patch({ muted: m });
  }

  setRate(rate: number): void {
    this.elA.playbackRate = rate;
    this.elB.playbackRate = rate;
    setPreservesPitch(this.elA, true);
    setPreservesPitch(this.elB, true);
    this.patch({ rate });
  }

  setShuffle(on: boolean): void {
    this.patch({ shuffle: on });
    this.rebuildOrder();
  }

  setRepeat(mode: RepeatMode): void {
    this.patch({ repeat: mode });
  }

  setCrossfade(sec: number): void {
    this.patch({ crossfadeSec: clamp(sec, 0, 12) });
  }

  setGapless(_on: boolean): void {
    // Standby-deck preloading is always active; flag kept for settings parity.
  }

  /* ── processing params ── */

  private pendingEq: number[] | null = null;

  setEqGains(gains: number[]): void {
    if (!this.ctx) {
      this.pendingEq = gains;
      return;
    }
    gains.forEach((g, i) => {
      const node = this.eqNodes[i];
      if (node && this.ctx) node.gain.setTargetAtTime(g, this.ctx.currentTime, 0.05);
    });
  }

  flushPendingEq(): void {
    if (this.pendingEq && this.ctx) {
      this.setEqGains(this.pendingEq);
      this.pendingEq = null;
    }
  }

  setVocalCancel(strength: number): void {
    const s = clamp(strength, 0, VOICE_SUPPRESSION.MAX);
    this.patch({ vocalCancelStrength: s });
    if (this.ctx && this.dryGain && this.wetGain) {
      const t = this.ctx.currentTime;
      this.dryGain.gain.setTargetAtTime(1 - s * 0.92, t, 0.08);
      this.wetGain.gain.setTargetAtTime(s, t, 0.08);
    }
  }

  /* ── visualizer taps ── */

  getSpectrum(target: Uint8Array): boolean {
    if (!this.analyser) return false;
    this.analyser.getByteFrequencyData(this.freqData);
    target.set(this.freqData.subarray(0, target.length));
    return true;
  }

  getWaveform(target: Uint8Array): boolean {
    if (!this.analyser) return false;
    this.analyser.getByteTimeDomainData(this.waveData);
    target.set(this.waveData.subarray(0, target.length));
    return true;
  }

  /* ── sleep timer ── */

  startSleepTimer(minutes: number): void {
    if (this.sleepInterval) {
      window.clearInterval(this.sleepInterval);
      this.sleepInterval = null;
    }
    if (minutes <= 0) {
      this.sleepDeadline = -1;
      this.patch({ sleepTimer: { active: true, endsAt: null, remainingSec: 0, configMinutes: 0 } });
      return;
    }
    this.sleepDeadline = Date.now() + minutes * 60_000;
    this.patch({
      sleepTimer: { active: true, endsAt: this.sleepDeadline, remainingSec: minutes * 60, configMinutes: minutes },
    });
    this.sleepInterval = window.setInterval(() => this.tickSleep(), 1000);
  }

  cancelSleepTimer(): void {
    if (this.sleepInterval) {
      window.clearInterval(this.sleepInterval);
      this.sleepInterval = null;
    }
    this.sleepDeadline = null;
    this.patch({ sleepTimer: { ...EMPTY_SLEEP } });
  }

  private tickSleep(): void {
    if (!this.sleepDeadline || this.sleepDeadline === -1) return;
    const remaining = Math.max(0, (this.sleepDeadline - Date.now()) / 1000);
    this.patch({ sleepTimer: { ...this.state.sleepTimer, remainingSec: remaining } });
    if (remaining <= 0) {
      this.pause();
      this.cancelSleepTimer();
    }
  }

  consumeEndOfTrackSleep(): boolean {
    if (this.sleepDeadline !== -1) return false;
    this.pause();
    this.cancelSleepTimer();
    return true;
  }

  /* ── ticker ── */

  private startTicker(): void {
    this.stopTicker();
    this.ticker = window.setInterval(() => {
      const el = this.activeEl();
      if (this.state.state !== "playing") return;
      this.patch({
        positionSec: el.currentTime,
        durationSec: isFinite(el.duration) ? el.duration : this.state.durationSec,
        bufferedSec: this.bufferedAhead(el),
      });
      this.maybeBeginCrossfade();
      if (this.sleepDeadline === -1 && isFinite(el.duration) && el.duration - el.currentTime < 0.4) {
        this.consumeEndOfTrackSleep();
      }
    }, 250);
  }

  private stopTicker(): void {
    if (this.ticker) {
      window.clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  /* ── OS media session (lock screen + notification controls) ── */

  private syncMediaSession(): void {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const track = this.state.track;
    if (track) {
      ms.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || "Yutario Player",
        artwork: track.artwork
          ? [
              { src: track.artwork, sizes: "300x300", type: "image/jpeg" },
              { src: track.artwork, sizes: "512x512", type: "image/jpeg" },
            ]
          : [{ src: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml" }],
      });
    }
    ms.playbackState = this.state.state === "playing" ? "playing" : "paused";
    try {
      ms.setActionHandler("play", () => this.resume());
      ms.setActionHandler("pause", () => this.pause());
      ms.setActionHandler("previoustrack", () => void this.prev());
      ms.setActionHandler("nexttrack", () => void this.next());
      ms.setActionHandler("seekto", (d) => {
        if (d.seekTime != null) this.seek(d.seekTime);
      });
    } catch {
      /* some handlers unsupported */
    }
  }

  snapshot(): { queueIds: string[]; index: number; positionSec: number } {
    return {
      queueIds: this.queue.map((t) => t.id),
      index: this.currentQueueIndex(),
      positionSec: this.state.positionSec,
    };
  }
}

function setPreservesPitch(el: HTMLAudioElement, on: boolean): void {
  const withPitch = el as HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean };
  try {
    withPitch.preservesPitch = on;
    withPitch.webkitPreservesPitch = on;
  } catch {
    /* noop */
  }
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export const audioEngine = new YutarioAudioEngine();
