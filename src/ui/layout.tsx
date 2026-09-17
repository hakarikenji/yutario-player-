/**
 * App shell — aura backdrop, bottom navigation braid, mini-player
 * (with live progress hairline), and the Home banner ad slot.
 */
import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { Home, Mic2, Bot, Settings2, Play, Pause, SkipForward, SkipBack, Smartphone, Radio, Compass, ListMusic } from "lucide-react";
import { cn } from "../lib/utils";
import { t, useT } from "../lib/i18n";
import { usePlayer } from "../state/player";
import { useSettings } from "../state/settings";
import { Artwork } from "./shared";
import { useAds } from "../state/ads";
import { X } from "lucide-react";
import type { Track } from "../lib/types";

export type TabKey = "home" | "discover" | "karaoke" | "ai" | "settings" | "device" | "jamendo";

/** Visible tabs follow the reference design: Home · Discover · Yutario AI · Settings. */
const TABS: { key: TabKey; icon: typeof Home; labelKey: Parameters<typeof t>[0] }[] = [
  { key: "home", icon: Home, labelKey: "nav_home" },
  { key: "discover", icon: Compass, labelKey: "nav_discover" },
  { key: "ai", icon: Bot, labelKey: "nav_ai" },
  { key: "settings", icon: Settings2, labelKey: "nav_settings" },
];

export function AuraBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-ink" />
      <div className="absolute inset-x-0 top-0 h-[420px] bg-aura-radial" />
      <div className="absolute -left-32 top-1/3 h-72 w-72 rounded-full bg-aura-700/10 blur-3xl animate-pulse-aura" />
      <div className="absolute -right-24 top-2/3 h-80 w-80 rounded-full bg-aura-600/10 blur-3xl animate-pulse-aura" style={{ animationDelay: "1.6s" }} />
    </div>
  );
}

export function BottomNav({ tab, onTab }: { tab: TabKey; onTab: (t: TabKey) => void }) {
  useT(); // re-render on language change
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-ink-100/85 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-1.5 pb-[max(env(safe-area-inset-bottom),8px)] pt-1.5">
        {TABS.map(({ key, icon: Icon, labelKey }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => onTab(key)}
              className="relative flex min-w-[56px] flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 transition-colors"
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-2xl bg-aura-500/15 border border-aura-500/25"
                  transition={{ type: "spring", damping: 28, stiffness: 380 }}
                />
              )}
              <Icon size={20} className={cn("relative z-10 transition-colors", active ? "text-aura-400" : "text-silver")} />
              <span className={cn("relative z-10 text-[10px] font-semibold tracking-wide", active ? "text-aura-300" : "text-silver-dim")}>
                {t(labelKey)}
              </span>
              {active && <span className="absolute -top-[7px] h-0.5 w-8 rounded-full bg-aura-400 shadow-aura-sm" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const { status, toggle, next, prev } = usePlayer();
  const track = status.track;
  if (!track) return null;

  const pct = status.durationSec > 0 ? Math.min(100, (status.positionSec / status.durationSec) * 100) : 0;

  return (
    <motion.div
      layout
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed inset-x-0 bottom-[64px] z-40 px-3"
    >
      <button
        onClick={onOpen}
        className="mx-auto flex w-full max-w-md items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-ink-200/90 p-2 backdrop-blur-2xl shadow-aura-lg transition-transform active:scale-[0.99]"
      >
        <Artwork src={track.artwork} alt={track.title} size={44} rounded="rounded-xl" className={status.state === "playing" ? "animate-pulse-aura" : ""} />
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-[13px] font-semibold text-white">{track.title}</p>
          <p className="truncate text-[11px] text-silver">{track.artist}</p>
        </div>
        <div className="flex items-center gap-0.5 pr-1" onClick={(e) => e.stopPropagation()}>
          <button onClick={prev} className="rounded-full p-2 text-silver hover:text-white" aria-label="Previous">
            <SkipBack size={17} />
          </button>
          <button
            onClick={toggle}
            className="mx-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-aura-btn text-white shadow-aura-sm"
            aria-label={status.state === "playing" ? "Pause" : "Play"}
          >
            {status.state === "playing" ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>
          <button onClick={next} className="rounded-full p-2 text-silver hover:text-white" aria-label="Next">
            <SkipForward size={17} />
          </button>
        </div>
      </button>
      {/* Live progress hairline — playback at a glance */}
      <div className="mx-auto mt-1 h-[2px] w-full max-w-md overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-aura-600 to-aura-400 transition-[width] duration-300 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
    </motion.div>
  );
}

export function HomeBannerAd() {
  const { showBanner, hideBanner, simulateImpression } = useAds();
  if (!showBanner) return null;
  return (
    <div className="mx-auto mb-2 w-full max-w-md px-3">
      <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-aura-500/20 bg-gradient-to-r from-aura-900/40 via-ink-200 to-ink-200 px-4 py-2.5">
        <span className="rounded-md bg-aura-500/20 px-1.5 py-0.5 text-[9px] font-black tracking-widest text-aura-300">AD</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-white">Yutario Ultra — go ad-free</p>
          <p className="truncate text-[10px] text-silver">Support Hakari Studio · unlock pro audio</p>
        </div>
        <button
          onClick={() => simulateImpression("banner_home")}
          className="rounded-xl bg-aura-btn px-3 py-1.5 text-[11px] font-bold text-white shadow-aura-sm"
        >
          Try
        </button>
        <button onClick={hideBanner} className="absolute right-1 top-1 rounded-full p-1 text-silver-dim hover:text-white" aria-label="Dismiss ad">
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

export function PageContainer({ children, padBottom = true }: { children: ReactNode; padBottom?: boolean }) {
  const { status } = usePlayer();
  const pad = padBottom ? (status.track ? "pb-44" : "pb-28") : "pb-4";
  return <div className={cn("mx-auto w-full max-w-md px-3", pad)}>{children}</div>;
}
