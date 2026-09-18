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
const geminiKey = (process.env.VITE_GEMINI_API_KEY || "").trim();

let html = fs.readFileSync(htmlPath, "utf8");

if (jamendoId) {
  const next = html.replace(
    /(window\.__YUTARIO_CONFIG__\s*=\s*\{\s*jamendoClientId:\s*")[^"]*(")/,
    `$1${jamendoId}$2`
  );
  if (next !== html) {
    html = next;
    console.log("[yutario] Operator Jamendo client id baked into index.html ✔");
  } else if (!/jamendoClientId:\s*"[^"]+"/.test(html) || /dev-sandbox/.test(html)) {
    console.warn("[yutario] VITE_JAMENDO_CLIENT_ID set but index.html has no placeholder to replace.");
  } else {
    console.log("[yutario] Jamendo client id already baked — skipping.");
  }
} else {
  console.log("[yutario] No VITE_JAMENDO_CLIENT_ID set — shipping keyless (Archive provider serves).");
}

if (geminiKey) {
  const next = html.replace(
    /(window\.__YUTARIO_CONFIG__\s*=\s*\{[^}]*geminiApiKey:\s*")[^"]*(")/,
    `$1${geminiKey}$2`
  );
  if (next !== html) {
    html = next;
    console.log("[yutario] Operator Gemini API key baked into index.html ✔");
  } else if (!/geminiApiKey:\s*"[^"]+"/.test(html)) {
    console.warn("[yutario] VITE_GEMINI_API_KEY set but index.html has no geminiApiKey placeholder.");
  } else {
    console.log("[yutario] Gemini API key already baked — skipping.");
  }
} else {
  console.log("[yutario] No VITE_GEMINI_API_KEY set — Yutario AI runs in offline intent mode.");
}

fs.writeFileSync(htmlPath, html, "utf8");
