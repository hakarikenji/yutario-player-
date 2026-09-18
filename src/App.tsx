/**
 * Yutario Player — app composition.
 * Hash routing (#/, #/auth, #/app), bottom-nav tabs, Now Playing overlay,
 * RewardedAd overlay, and hardware back-button interception.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { consumeBack } from "./lib/backStack";
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
  const backBtnRef = useRef<import("@capacitor/core").PluginListenerHandle | null>(null);

  useEffect(() => {
    const onHash = () => {
      lastUrlRef.current = location.href;
      setRoute(readHash());
    };
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

  /* ── Hardware back-button handling (Android via Capacitor, web fallback) ──
   *
   * Priority order — mirrors Android onBackPressed semantics:
   *   1. Topmost registered overlay (Now Playing sheets, DetailSheet,
   *      key sheets, RewardedAd,…) pops itself off the stack.
   *   2. Full-screen screens: Now Playing → Karaoke (and deep tabs) close
   *      and return to the previous view.
   *   3. On Home with nothing open: native → App.minimizeApp() (default
   *      Android behavior — the process and player survive; never kill
   *      or reload), web → stay put (nothing to pop).
   *
   * Returns true when the event was consumed by the app.
   */
  const handleBack = useCallback((): boolean => {
    if (consumeBack()) return true; // topmost overlay consumed the event
    if (nowPlaying) {
      setNowPlaying(false);
      return true;
    }
    if (tab === "karaoke" || tab !== "home") {
      setTab("home");
      return true;
    }
    // On Android, home + nothing open → minimize (NOT exit). The WebView,
    // process, and audio pipeline stay alive in the foreground service.
    if (Capacitor.isNativePlatform()) {
      void CapApp.minimizeApp();
    }
    return false; // nothing left to pop — default platform behavior
  }, [nowPlaying, tab]);

  /* Capacitor hardware back listener (Android WebView). */
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let removed = false;
    void CapApp.addListener("backButton", () => handleBack()).then((h) => {
      if (removed) void h.remove();
      else backBtnRef.current = h;
    });
    return () => {
      removed = true;
      backBtnRef.current?.remove();
      backBtnRef.current = null;
    };
  }, [handleBack]);

  /* Web fallback: browser/gesture back is fully translated into app-back.
     The sentinel entry + re-push at the pre-pop URL means the hash never
     actually traverses — popstate becomes a pure "back pressed" signal,
     exactly like Capacitor's backButton on Android. */
  const lastUrlRef = useRef(location.href);
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    history.replaceState({ yutario: "shell" }, "", location.href);
    history.pushState({ yutario: "shell" }, "", location.href);
    const onPop = () => {
      const consumed = handleBack();
      // Inside the app shell, back is always app-back — pin the URL so the
      // hash never traverses (popstate becomes a pure back signal).
      // On landing/auth with nothing to pop, default navigation proceeds.
      if (consumed || routeRef.current === "app") {
        history.pushState({ yutario: "shell" }, "", lastUrlRef.current);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [handleBack]);

  /* Escape mirrors the back gesture on desktop. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (nowPlaying || tab !== "home") {
        e.preventDefault();
        handleBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nowPlaying, tab, handleBack]);

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

  const handleAuthDone = useCallback(() => navigate("app"), [navigate]);

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
            <AuthPage onDone={handleAuthDone} />
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
                {(tab === "discover" || tab === "jamendo") && <JamendoHubPage />}
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
