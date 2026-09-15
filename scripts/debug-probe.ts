/** Debug probe — inspects history/popstate/tab state around back presses. */
import { chromium } from "playwright-core";
import fs from "node:fs";

const exeRoot = "/home/daytona/.cache/ms-playwright";
function findChromium(): string {
  const dirs = fs.readdirSync(exeRoot).filter((d) => d.startsWith("chromium"));
  const dir = dirs.find((d) => d.startsWith("chromium_headless_shell")) ?? dirs.find((d) => d.startsWith("chromium-"))!;
  for (const bd of ["chrome-linux", "chrome-linux64", "chrome-headless-shell-linux64"]) {
    for (const c of ["headless_shell", "chrome-headless-shell", "chrome"]) {
      const p = `${exeRoot}/${dir}/${bd}/${c}`;
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error("no chromium");
}

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:5173";
const browser = await chromium.launch({
  executablePath: findChromium(),
  headless: true,
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--disable-web-security"],
});
const page = await (await browser.newContext({ viewport: { width: 412, height: 915 } })).newPage();
const logs: string[] = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text().slice(0, 140)}`));

await page.goto(`${BASE}/#/auth`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(900);
await page.getByRole("button", { name: /continue as guest/i }).click();
await page.waitForTimeout(1000);

const snap = () =>
  page.evaluate(() => {
    const nav = [...document.querySelectorAll("nav button")] as HTMLButtonElement[];
    const active = nav.find((b) => b.getAttribute("aria-current") === "page");
    return {
      hash: location.hash,
      historyLen: history.length,
      state: history.state,
      activeTab: active?.textContent?.trim() ?? null,
    };
  });

console.log("after guest:", await snap());

// Go to Discover
await page.evaluate(() => {
  const nav = [...document.querySelectorAll("nav button")] as HTMLButtonElement[];
  nav.find((x) => /discover/i.test(x.textContent ?? ""))?.click();
});
await page.waitForTimeout(900);
console.log("after discover:", await snap());

// Back press
await page.goBack();
await page.waitForTimeout(900);
console.log("after back #1:", await snap());

// Back press again (should stay in app; sentinel handling)
await page.goBack();
await page.waitForTimeout(900);
console.log("after back #2:", await snap());

console.log("---console tail---");
console.log(logs.slice(-14).join("\n"));
await browser.close();
process.exit(0);
