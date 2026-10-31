/**
 * Browser cost benchmark: `pnpm perf`.
 *
 * Builds the app in e2e mode (offline, test bridge on), serves it with
 * `vite preview` on a free port, and opens a sandbox match at 1440x900 in
 * each browser config. Every run measures two windows:
 *
 *   idle    the board loaded and settled, nobody touching it, 30 s
 *   action  a move, a pick-up confirmation and its dice roll, then the
 *           board left alone until the window ends, 20 s
 *   held    straight after, nobody touching the board while the rolled
 *           dice stay up in the tray, 20 s. A match spends most of its
 *           time like this.
 *
 * For each window it records the CPU seconds of the whole browser process
 * tree (GPU process included, split by process type), how many animation
 * frames issued WebGL draws, the draw calls, rAF frame times, and JS heap.
 * Results go to perf-results/<timestamp>.json plus a median table.
 *
 *   pnpm perf                     both configs, 3 runs each
 *   pnpm perf --config swiftshader --runs 1 --no-build
 *   pnpm perf --label "dice idle stop"
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { loadavg } from "node:os";
import { chromium, type Browser, type Page } from "@playwright/test";
import { GameApp } from "../../e2e/support/pages/game";

type ConfigName = "swiftshader" | "gpu";
type WindowName = "idle" | "action" | "held";

interface ProcessCpu {
  pid: number;
  ppid: number;
  seconds: number;
  type: string;
}

interface PageStats {
  rafFrames: number;
  drawFrames: number;
  drawCalls: number;
  frameMs: number[];
  heapMb: number | null;
}

interface WindowResult {
  seconds: number;
  cpuSeconds: number;
  cpuPercent: number;
  cpuByType: Record<string, number>;
  rafFps: number;
  drawFps: number;
  drawCallsPerSec: number;
  frameMeanMs: number;
  frameP95Ms: number;
  heapMb: number | null;
  loadAvg: number;
}

interface RunResult {
  config: ConfigName;
  run: number;
  glRenderer: string;
  windows: Record<WindowName, WindowResult>;
}

const IDLE_SECONDS = 30;
const ACTION_SECONDS = 20;
const HELD_SECONDS = 20;
const SCENARIO = "pickup-success-seeded";
const VIEWPORT = { width: 1440, height: 900 };

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const runs = Number(option("runs") ?? 3);
const configs: ConfigName[] = option("config")
  ? [option("config") as ConfigName]
  : ["swiftshader", "gpu"];
const label = option("label") ?? "";

// ---------------------------------------------------------------- server

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("no port"))
      );
    });
  });
}

async function startPreview(port: number): Promise<ChildProcess> {
  const child = spawn(
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
      String(port),
      "--strictPort",
    ],
    { stdio: "ignore", env: { ...process.env, E2E: "1" } }
  );
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return child;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error("vite preview never came up");
}

// ------------------------------------------------------------------- cpu

/** `ps` cputime, `[[dd-]hh:]mm:ss.cc`, in seconds. */
function parseCpuTime(raw: string): number {
  const [days, rest] = raw.includes("-") ? raw.split("-") : ["0", raw];
  const parts = rest.split(":").map(Number);
  while (parts.length < 3) parts.unshift(0);
  const [h, m, s] = parts;
  return Number(days) * 86400 + h * 3600 + m * 60 + s;
}

