/**
 * Global settings — single persistence-backed source of truth for every
 * user preference. Applies side effects (i18n, engine params) on change.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { storageGet, storageSet } from "../lib/storage";
import type { AppSettings, BitrateKey, RepeatMode } from "../lib/types";
import { audioEngine } from "../audio/engine";
import { setLanguage } from "../lib/i18n";
import { EQ_PRESETS } from "../lib/constants";
import { setBlockedSources, setLicensingMode } from "../lib/music";

const KEY = "settings";

export const DEFAULT_SETTINGS: AppSettings = {
  darkMode: true,
  language: "en",
  licensingMode: "noncommercial",
  blockedSources: [],
  volume: 1,
  muted: false,
  rate: 1,
  shuffle: false,
  repeat: "off",
  crossfadeSec: 0,
  gapless: true,
  visualizerStyle: "bars",
  eqEnabled: true,
  eqPresetId: "flat",
  eqGains: [0, 0, 0, 0, 0],
  vocalCancel: 0,
  bitrate: "hifi",
  autoplayRelated: true,
  sleepTimerMinutes: 15,
  notifications: false,
  hapticsEnabled: true,
  dataSaver: false,
  prefetch: true,
};

interface SettingsContextValue {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  reset: () => void;
  applyPreset: (presetId: string) => { ok: boolean; gated?: boolean };
  setEqBand: (bandIdx: number, gainDb: number) => void;
  setEqEnabled: (on: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const merged = { ...DEFAULT_SETTINGS, ...storageGet<Partial<AppSettings>>(KEY, {}) };
    // Sync body class immediately to prevent flash on load.
    document.documentElement.classList.toggle("dark", merged.darkMode);
    document.body.classList.toggle("dark-body", !merged.darkMode);
    return merged;
  });

  // Push language + engine params on mount and on change.
  useEffect(() => {
    setLanguage(settings.language);
  }, [settings.language]);

  // Sync dark mode to the <html> and <body> classes.
  // Tailwind uses `darkMode: ["class"]`; light-mode CSS targets `body.dark-body`.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.darkMode);
    document.body.classList.toggle("dark-body", !settings.darkMode);
  }, [settings.darkMode]);

  useEffect(() => {
    audioEngine.setVolume(settings.volume);
    audioEngine.setMuted(settings.muted);
    audioEngine.setRate(settings.rate);
    audioEngine.setShuffle(settings.shuffle);
    audioEngine.setRepeat(settings.repeat);
    audioEngine.setCrossfade(settings.crossfadeSec);
    audioEngine.setGapless(settings.gapless);
    audioEngine.setVocalCancel(settings.vocalCancel);
  }, [
    settings.volume,
    settings.muted,
    settings.rate,
    settings.shuffle,
    settings.repeat,
    settings.crossfadeSec,
    settings.gapless,
    settings.vocalCancel,
  ]);

  useEffect(() => {
    audioEngine.setEqGains(settings.eqEnabled ? settings.eqGains : [0, 0, 0, 0, 0]);
  }, [settings.eqEnabled, settings.eqGains]);

  // Licensing policy sync — the gate clears its cache when these change.
  useEffect(() => {
    setLicensingMode(settings.licensingMode);
  }, [settings.licensingMode]);
  useEffect(() => {
    setBlockedSources(settings.blockedSources);
  }, [settings.blockedSources]);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      storageSet(KEY, next);
      return next;
    });
  };

  const reset = () => {
    setSettings({ ...DEFAULT_SETTINGS });
    storageSet(KEY, DEFAULT_SETTINGS);
  };

  const applyPreset = (presetId: string): { ok: boolean; gated?: boolean } => {
    const preset = EQ_PRESETS.find((p) => p.id === presetId);
    if (!preset) return { ok: false };
    setSettings((prev) => {
      const next = { ...prev, eqPresetId: preset.id, eqGains: [...preset.gains], eqEnabled: true };
      storageSet(KEY, next);
      return next;
    });
    return { ok: true };
  };

  const setEqBand = (bandIdx: number, gainDb: number) => {
    setSettings((prev) => {
      const gains = [...prev.eqGains];
      gains[bandIdx] = gainDb;
      const next = { ...prev, eqGains: gains, eqPresetId: "custom" };
      storageSet(KEY, next);
      return next;
    });
  };

  const setEqEnabled = (on: boolean) => update("eqEnabled", on);

  const value = useMemo(
    () => ({ settings, update, reset, applyPreset, setEqBand, setEqEnabled }),
    [settings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

export type { RepeatMode, BitrateKey };
