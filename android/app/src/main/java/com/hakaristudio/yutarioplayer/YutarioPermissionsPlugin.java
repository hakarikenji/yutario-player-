package com.hakaristudio.yutarioplayer;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * YutarioPermissions — native bridge for the two device-integration needs:
 *  1. Notifications: POST_NOTIFICATIONS runtime permission (Android 13+).
 *     Required so the media/foreground-service notification can post and
 *     keep audio alive while the app is backgrounded. On Android < 13 the
 *     permission is granted at install time and this is a no-op check.
 *  2. Audio files: READ_MEDIA_AUDIO (13+) / READ_EXTERNAL_STORAGE (≤12)
 *     for the My Device library explorer.
 * Also exposes openAppSettings() so the user can flip a denied permission
 * manually — the standard pattern after a permanent denial.
 *
 * IMPORTANT (Capacitor contract): permission aliases MUST be declared on the
 * @CapacitorPlugin annotation — Capacitor's Plugin class resolves alias →
 * permission strings exclusively from `annotation.permissions()`. Methods
 * annotated with @Permission on the plugin body are never read. Each alias
 * here is version-scoped so the right string is requested per OS level.
 */
@CapacitorPlugin(
    name = "YutarioPermissions",
    permissions = {
        // Android 13+ media notification permission.
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
        // Android 13+ granular media-audio access.
        @Permission(alias = "audioMedia", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        // Legacy broad storage read for Android 12 and below.
        @Permission(alias = "audioLegacy", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class YutarioPermissionsPlugin extends Plugin {

    /** Notification permission string, null where POST_NOTIFICATIONS doesn't exist. */
    private static final String NOTIF_PERM = Build.VERSION.SDK_INT >= 33
            ? Manifest.permission.POST_NOTIFICATIONS
            : null;

    private static final boolean TIRAMISU_PLUS = Build.VERSION.SDK_INT >= 33;

    private boolean has(String perm) {
        return ContextCompat.checkSelfPermission(getContext(), perm)
                == PackageManager.PERMISSION_GRANTED;
    }

    /* ── Notifications ─────────────────────────────────────────────────── */

    @PluginMethod
    public void checkNotifications(PluginCall call) {
        JSObject ret = new JSObject();
        if (NOTIF_PERM == null) {
            // Pre-Android 13: notifications are allowed unless the user
            // disabled them per-app in system settings.
            ret.put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        } else {
            ret.put("granted", has(NOTIF_PERM));
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (NOTIF_PERM == null) {
            // No runtime prompt exists below Android 13; report system state.
            JSObject ret = new JSObject();
            ret.put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias("notifications", call, "onNotificationsResult");
    }

    @PermissionCallback
    private void onNotificationsResult(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", has(Manifest.permission.POST_NOTIFICATIONS));
        call.resolve(ret);
    }

    /* ── Audio files ───────────────────────────────────────────────────── */

    @PluginMethod
    public void checkAudio(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", TIRAMISU_PLUS ? has(Manifest.permission.READ_MEDIA_AUDIO)
                : has(Manifest.permission.READ_EXTERNAL_STORAGE));
        call.resolve(ret);
    }

    @PluginMethod
    public void requestAudio(PluginCall call) {
        if (TIRAMISU_PLUS) {
            if (has(Manifest.permission.READ_MEDIA_AUDIO)) {
                JSObject ret = new JSObject();
                ret.put("granted", true);
                call.resolve(ret);
                return;
            }
            requestPermissionForAlias("audioMedia", call, "onAudioResult");
        } else {
            if (has(Manifest.permission.READ_EXTERNAL_STORAGE)) {
                JSObject ret = new JSObject();
                ret.put("granted", true);
                call.resolve(ret);
                return;
            }
            requestPermissionForAlias("audioLegacy", call, "onAudioResult");
        }
    }

    @PermissionCallback
    private void onAudioResult(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", TIRAMISU_PLUS ? has(Manifest.permission.READ_MEDIA_AUDIO)
                : has(Manifest.permission.READ_EXTERNAL_STORAGE));
        call.resolve(ret);
    }

    /* ── Settings deep link ────────────────────────────────────────────── */

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open app settings", e);
        }
    }
}
