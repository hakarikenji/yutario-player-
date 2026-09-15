import fs from "node:fs";

const htmlPath = new URL("../index.html", import.meta.url);
const indexHtml = fs.readFileSync(htmlPath, "utf8");
const clientId = (process.env.VITE_JAMENDO_CLIENT_ID || "dev-sandbox").trim();

const injected = indexHtml.replace(
  "__APP_CONFIG__",
  JSON.stringify({ jamendoClientId: clientId })
);
fs.writeFileSync(htmlPath, injected, "utf8");
console.log(`[yutario] runtime app config injected (jamendo client: ${clientId === "dev-sandbox" ? "sandbox" : "custom"})`);
