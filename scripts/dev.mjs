/**
 * Dev bootstrap: applies the env-provided Jamendo client id into
 * index.html (idempotent), then hands off to Vite bound to $PORT.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(root, "index.html");

const customId = (process.env.VITE_JAMENDO_CLIENT_ID || "").trim();
if (customId) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const next = html.replace(
    /(window\.__YUTARIO_CONFIG__\s*=\s*\{\s*jamendoClientId:\s*")[^"]*(")/,
    `$1${customId}$2`
  );
  if (next !== html) {
    fs.writeFileSync(htmlPath, next, "utf8");
    console.log("[yutario] Jamendo client id applied from VITE_JAMENDO_CLIENT_ID.");
  }
} else {
  console.log("[yutario] Using bundled Jamendo dev client id.");
}

const port = Number(process.env.PORT || 5173);
const vite = spawnSync(
  "vite",
  ["--host", "0.0.0.0", "--port", String(port)],
  { cwd: root, stdio: "inherit", env: process.env }
);
process.exitCode = vite.status ?? 0;
