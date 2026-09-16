/**
 * nativePermissions — cross-platform device-permission helpers.
 *
 * On Android (Capacitor) the web Notification API and file pickers inside
 * the WebView cannot surface the system prompts, so we call through to the
 * bundled YutarioPermissions native plugin for:
 *   • POST_NOTIFICATIONS (Android 13+) — keeps the media notification (and
 *     therefore background audio) alive.
 *   • READ_MEDIA_AUDIO / READ_EXTERNAL_STORAGE — My Device library indexing.
 *
 * On the web the browser Notification API is used and file access needs no
 * permission. Every call fails soft: a missing bridge or old build falls
 * back to the web behavior instead of throwing.
 */
import { Capacitor } from "@capacitor/core";

type PermPlugin = {
  checkNotifications: () => Promise<{ granted: boolean }>;
  requestNotifications: () => Promise<{ granted: boolean }>;
  checkAudio: () => Promise<{ granted: boolean }>;
  requestAudio: () => Promise<{ granted: boolean }>;
  openAppSettings: () => Promise<void>;
};

function plugin(): PermPlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  const p = (Capacitor as unknown as { getPlugins?: () => { YutarioPermissions?: PermPlugin } }).getPlugins?.();
  return p?.YutarioPermissions ?? null;
}

/* ── Notifications ─────────────────────────────────────────────────────── */

/** Current notification-permission state without prompting. */
export async function getNotificationPermissionState(): Promise<"granted" | "denied" | "default"> {
  const p = plugin();
  if (p) {
    try {
      const { granted } = await p.checkNotifications();
      return granted ? "granted" : "denied";
    } catch {
      return "default";
    }
  }
  if (typeof Notification !== "undefined") return Notification.permission;
  return "default";
}

/**
 * Request notification permission, prompting the user when needed.
 * Resolves true only when notifications are actually usable.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const p = plugin();
  if (p) {
    try {
      const { granted } = await p.requestNotifications();
      return !!granted;
    } catch {
      return false;
    }
  }
  // Web fallback — the browser notification API.
  try {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    const res = await Notification.requestPermission();
    return res === "granted";
  } catch {
    return false;
  }
}

/** Open the OS app-settings page (used after a permanent denial). */
export async function openAppSettings(): Promise<void> {
  const p = plugin();
  if (p) {
    try {
      await p.openAppSettings();
      return;
    } catch {
      /* fall through */
    }
  }
  // Web: nothing sensible to open; no-op.
}

/* ── Audio files (My Device) ───────────────────────────────────────────── */

/**
 * Ensure the app may read the phone's music files. On Android 13+ this
 * triggers the READ_MEDIA_AUDIO prompt the first time; below 13 the
 * READ_EXTERNAL_STORAGE prompt. On Android ≤ 9 (API ≤ 28) runtime audio
 * permissions are granted at install, and the native layer resolves
 * immediately; on web this is a no-op.
 */
export async function ensureAudioReadPermission(): Promise<boolean> {
  const p = plugin();
  if (!p) return true; // web: pickers manage their own access
  try {
    const check = await p.checkAudio();
    if (check.granted) return true;
    const req = await p.requestAudio();
    return !!req.granted;
  } catch {
    // Older APK without the plugin — assume the picker path still works.
    return true;
  }
}