function processTree(rootPid: number): ProcessCpu[] {
  const out = execFileSync("ps", ["-A", "-o", "pid=,ppid=,time=,command="], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const all = out
    .trim()
    .split("\n")
    .map((line) => {
      const [pid, ppid, time, ...command] = line.trim().split(/\s+/);
      const cmd = command.join(" ");
      return {
        pid: Number(pid),
        ppid: Number(ppid),
        seconds: parseCpuTime(time),
        type: /--type=([\w-]+)/.exec(cmd)?.[1] ?? "browser",
      };
    });
  const inTree = new Set([rootPid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of all)
      if (!inTree.has(p.pid) && inTree.has(p.ppid)) {
        inTree.add(p.pid);
        grew = true;
      }
  }
  return all.filter((p) => inTree.has(p.pid));
}

function cpuDelta(before: ProcessCpu[], after: ProcessCpu[]) {
  const start = new Map(before.map((p) => [p.pid, p.seconds]));
  const byType: Record<string, number> = {};
  let total = 0;
  for (const p of after) {
    const used = p.seconds - (start.get(p.pid) ?? 0);
    byType[p.type] = (byType[p.type] ?? 0) + used;
    total += used;
  }
  return { total, byType };
}

// -------------------------------------------------------------- in-page

/**
 * Counts WebGL draw calls on every context (Phaser's and the dice tray's)
 * and, per animation frame, whether any were issued. Installed before the
 * app loads. A string, because tsx would wrap a function's inner
 * declarations in helpers that do not exist inside the page.
 */
const PROBE = `(() => {
  const probe = { drawCalls: 0, drawFrames: 0, rafFrames: 0, frameMs: [], drewThisFrame: false };
  window.__perfProbe = probe;
  for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
      const original = proto[name];
      if (typeof original !== "function") continue;
      proto[name] = function (...rest) {
        probe.drawCalls++;
        probe.drewThisFrame = true;
        return original.apply(this, rest);
      };
    }
  }
  let last = 0;
  const tick = (now) => {
    if (last) probe.frameMs.push(now - last);
    last = now;
    probe.rafFrames++;
    if (probe.drewThisFrame) probe.drawFrames++;
    probe.drewThisFrame = false;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

function resetProbe(page: Page) {
  return page.evaluate(() => {
    const p = (window as unknown as { __perfProbe: Record<string, unknown> })
      .__perfProbe;
    p.drawCalls = 0;
    p.drawFrames = 0;
    p.rafFrames = 0;
    p.frameMs = [];
  });
}

function readProbe(page: Page): Promise<PageStats> {
  return page.evaluate(() => {
    const p = (window as unknown as { __perfProbe: PageStats }).__perfProbe;
    const memory = (
      performance as unknown as { memory?: { usedJSHeapSize: number } }
    ).memory;
    return {
      rafFrames: p.rafFrames,
      drawFrames: p.drawFrames,
      drawCalls: p.drawCalls,
      frameMs: p.frameMs,
      heapMb: memory ? memory.usedJSHeapSize / 1024 / 1024 : null,
    };
  });
}

function glRenderer(page: Page): Promise<string> {
  return page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    if (!gl) return "none";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return String(
      info
        ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER)
    );
  });
}

// ------------------------------------------------------------- measure

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

async function measure(
  page: Page,
  rootPid: number,
  seconds: number,
  act: () => Promise<void>
): Promise<WindowResult> {
  await resetProbe(page);
  const before = processTree(rootPid);
  const started = Date.now();
  await act();
  const left = seconds * 1000 - (Date.now() - started);
  if (left > 0) await sleep(left);
  const elapsed = (Date.now() - started) / 1000;
  const after = processTree(rootPid);
  const stats = await readProbe(page);
  const cpu = cpuDelta(before, after);
  const mean =
    stats.frameMs.reduce((a, b) => a + b, 0) / (stats.frameMs.length || 1);
  return {
    seconds: elapsed,
    cpuSeconds: cpu.total,
    cpuPercent: (cpu.total / elapsed) * 100,
    cpuByType: cpu.byType,
    rafFps: stats.rafFrames / elapsed,
    drawFps: stats.drawFrames / elapsed,
    drawCallsPerSec: stats.drawCalls / elapsed,
    frameMeanMs: mean,
    frameP95Ms: percentile(stats.frameMs, 0.95),
    heapMb: stats.heapMb,
    loadAvg: loadavg()[0],
  };
}

/** Move next to the ball, confirm the pick-up, and let its dice roll. */
async function pickUpBall(app: GameApp, page: Page) {
  await app.hud.declareAction("team1:0", "move");
  await app.pitch.clickSquare({ x: 10, y: 7 });
  await app.pitch.clickSquare({ x: 10, y: 7 });
  await page
    .getByRole("button", { name: "Pick up!" })
    .click({ timeout: 30_000 });
  for (let i = 0; i < 300; i++) {
    const square = await app.pitch.squareOf("team1:0");
    if (square.x === 10 && square.y === 7) return;
    await sleep(100);
  }
  throw new Error("pick-up never resolved");
}

async function launch(config: ConfigName): Promise<{
  browser: Browser;
  pid: number;
  close: () => Promise<void>;
}> {
  // launchServer exposes the browser's pid, which launch() does not
  const server = await chromium.launchServer({
    // Same as the e2e config: keep rAF running in an unfocused window
    args: [
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
    headless: config === "swiftshader",
  });
  const browser = await chromium.connect(server.wsEndpoint());
  return {
    browser,
    pid: server.process().pid!,
    close: async () => {
      await browser.close().catch(() => undefined);
      await server.close();
    },
  };
}

async function oneRun(
  baseURL: string,
  config: ConfigName,
  run: number
): Promise<RunResult> {
  const { browser, pid, close } = await launch(config);
  try {
    const context = await browser.newContext({
      baseURL,
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
    });
    await context.addInitScript({ content: PROBE });
    const page = await context.newPage();
    const app = new GameApp(page);
    await app.sandbox.open({ scenario: SCENARIO });
    await app.pitch.waitForCameraToSettle(60_000);
    await sleep(3000);
    const renderer = await glRenderer(page);
    const idle = await measure(page, pid, IDLE_SECONDS, async () => {});
    const action = await measure(page, pid, ACTION_SECONDS, () =>
      pickUpBall(app, page)
    );
    const held = await measure(page, pid, HELD_SECONDS, async () => {});
    if (flag("shots")) {
      mkdirSync("perf-results/shots", { recursive: true });
      await page.screenshot({
        path: `perf-results/shots/${config}-${run}.png`,
      });
    }
    return {
      config,
      run,
      glRenderer: renderer,
      windows: { idle, action, held },
    };
  } finally {
    await close();
  }
}

// ------------------------------------------------------------- report

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function summarise(results: RunResult[]) {
  const rows: Record<string, Record<string, number | string>> = {};
  for (const config of configs) {
    for (const name of ["idle", "action", "held"] as WindowName[]) {
      const ws = results
        .filter((r) => r.config === config)
        .map((r) => r.windows[name]);
      if (ws.length === 0) continue;
      const m = (pick: (w: WindowResult) => number) =>
        Number(median(ws.map(pick)).toFixed(2));
      rows[`${config}/${name}`] = {
        cpuPct: m((w) => w.cpuPercent),
        gpuProcPct: m(
          (w) => ((w.cpuByType["gpu-process"] ?? 0) / w.seconds) * 100
        ),
        rendererPct: m(
          (w) => ((w.cpuByType["renderer"] ?? 0) / w.seconds) * 100
        ),
        drawFps: m((w) => w.drawFps),
        // Under SwiftShader the GPU process is saturated, so a cheaper
        // frame shows up as more frames, not less CPU. This sees both.
        cpuMsPerFrame: m((w) => (w.cpuSeconds * 1000) / Math.max(1, w.drawFps * w.seconds)),
        rafFps: m((w) => w.rafFps),
        drawsPerSec: m((w) => w.drawCallsPerSec),
        frameMean: m((w) => w.frameMeanMs),
        frameP95: m((w) => w.frameP95Ms),
        heapMb: m((w) => w.heapMb ?? 0),
        load: m((w) => w.loadAvg),
      };
    }
  }
  return rows;
}

async function main() {
  if (!flag("no-build")) {
    console.log("building dist-perf ...");
    execFileSync(
      "pnpm",
      ["exec", "vite", "build", "--mode", "e2e", "--outDir", "dist-perf"],
      { stdio: "ignore" }
    );
  }
  const port = await freePort();
  const preview = await startPreview(port);
  const baseURL = `http://127.0.0.1:${port}`;
  const results: RunResult[] = [];
  try {
    for (let run = 1; run <= runs; run++) {
      for (const config of configs) {
        process.stdout.write(`${config} run ${run} ... `);
        const result = await oneRun(baseURL, config, run);
        results.push(result);
        console.log(
          `idle ${result.windows.idle.cpuPercent.toFixed(0)}% action ${result.windows.action.cpuPercent.toFixed(0)}% held ${result.windows.held.cpuPercent.toFixed(0)}% (load ${result.windows.idle.loadAvg.toFixed(1)})`
        );
      }
    }
  } finally {
    preview.kill();
  }
  const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const dirty =
    execFileSync("git", ["status", "--porcelain", "--", "src"], {
      encoding: "utf8",
    }).trim() !== "";
  const summary = summarise(results);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync("perf-results", { recursive: true });
  const file = `perf-results/${stamp}.json`;
  writeFileSync(
    file,
    JSON.stringify(
      { label, commit, dirty, scenario: SCENARIO, viewport: VIEWPORT, summary, results },
      null,
      2
    )
  );
  console.log(
    `\n${label || "(no label)"} @ ${commit}${dirty ? "+dirty" : ""}, ` +
      `median of ${runs}; renderer: ${[...new Set(results.map((r) => `${r.config}=${r.glRenderer}`))].join(", ")}`
  );
  console.table(summary);
  console.log(`wrote ${file}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
