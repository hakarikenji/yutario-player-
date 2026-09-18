/**
 * Command Settings — hyper-modular: profile/auth center, audio hardware,
 * playback prefs, i18n, notifications, caching controls, nuclear reset,
 * and compliance panel.
 */
import { useEffect, useState } from "react";
import {
  User, Mail, Moon, Globe, Bell, Database, Trash2, Info, ChevronRight, LogOut,
  Volume2, Gauge, Wifi, ShieldCheck, Sparkles, Mic2, Bot, HardDriveDownload,
  Archive, Music2,
} from "lucide-react";
import { cn, formatBytes, relativeTime } from "../lib/utils";
import { t, useT } from "../lib/i18n";
import { BUILD, BITRATE_OPTIONS, LEGAL_LINKS, VOICE_SUPPRESSION } from "../lib/constants";
import { LANGUAGES } from "../lib/i18n";
import { useSettings } from "../state/settings";
import { useAuth } from "../state/auth";
import { useLibrary } from "../state/library";
import { useAds } from "../state/ads";
import { clearJamendoCache } from "../lib/jamendo";
import { providerStatuses } from "../lib/music";
import {
  getNotificationPermissionState,
  requestNotificationPermission,
  openAppSettings,
} from "../lib/nativePermissions";
import { storageWipeAll, storageSizeEstimate } from "../lib/storage";
import { PageContainer } from "../ui/layout";
import { Button, Chip, IconButton, Sheet, useToast } from "../ui/primitives";
import { Toggle } from "../ui/NowPlaying";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-silver-dim">{title}</p>
      <div className="overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.03]">{children}</div>
    </section>
  );
}

function Row({
  icon: Icon,
  label,
  sub,
  right,
  onClick,
  danger,
}: {
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
  label: string;
  sub?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3.5",
        onClick && "cursor-pointer hover:bg-white/[0.04] transition-colors",
        "border-b border-white/[0.04] last:border-0"
      )}
      onClick={onClick}
    >
      {Icon && (
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", danger ? "bg-red-500/10 text-red-300" : "bg-aura-500/10 text-aura-400")}>
          <Icon size={16} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold", danger ? "text-red-300" : "text-white")}>{label}</p>
        {sub && <p className="mt-0.5 text-[11px] leading-snug text-silver">{sub}</p>}
      </div>
      {right}
      {onClick && !right && <ChevronRight size={16} className="text-silver-dim" />}
    </div>
  );
}

