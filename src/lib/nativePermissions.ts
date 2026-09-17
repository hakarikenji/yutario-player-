/**
 * nativePermissions — cross-platform device-permission helpers.
 *
 * On Android (Capacitor) the web Notification API and file pickers inside
 * the WebView cannot surface the system prompts, so we call through to the
 * bundled YutarioPermissions native plugin for:
 *   • POST_NOTIFICATIONS (Android 13+) — keeps the media notification (and
 *     therefore background audio) alive.
 *   • READ_MEDIA_AUDIO / READ_EXTERNAL_STORAGE — My Device library indexing.
 *   • scanDeviceMusic — a full MediaStore music scan (title/artist/album/
 *     album-art/duration + playable content:// URIs), no folder picker.
 *
 * IMPORTANT: the plugin proxy MUST be obtained via Capacitor.registerPlugin —
 * native plugins are not reachable through any other global (an earlier
 * attempt read a nonexistent Capacitor.getPlugins() map, which made every
 * native call silently fall back to web behavior — the "permission blocked"
 * bug). On web, registerPlugin returns a proxy whose methods throw
 * Unimplemented, so every call is wrapped and fails soft to web behavior.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

export interface DeviceAudioRow {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId: number;
  durationSec: number;
  /** content:// media URI, playable in the WebView via /_capacitor_content_/ */
  uri: string;
  /** content:// album-art URI */
  artUri: string;
}

type PermPlugin = {
  checkNotifications: () => Promise<{ granted: boolean }>;
  requestNotifications: () => Promise<{ granted: boolean }>;
  checkAudio: () => Promise<{ granted: boolean }>;
  requestAudio: () => Promise<{ granted: boolean }>;
  scanDeviceMusic: () => Promise<{ tracks: DeviceAudioRow[] }>;
  openAppSettings: () => Promise<void>;
};

const native = Capacitor.isNativePlatform()
  ? registerPlugin<PermPlugin>("YutarioPermissions")
  : null;

/** True when the YutarioPermissions native bridge is actually reachable. */
export function hasNativeBridge(): boolean {
  return native !== null;
}

/* ── Notifications ─────────────────────────────────────────────────────── */

/** Current notification-permission state without prompting. */
export async function getNotificationPermissionState(): Promise<"granted" | "denied" | "default"> {
  if (native) {
    try {
      const { granted } = await native.checkNotifications();
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
  if (native) {
    try {
      const { granted } = await native.requestNotifications();
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
  if (native) {
    try {
      await native.openAppSettings();
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
 * READ_EXTERNAL_STORAGE prompt. On web this is a no-op (pickers manage
 * their own access).
 */
export async function ensureAudioReadPermission(): Promise<boolean> {
  if (!native) return true; // web: pickers manage their own access
  try {
    const check = await native.checkAudio();
    if (check.granted) return true;
    const req = await native.requestAudio();
    if (req.granted) return true;
    // Denied (possibly permanently) — take the user straight to the app's
    // system-settings page where they can flip Audio/Storage on, like every
    // mainstream player does instead of dead-ending on a toast.
    await openAppSettings();
    return false;
  } catch {
    // Older APK without the plugin — assume the picker path still works.
    return true;
  }
}

/**
 * Scan the phone's entire indexed music library via MediaStore. Returns
 * tracks with content:// URIs ready for WebView streaming. On web (or old
 * APKs without the scanner) resolves null — callers fall back to pickers.
 */
export async function scanDeviceMusic(): Promise<DeviceAudioRow[] | null> {
  if (!native) return null;
  try {
    const { tracks } = await native.scanDeviceMusic();
    return Array.isArray(tracks) ? tracks : [];
  } catch {
    return null;
  }
}
