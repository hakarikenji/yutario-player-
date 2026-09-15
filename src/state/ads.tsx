/**
 * Yutario ads — monolithic ad-service abstraction with Unity-shaped
 * rewarded + banner placements. The web runtime ships a deterministic
 * simulation bridge (user-gesture gated, observable events) so the
 * product UX is fully exercisable; a native bridge (Unity Ads / AdMob)
 * implements the same interface in the Android shell.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { ADS } from "../lib/constants";
import type { AdEvent, AdEventKind, AdPlacement } from "../lib/types";
import { storageGet, storageSet } from "../lib/storage";
import { uid } from "../lib/utils";

const UNLOCK_KEY = "unlocks";

export interface Unlocks {
  ultraHdEq: boolean;
  aiPro: boolean;
}

interface AdEventLog extends AdEvent {
  id: string;
}

interface AdsContextValue {
  unlocks: Unlocks;
  bannerHtml: null;
  showBanner: boolean;
  hideBanner: () => void;
  showRewarded: (placement: "rewarded_eq" | "rewarded_ai", onReward: () => void) => void;
  rewarded: { open: boolean; placement: AdPlacement | null; secondsLeft: number; done: boolean } | null;
  closeRewarded: () => void;
  events: AdEventLog[];
  simulateImpression: (placement: AdPlacement) => void;
}

const AdsContext = createContext<AdsContextValue | null>(null);

const REWARD_SECONDS = 5;

export function AdsProvider({ children }: { children: ReactNode }) {
  const [unlocks, setUnlocks] = useState<Unlocks>(() =>
    storageGet<Unlocks>(UNLOCK_KEY, { ultraHdEq: false, aiPro: false })
  );
  const [showBanner, setShowBanner] = useState(true);
  const [rewarded, setRewarded] = useState<AdsContextValue["rewarded"]>(null);
  const [events, setEvents] = useState<AdEventLog[]>([]);
  const timerRef = useRef<number | null>(null);
  const rewardCb = useRef<(() => void) | null>(null);

  const logEvent = useCallback((placement: AdPlacement, kind: AdEventKind, error?: string) => {
    setEvents((prev) => [{ id: uid("ad"), placement, kind, at: Date.now(), error }, ...prev].slice(0, 50));
  }, []);

  const hideBanner = useCallback(() => setShowBanner(false), []);

  const closeRewarded = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rewarded && !rewarded.done) logEvent(rewarded.placement ?? "rewarded_eq", "closed");
    setRewarded(null);
    rewardCb.current = null;
  }, [rewarded, logEvent]);

  const showRewarded = useCallback(
    (placement: "rewarded_eq" | "rewarded_ai", onReward: () => void) => {
      logEvent(placement, "loaded");
      rewardCb.current = onReward;
      setRewarded({ open: true, placement, secondsLeft: REWARD_SECONDS, done: false });
      let left = REWARD_SECONDS;
      timerRef.current = window.setInterval(() => {
        left -= 1;
        setRewarded((r) => (r ? { ...r, secondsLeft: Math.max(0, left), done: left <= 0 } : r));
        if (left <= 0) {
          if (timerRef.current) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
          logEvent(placement, "rewarded");
        }
      }, 1000);
    },
    [logEvent]
  );

  const grantReward = useCallback(
    (key: keyof Unlocks) => {
      setUnlocks((u) => {
        const next = { ...u, [key]: true };
        storageSet(UNLOCK_KEY, next);
        return next;
      });
    },
    []
  );

  const grantRewardForPlacement = useCallback(
    (placement: AdPlacement) => {
      if (placement === "rewarded_eq") grantReward("ultraHdEq");
      if (placement === "rewarded_ai") grantReward("aiPro");
    },
    [grantReward]
  );

  // Expose grant via closure in showRewarded consumer pattern:
  const showRewardedWithGrant = useCallback(
    (placement: "rewarded_eq" | "rewarded_ai", onReward: () => void) => {
      showRewarded(placement, () => {
        grantRewardForPlacement(placement);
        onReward();
      });
    },
    [showRewarded, grantRewardForPlacement]
  );

  const simulateImpression = useCallback(
    (placement: AdPlacement) => logEvent(placement, "shown"),
    [logEvent]
  );

  const value = useMemo<AdsContextValue>(
    () => ({
      unlocks,
      bannerHtml: null,
      showBanner,
      hideBanner,
      showRewarded: showRewardedWithGrant,
      rewarded,
      closeRewarded,
      events,
      simulateImpression,
    }),
    [unlocks, showBanner, hideBanner, showRewardedWithGrant, rewarded, closeRewarded, events, simulateImpression]
  );

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}

export function useAds(): AdsContextValue {
  const ctx = useContext(AdsContext);
  if (!ctx) throw new Error("useAds must be used within AdsProvider");
  return ctx;
}

export { ADS };