export function SettingsPage() {
  useT(); // re-render on language change
  const { settings, update, reset: resetSettings } = useSettings();
  const auth = useAuth();
  const library = useLibrary();
  const ads = useAds();
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);
  const [notifState, setNotifState] = useState<"granted" | "denied" | "default" | "unknown">("unknown");
  // Android reports both "never asked" and "blocked" as denied — only claim
  // "Blocked" after an actual request attempt failed in this session.
  const [notifRequested, setNotifRequested] = useState(false);

  /* Reflect the real OS notification-permission state (native or web). */
  useEffect(() => {
    let cancelled = false;
    void getNotificationPermissionState().then((s) => {
      if (!cancelled) setNotifState(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Keep the library's stream-url resolver aligned with the bitrate setting. */
  useEffect(() => {
    library.setBitrate(settings.bitrate);
  }, [settings.bitrate, library.setBitrate]);

  const handleNuclearReset = () => {
    library.clearLocal();
    library.clearHistory();
    clearJamendoCache();
    resetSettings();
    storageWipeAll();
    toast("All caches, settings, and sessions wiped", "success");
    setTimeout(() => window.location.reload(), 700);
  };

  return (
    <PageContainer>
      <div className="px-1 pb-3 pt-4">
        <h1 className="text-xl font-black tracking-tight text-white">{t("nav_settings")}</h1>
        <p className="text-xs text-silver">Command center · {BUILD.name} v{BUILD.version}</p>
      </div>

      {/* Profile center */}
      <Section title={t("settings_profile")}>
        {auth.user ? (
          <>
            <div className="flex items-center gap-3 px-4 py-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-aura-btn text-lg font-black text-white shadow-aura">
                {auth.user.displayName[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{auth.user.displayName}</p>
                <p className="truncate text-xs text-silver">
                  {auth.isGuest ? "Guest sandbox · local only" : auth.user.email}
                </p>
                <p className="mt-0.5 text-[10px] text-silver-dim">Active {relativeTime(auth.user.lastSeenAt)}</p>
              </div>
              {auth.isGuest && (
                <span className="rounded-full bg-aura-500/15 px-2 py-1 text-[9px] font-black tracking-wider text-aura-300">
                  GUEST
                </span>
              )}
            </div>
            <Row
              icon={auth.isGuest ? User : Mail}
              label={auth.isGuest ? "Upgrade to full account" : "Account synced"}
              sub={auth.isGuest ? "Keep your library with email sign-in" : "Your playlists and history persist on device"}
              onClick={auth.isGuest ? () => { auth.signOut(); window.location.hash = "#/auth"; } : undefined}
            />
            <Row icon={LogOut} label={t("sign_out")} danger onClick={() => { auth.signOut(); toast("Signed out", "success"); window.location.hash = "/"; }} />
          </>
        ) : (
          <Row
            icon={User}
            label="Sign in to Yutario"
            sub="Email OTP or instant guest sandbox"
            onClick={() => (window.location.hash = "#/auth")}
          />
        )}
      </Section>

      {/* Audio hardware */}
      <Section title={t("settings_audio")}>
        <Row
          icon={Volume2}
          label="Streaming Bitrate"
          sub="Adapts cache size & quality"
          right={
            <div className="flex gap-1">
              {BITRATE_OPTIONS.map((b) => (
                <Chip
                  key={b.key}
                  active={settings.bitrate === b.key}
                  onClick={() => {
                    update("bitrate", b.key);
                    library.setBitrate(b.key);
                  }}
                >
                  {b.label}
                </Chip>
              ))}
            </div>
          }
        />
        <Row
          icon={Gauge}
          label="Data Saver"
          sub="Halves prefetch, prefers low bitrate"
          right={<Toggle on={settings.dataSaver} onChange={(on) => update("dataSaver", on)} />}
        />
        <Row
          icon={Wifi}
          label="Smart Prefetch"
          sub="Pre-warm moods & next-track buffers"
          right={<Toggle on={settings.prefetch} onChange={(on) => update("prefetch", on)} />}
        />
        <Row
          icon={Mic2}
          label="Vocal Suppression Default"
          sub={`Karaoke engine strength · ${Math.round(settings.vocalCancel * 100)}%`}
          right={
            <div className="w-28">
              <input
                type="range"
                min={VOICE_SUPPRESSION.MIN}
                max={VOICE_SUPPRESSION.MAX}
                step={0.05}
                value={settings.vocalCancel}
                onChange={(e) => update("vocalCancel", parseFloat(e.target.value))}
                className="w-full cursor-pointer accent-[#A855F7]"
                aria-label="Vocal suppression default"
              />
            </div>
          }
        />
        <Row
          icon={Sparkles}
          label="Ultra-HD Audiophile EQ"
          sub={ads.unlocks.ultraHdEq ? "Unlocked — applied in EQ presets" : "Unlock via rewarded ad"}
          right={
            ads.unlocks.ultraHdEq ? (
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black tracking-wider text-emerald-300">OWNED</span>
            ) : (
              <Button size="sm" variant="outline" onClick={() => ads.showRewarded("rewarded_eq", () => toast("Ultra-HD EQ unlocked", "success"))}>
                Unlock
              </Button>
            )
          }
        />
      </Section>

      {/* Playback */}
      <Section title={t("settings_playback")}>
        <Row icon={Gauge} label="Crossfade" sub="Equal-power curves, 0–12s" right={
          <div className="w-28">
            <input
              type="range" min={0} max={12} step={1} value={settings.crossfadeSec}
              onChange={(e) => update("crossfadeSec", parseInt(e.target.value, 10))}
              className="w-full cursor-pointer accent-[#A855F7]" aria-label="Crossfade"
            />
          </div>
        } />
        <Row icon={Volume2} label="Gapless Playback" sub="Preloaded standby-deck hand-off" right={<Toggle on={settings.gapless} onChange={(on) => update("gapless", on)} />} />
        <Row icon={Volume2} label="Autoplay Related" sub="Keep the music alive after queues end" right={<Toggle on={settings.autoplayRelated} onChange={(on) => update("autoplayRelated", on)} />} />
      </Section>

      {/* Music sources & licensing */}
      <Section title={t("settings_sources")}>
        <div className="border-b border-white/[0.06] px-4 py-4">
          <p className="text-sm font-bold text-white">{t("licensing_mode")}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-silver">
            {t("licensing_sub")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip
              active={settings.licensingMode === "noncommercial"}
              onClick={() => update("licensingMode", "noncommercial")}
            >
              {t("personal_use")}
            </Chip>
            <Chip
              active={settings.licensingMode === "commercial"}
              onClick={() => update("licensingMode", "commercial")}
            >
              {t("commercial_mode")}
            </Chip>
          </div>
        </div>
        {providerStatuses().map((p) => (
          <Row
            key={p.id}
            icon={p.id === "jamendo" ? Sparkles : p.id === "archive" ? Archive : Music2}
            label={p.displayName}
            sub={
              p.enabled
                ? `${p.trackCountHint ?? "Active"} · ${p.licensingExposure === "per-track" ? "per-track license data" : p.licensingExposure}`
                : p.reason
            }
            right={
              p.enabled || p.reason === "Disabled in settings" ? (
                <Toggle
                  on={p.enabled}
                  onChange={(on) =>
                    update(
                      "blockedSources",
                      on
                        ? settings.blockedSources.filter((id) => id !== p.id)
                        : [...settings.blockedSources, p.id]
                    )
                  }
                />
              ) : undefined
            }
          />
        ))}
        <div className="border-t border-white/[0.06] px-4 py-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-silver-dim">
            {t("settings_sources")}
          </p>
          {providerStatuses()
            .filter((p) => p.enabled || p.id === "archive")
            .map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-1">
                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-aura-500/70" />
                <span className="text-[11px] font-semibold text-silver">
                  {p.displayName}
                </span>
                <span className="text-[10px] text-silver-dim">
                  · {t("source_active")} · {t("source_cc")}
                </span>
              </div>
            ))}
          <p className="mt-2 text-[9px] leading-snug text-silver-dim/60">
            {t("sources_note")}
          </p>
        </div>
      </Section>

      {/* Appearance */}
      <Section title={t("settings_appearance")}>
        <Row icon={Moon} label={t("dark_mode")} sub="Cursed-aura theme (always on brand)" right={<Toggle on={settings.darkMode} onChange={(on) => update("darkMode", on)} />} />
      </Section>

      {/* Language */}
      <Section title={t("settings_language")}>
        <div className="flex flex-wrap gap-2 px-4 py-4">
          {LANGUAGES.map((l) => (
            <Chip key={l.key} active={settings.language === l.key} onClick={() => update("language", l.key)}>
              {l.flag} {l.label}
            </Chip>
          ))}
        </div>
      </Section>

      {/* Notifications */}
      <Section title={t("settings_notifications")}>
        <Row
          icon={Bell}
          label={t("system_notifications")}
          sub={t("notifications_sub")}
          right={
            <Button
              size="sm"
              variant={notifState === "granted" ? "ghost" : "outline"}
              onClick={async () => {
                if (notifState === "granted") return;
                setNotifRequested(true);
                const granted = await requestNotificationPermission();
                update("notifications", granted);
                setNotifState(granted ? "granted" : "denied");
                if (granted) {
                  toast("Notifications enabled", "success");
                } else if (notifState === "denied") {
                  // A prompt was already answered no — deep-link to settings.
                  toast("Permission blocked — opening app settings", "error");
                  setTimeout(() => void openAppSettings(), 600);
                } else if (!granted) {
                  toast("Notifications are off — tap again or enable in system settings", "info");
                }
              }}
            >
              {notifState === "granted" ? t("notifications_enabled") : notifState === "denied" && notifRequested ? "Open Settings" : t("notifications_enable")}
            </Button>
          }
        />
      </Section>

      {/* Storage */}
      <Section title={t("settings_storage")}>
        <Row
          icon={Database}
          label={t("app_cache")}
          sub={`≈ ${formatBytes(storageSizeEstimate())} · responses, history, playlists`}
        />
        <Row
          icon={HardDriveDownload}
          label={library.localFolder ? `Indexed: ${library.localFolder.name}` : "Device Music"}
          sub={library.localTracks.length ? `${library.localTracks.length} tracks · 100% offline` : "Tap to scan your phone's music"}
          onClick={() => void library.pickLocalFolder()}
        />
        <Row icon={Trash2} label={t("clear_cache")} danger onClick={() => { clearJamendoCache(); toast("Streaming cache cleared", "success"); }} />
        <Row
          icon={Trash2}
          label="Remove Indexed Device Files"
          danger
          onClick={() => { library.clearLocal(); toast("Device index cleared", "success"); }}
        />
      </Section>

      {/* About / compliance */}
      <Section title={t("settings_about")}>
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-aura-600 to-aura-900 text-white shadow-aura">
            <Info size={20} />
          </div>
          <div>
            <p className="text-sm font-black text-white">{BUILD.name}</p>
            <p className="text-[11px] text-silver">
              v{BUILD.version} (build {BUILD.buildNumber}) · {BUILD.channel}
            </p>
            <p className="text-[11px] text-aura-400">{BUILD.studio}</p>
          </div>
        </div>
        <Row
          icon={ShieldCheck}
          label={t("terms")}
          onClick={() => window.open(LEGAL_LINKS.terms, "_blank", "noopener")}
        />
        <Row
          icon={ShieldCheck}
          label={t("privacy")}
          onClick={() => window.open(LEGAL_LINKS.privacy, "_blank", "noopener")}
        />
        <Row
          icon={ShieldCheck}
          label="Creative Commons Licensing"
          onClick={() => window.open(LEGAL_LINKS.licenses, "_blank", "noopener")}
        />
        <Row
          icon={Trash2}
          label={t("reset_all")}
          sub={t("reset_sub")}
          danger
          onClick={() => setConfirmReset(true)}
        />
        <div className="px-4 py-3 text-center">
          <p className="text-[10px] text-silver-dim">{BUILD.copyright} · {t("sources_note")}</p>
        </div>
      </Section>

      {/* Nuclear confirm */}
      <Sheet open={confirmReset} onClose={() => setConfirmReset(false)} title="Nuclear Reset">
        <div className="space-y-4 py-2">
          <p className="text-sm leading-relaxed text-silver">
            This wipes <strong className="text-white">everything</strong>: settings, sessions, playlists,
            history, device index, and streaming cache. There is no undo.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="danger" className="flex-1" onClick={handleNuclearReset}>
              <Trash2 size={15} /> Wipe Everything
            </Button>
          </div>
        </div>
      </Sheet>
    </PageContainer>
  );
}
