/**
 * Yutario Player — app composition.
 * Hash routing (#/, #/auth, #/app), bottom-nav tabs, Now Playing overlay,
 * RewardedAd overlay, and hardware back-button interception.
 */
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AuraBackdrop, BottomNav, MiniPlayer, type TabKey } from "./ui/layout";
import { NowPlaying, RewardedAdOverlay } from "./ui/NowPlaying";
import { LandingPage } from "./pages/Landing";
import { AuthPage } from "./pages/Auth";
import { HomePage } from "./pages/Home";
import { JamendoHubPage } from "./pages/JamendoHub";
import { DeviceLibraryPage } from "./pages/DeviceLibrary";
import { KaraokePage } from "./pages/Karaoke";
import { AiTerminalPage } from "./pages/AiTerminal";
import { SettingsPage } from "./pages/Settings";
import { usePlayer } from "./state/player";
import { useAuth } from "./state/auth";

type Route = "landing" | "auth" | "app";

function readHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h.startsWith("auth")) return "auth";
  if (h.startsWith("app")) return "app";
  return "landing";
}

export default function App() {
  const [route, setRoute] = useState<Route>(readHash);
  const [tab, setTab] = useState<TabKey>("home");
  const [nowPlaying, setNowPlaying] = useState(false);
  const player = usePlayer();
  const auth = useAuth();

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = useCallback((r: Route) => {
    window.location.hash = r === "landing" ? "/" : `/${r}`;
    setRoute(r);
  }, []);

  const switchTab = useCallback((t2: TabKey) => {
    setTab(t2);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  /* Continuous sessions: returning users skip the landing on direct loads. */
  useEffect(() => {
    if (route === "landing" && auth.user) navigate("app");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Hardware back-button interception: collapse overlays first, never
     kill the player process. Mirrors Android onBackPressed semantics. */
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (nowPlaying) {
        setNowPlaying(false);
        e.preventDefault?.();
        history.pushState(null, "", location.href);
        return;
      }
      if (tab === "karaoke") {
        setTab("home");
        e.preventDefault?.();
        history.pushState(null, "", location.href);
        return;
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [nowPlaying, tab]);

  /* Escape mirrors the back gesture on desktop. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (nowPlaying) setNowPlaying(false);
      else if (tab !== "home") setTab("home");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nowPlaying, tab]);

  /* Space bar toggles playback (desktop convenience). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (e.code === "Space" && player.status.track) {
        e.preventDefault();
        player.toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player]);

  const openKaraoke = useCallback(() => {
    setNowPlaying(false);
    setTab("karaoke");
  }, []);

  return (
    <div className="min-h-dvh">
      <AuraBackdrop />

      <AnimatePresence mode="wait">
        {route === "landing" && (
          <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LandingPage onEnter={() => navigate(auth.user ? "app" : "auth")} />
          </motion.div>
        )}

        {route === "auth" && (
          <motion.div key="auth" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <AuthPage onDone={() => navigate("app")} />
          </motion.div>
        )}

        {route === "app" && (
          <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative">
            {/* Smooth cross-fade + slide between tabs */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
              >
                {tab === "home" && <HomePage onOpenDevice={() => switchTab("device")} />}
                {tab === "jamendo" && <JamendoHubPage />}
                {tab === "device" && <DeviceLibraryPage />}
                {tab === "karaoke" && <KaraokePage onExit={() => setTab("home")} />}
                {tab === "ai" && <AiTerminalPage />}
                {tab === "settings" && <SettingsPage />}
              </motion.div>
            </AnimatePresence>

            <MiniPlayer onOpen={() => setNowPlaying(true)} />
            <BottomNav tab={tab} onTab={switchTab} />
          </motion.div>
        )}
      </AnimatePresence>

      <NowPlaying open={nowPlaying} onClose={() => setNowPlaying(false)} onKaraoke={openKaraoke} />
      <RewardedAdOverlay />
    </div>
  );
}
