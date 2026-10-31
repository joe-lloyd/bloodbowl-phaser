/**
 * Proves that skipping unchanged frames never leaves a stale picture:
 * `pnpm exec tsx scripts/perf/verifyRender.ts`.
 *
 * Phaser draws only when the board changed (renderOnChange.ts). With reduced
 * motion on, a still board does not animate, so at each checkpoint this
 * screenshots what is on screen, forces two real draws by nudging the
 * stadium's alpha and putting it back, and screenshots again. Any
 * difference means a change was on the board but not on screen.
 *
 * `--control` crops the stadium, which the change check does not read, to
 * show that this check catches a stale frame.
 */

import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
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
await sleep(3000);
const browser = await chromium.launch();
const page = await browser.newPage({
  baseURL: `http://127.0.0.1:${PORT}`,
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const app = new GameApp(page);
let stale = 0;

// Strings, because tsx would wrap functions in helpers the page lacks
const frames = (n: number) =>
  page.evaluate(
    `new Promise((done) => { let left = ${n}; const f = () => (--left <= 0 ? done(0) : requestAnimationFrame(f)); requestAnimationFrame(f); })`
  );
const stadium = `window.game.scene.getScenes(true).at(-1).children.list.find((o) => o.type === "Image")`;

async function check(name: string) {
  await sleep(1500);
  const shown = await page.screenshot({ animations: "disabled" });
  await page.evaluate(`${stadium}.alpha = 0.5`);
  await frames(3);
  await page.evaluate(`${stadium}.alpha = 1`);
  await frames(3);
  const fresh = await page.screenshot({ animations: "disabled" });
  if (shown.equals(fresh)) return console.log(`${name}: same`);
  stale++;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}-shown.png`, shown);
  writeFileSync(`${OUT}/${name}-fresh.png`, fresh);
  console.log(`${name}: STALE, see ${OUT}/${name}-*.png`);
}

try {
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
  await browser.close();
  preview.kill();
}
console.log(stale ? `${stale} stale checkpoint(s)` : "every checkpoint fresh");
process.exitCode = control ? (stale ? 0 : 1) : stale ? 1 : 0;
