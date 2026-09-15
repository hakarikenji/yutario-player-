import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor — wraps the built web app (dist/) inside the native Android shell.
 * The appId doubles as the Android package id; keep it stable once published.
 */
const config: CapacitorConfig = {
  appId: "com.hakaristudio.yutarioplayer",
  appName: "Yutario Player",
  webDir: "dist",
  /** Keep the offline demo vault + streaming cache snappy inside the WebView. */
  android: {
    allowMixedContent: false,
    backgroundColor: "#0A0A0C",
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
