/**
 * Landing — the cursed-aura showcase. Hero, feature braid, social
 * proof, and CTAs that route into /auth and the app.
 */
import { motion } from "framer-motion";
import {
  Music4, Mic2, Bot, Sliders, Sparkles, Play, ArrowRight, ShieldCheck, Zap, Radio,
} from "lucide-react";
import { BUILD } from "../lib/constants";
import { Button } from "../ui/primitives";
import { Visualizer } from "../ui/visualizer";

const FEATURES = [
  {
    icon: Sliders,
    title: "Studio EQ + Pro Audio",
    body: "5-band parametric EQ, 0.5×–2× pitch-true speed, gapless dual-deck engine, crossfades, sleep timer.",
  },
  {
    icon: Mic2,
    title: "Karaoke Space",
    body: "Word-by-word synced lyric glow, tap-to-scrub lines, and a 20–100% center-channel vocal suppressor.",
  },
  {
    icon: Bot,
    title: "Yutario AI Terminal",
    body: "Prompt your vibe in plain language — get an instant playlist synthesized from streaming + your device.",
  },
  {
    icon: Music4,
    title: "Your Device, Decoded",
    body: "Index any folder of MP3/M4A — ID3 tags, embedded art, and 100% offline playback. No account needed.",
  },
  {
    icon: Radio,
    title: "Jamendo Discovery",
    body: "Trending charts, smart moods, artist & album matrices — all Creative Commons, all streamable.",
  },
  {
    icon: ShieldCheck,
    title: "Yours, Privately",
    body: "Guest sandbox or email OTP. Sessions persist locally — no login loops, ever.",
  },
];

export function LandingPage({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      {/* Aura field */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[560px] bg-aura-radial" />
        <div className="absolute -left-40 top-64 h-96 w-96 rounded-full bg-aura-700/15 blur-3xl animate-pulse-aura" />
        <div className="absolute -right-32 top-[60%] h-96 w-96 rounded-full bg-aura-600/15 blur-3xl animate-pulse-aura" style={{ animationDelay: "1.8s" }} />
      </div>

      <div className="relative mx-auto w-full max-w-md px-5 pb-16">
        {/* Nav */}
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-aura-btn shadow-aura">
              <Music4 size={16} className="text-white" />
            </div>
            <span className="text-sm font-black tracking-tight text-white">Yutario</span>
          </div>
          <Button size="sm" variant="outline" onClick={onEnter} className="rounded-full">
            Open App <ArrowRight size={14} />
          </Button>
        </header>

        {/* Hero */}
        <section className="pt-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-aura-500/30 bg-aura-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-aura-300">
              <Sparkles size={11} /> Hakari Studio
            </span>
            <h1 className="mt-5 text-[42px] font-black leading-[1.02] tracking-tight text-white">
              Music with a
              <span className="bg-gradient-to-r from-aura-300 via-aura-500 to-aura-700 bg-clip-text text-transparent"> cursed aura</span>
            </h1>
            <p className="mx-auto mt-4 max-w-[320px] text-[15px] leading-relaxed text-silver">
              Stream Jamendo, decode your device, sing word-perfect karaoke, and command playlists with AI — in one ultra-premium player.
            </p>
            <div className="mt-7 flex flex-col items-center gap-3">
              <motion.button
                whileTap={{ scale: 0.96 }}
                whileHover={{ scale: 1.015 }}
                transition={{ type: "spring", stiffness: 420, damping: 24 }}
                onClick={onEnter}
                className="group relative w-full overflow-hidden rounded-full bg-aura-cta px-8 py-5 text-base font-black tracking-tight text-white shadow-cta-lg transition-shadow duration-300"
              >
                <span className="absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-black/10" />
                <span className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
                <span className="absolute -left-10 top-0 h-full w-24 -skew-x-12 bg-white/15 blur-md transition-transform duration-700 ease-out group-hover:translate-x-[340px]" />
                <span className="relative flex items-center justify-center gap-2.5">
                  <Zap size={19} className="drop-shadow" /> Launch Yutario Player
                  <ArrowRight size={17} className="transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </motion.button>
              <p className="text-[11px] text-silver-dim">Free forever · guest mode available · no ads between tracks</p>
            </div>
          </motion.div>

          {/* Floating vinyl visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.7 }}
            className="relative mx-auto mt-10 w-fit"
          >
            <div className="absolute inset-0 -z-10 m-auto h-40 w-40 rounded-full bg-aura-600/40 blur-3xl animate-pulse-aura" />
            <div className="animate-spin-slow flex h-56 w-56 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-ink-300 via-ink-200 to-ink shadow-aura-lg">
              <div className="flex h-44 w-44 items-center justify-center rounded-full border border-white/5 bg-ink-100">
                <div className="flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-aura-700 to-ink-300">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ink shadow-inner">
                    <Play size={22} className="ml-0.5 text-aura-300" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
          <div className="mx-auto mt-2 max-w-xs opacity-80">
            <Visualizer mode="bars" className="h-12" />
          </div>
        </section>

        {/* Feature braid */}
        <section className="mt-14 space-y-3">
          <h2 className="px-1 text-lg font-black tracking-tight text-white">Everything. Engineered.</h2>
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.05, duration: 0.5 }}
              className="flex gap-4 rounded-3xl border border-white/[0.06] bg-white/[0.03] p-4 backdrop-blur transition-colors hover:border-aura-500/25"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-aura-500/12 text-aura-400 shadow-aura-sm">
                <f.icon size={19} />
              </div>
              <div>
                <p className="text-sm font-bold text-white">{f.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-silver">{f.body}</p>
              </div>
            </motion.div>
          ))}
        </section>

        {/* Stats */}
        <section className="mt-12 grid grid-cols-3 gap-2.5 text-center">
          {[
            { v: "0.5–2×", l: "Pitch-true speed" },
            { v: "5-band", l: "Studio EQ" },
            { v: "100%", l: "Offline device mode" },
          ].map((s) => (
            <div key={s.l} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-2 py-4">
              <p className="text-lg font-black text-aura-300">{s.v}</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-silver-dim">{s.l}</p>
            </div>
          ))}
        </section>

        {/* Final CTA */}
        <section className="mt-14 text-center">
          <div className="rounded-3xl border border-aura-500/25 bg-gradient-to-b from-aura-900/30 to-ink-200 p-6">
            <Bot size={26} className="mx-auto text-aura-300" />
            <h3 className="mt-3 text-lg font-black text-white">Ask. It plays.</h3>
            <p className="mx-auto mt-1.5 max-w-[260px] text-[13px] text-silver">
              “neon synthwave for a midnight drive” — the AI Terminal builds the playlist before you finish blinking.
            </p>
            <Button size="lg" glow className="mt-5 w-full" onClick={onEnter}>
              Start Listening <ArrowRight size={16} />
            </Button>
          </div>
        </section>

        <footer className="mt-12 text-center">
          <p className="text-[11px] text-silver-dim">
            {BUILD.name} v{BUILD.version} · {BUILD.copyright}
          </p>
          <p className="mt-1 text-[10px] text-silver-dim/70">
            Streaming by Jamendo under Creative Commons
          </p>
        </footer>
      </div>
    </div>
  );
}
