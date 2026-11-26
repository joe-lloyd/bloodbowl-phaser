import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Browser, type Page } from "@playwright/test";
import { GameApp } from "../../e2e/support/pages/game";

const PORT = 5392;
const OUT = "perf-results/verify";
const control = process.argv.includes("--control");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

execFileSync(
  "pnpm",
  ["exec", "vite", "build", "--mode", "e2e", "--outDir", "dist-perf"],
  { stdio: "ignore" }
);
const preview = spawn(
  "pnpm",
  [
    "exec",
    "vite",
    "preview",
    "--mode",
    "e2e",
    "--outDir",
    "dist-perf",
    "--host",
    "127.0.0.1",
    "--port",
    String(PORT),
    "--strictPort",
  ],
  { stdio: "ignore" }
);
let browser: Browser | undefined;
let page: Page;
const tally = { stale: 0 };

const frames = () =>
  page.evaluate(
    `new Promise((done) => { let left = 3; const f = () => (--left <= 0 ? done(0) : requestAnimationFrame(f)); requestAnimationFrame(f); })`
  );
const stadium = `window.game.scene.getScenes(true).at(-1).children.list.find((o) => o.type === "Image")`;

async function check(name: string) {
  await sleep(1500);
  const shown = await page.screenshot({ animations: "disabled" });
  await page.evaluate(`${stadium}.alpha = 0.5`);
  await frames();
  await page.evaluate(`${stadium}.alpha = 1`);
  await frames();
  const fresh = await page.screenshot({ animations: "disabled" });
  if (shown.equals(fresh)) {
    console.log(`${name}: same`);
    return;
  }
  tally.stale++;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}-shown.png`, shown);
  writeFileSync(`${OUT}/${name}-fresh.png`, fresh);
  console.log(`${name}: STALE, see ${OUT}/${name}-*.png`);
}

try {
  for (let tries = 0; ; tries++) {
    const up = await fetch(`http://127.0.0.1:${String(PORT)}/`)
      .then((res) => res.ok)
      .catch(() => false);
    if (up) break;
    if (tries > 100) throw new Error("vite preview never came up");
    await sleep(200);
  }
  browser = await chromium.launch();
  page = await browser.newPage({
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const app = new GameApp(page);
  await app.sandbox.open({ scenario: "pickup-success-seeded" });
  await app.pitch.waitForCameraToSettle(60_000);
  if (control) {
    await page.evaluate(`${stadium}.setCrop(0, 0, 1500, 1500)`);
    await check("control-crop");
  } else {
    await check("loaded");
    await app.pitch.hoverSquare({ x: 12, y: 5 });
    await check("hover-empty");
    await app.pitch.clickPlayer("team1:0");
    await check("player-clicked");
    await page.keyboard.press("Escape");
    await check("escape");
    await app.hud.declareAction("team1:0", "move");
    await check("move-declared");
    await app.pitch.hoverSquare({ x: 10, y: 7 });
    await check("route-hover");
    await app.pitch.clickSquare({ x: 10, y: 7 });
    await app.pitch.clickSquare({ x: 10, y: 7 });
    await check("confirm-open");
    await page.getByRole("button", { name: "Pick up!" }).click();
    await sleep(6000);
    await check("after-roll");
    await page.mouse.move(700, 450);
    await page.mouse.wheel(0, -300);
    await check("wheel-zoom");
    await page.mouse.move(5, 5);
    await check("mouse-off");
  }
} finally {
  await browser?.close();
  preview.kill();
}
console.log(
  tally.stale ? `${String(tally.stale)} stale checkpoint(s)` : "every checkpoint fresh"
);
process.exitCode = control ? (tally.stale ? 0 : 1) : tally.stale ? 1 : 0;
