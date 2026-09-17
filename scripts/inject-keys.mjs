/**
 * inject-keys — bakes operator-provisioned API keys into index.html at build
 * time. Keys belong to Hakari Studio (the app operator), never to listeners:
 * they ride in via env vars (Freebuff Keys tab or GitHub Actions secrets) and
 * are baked into the built artifact for web deploys AND the Android APK
 * (the workflow runs `bun run build` before `cap sync`).
 *
 * Idempotent: replaces only the placeholder value inside the existing
 * `window.__YUTARIO_CONFIG__` block; run from `prebuild` and `predev`.
 *
 * Env vars:
 *   VITE_JAMENDO_CLIENT_ID — Jamendo developer client id (public client id;
 *     safe to ship in the client bundle by Jamendo's own model).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(root, "index.html");

const jamendoId = (process.env.VITE_JAMENDO_CLIENT_ID || "").trim();

if (jamendoId) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const next = html.replace(
    /(window\.__YUTARIO_CONFIG__\s*=\s*\{\s*jamendoClientId:\s*")[^"]*(")/,
    `$1${jamendoId}$2`
  );
  if (next !== html) {
    fs.writeFileSync(htmlPath, next, "utf8");
    console.log("[yutario] Operator Jamendo client id baked into index.html ✔");
  } else if (!/jamendoClientId:\s*"[^"]+"/.test(html) || /dev-sandbox/.test(html)) {
    console.warn("[yutario] VITE_JAMENDO_CLIENT_ID set but index.html has no placeholder to replace.");
  } else {
    console.log("[yutario] Jamendo client id already baked — skipping.");
  }
} else {
  console.log("[yutario] No VITE_JAMENDO_CLIENT_ID set — shipping keyless (Archive provider serves).");
}
