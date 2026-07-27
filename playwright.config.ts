/**
 * Playwright is the single E2E orchestrator for this repo, split into three
 * projects so the large deterministic scenario matrix never pays for a
 * browser it does not need:
 *
 *   engine-scenarios   Node-only. Drives HeadlessGame through the scenario
 *                      case adapters. Never requests browser/context/page.
 *   browser-gameplay   Headless Chromium against the Vite dev server, for
 *                      behaviour that genuinely crosses the UI boundary.
 *   visual-regression  A tagged subset of browser checkpoints that also
 *                      compares screenshots with committed baselines.
 *
 * Test files use the `.e2e.ts` suffix so Vitest (which owns `*.test.ts`)
 * and Playwright never crawl each other's suites.
 */

import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 5273);
export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/** The emulator-backed online lane runs its own build on its own port. */
const ONLINE_PORT = Number(process.env.E2E_ONLINE_PORT ?? 5274);
export const E2E_ONLINE_BASE_URL = `http://127.0.0.1:${ONLINE_PORT}`;

const isCI = !!process.env.CI;

/**
 * Playwright's webServer is global, but the engine project never opens a
 * page. Booting Vite for `pnpm e2e:engine` would add ~10s to the fastest
 * lane for nothing, so the server is attached only when a browser project
 * is actually in the run.
 */
const ALL_PROJECTS = [
  "engine-scenarios",
  "browser-gameplay",
  "visual-regression",
  "online-emulator",
];

/** Projects this invocation will actually run. Empty means "all of them". */
function selectedProjects(): string[] {
  const flagged = process.argv
    .filter((arg) => arg.startsWith("--project"))
    .flatMap((arg) => (arg.includes("=") ? arg.split("=").slice(1) : []));
  return [...flagged, ...process.argv.slice(1)].filter((value) =>
    ALL_PROJECTS.includes(value)
  );
}

function needsWebServer(): boolean {
  const explicit = selectedProjects();
  if (explicit.length === 0) return true; // full run
  return explicit.some((name) => name !== "engine-scenarios");
}

/**
 * The online lane costs a second build *and* the Firebase emulators, so it
 * is opt-in: `pnpm e2e:online`. A default `pnpm e2e` never starts them.
 */
function needsOnlineStack(): boolean {
  return selectedProjects().includes("online-emulator");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  // Screenshot baselines live beside their spec, one folder per project, so a
  // visual case is reviewable next to the behaviour it guards. `{platform}`
  // is in the path because canvas and font rendering genuinely differ across
  // operating systems: a Windows baseline is not a Linux one, and pretending
  // otherwise just produces diffs nobody can act on. CI runs the visual job
  // on the platform whose baselines are committed.
  snapshotPathTemplate:
    "{testDir}/__screenshots__/{projectName}/{platform}/{testFilePath}/{arg}{ext}",
  outputDir: "./e2e-results/artifacts",

  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Sandboxed CI runners are frequently 2-core; leave headroom for the Vite
  // server and the engine project's own game instances.
  workers: isCI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: isCI
    ? [
        ["blob", { outputDir: "./e2e-results/blob" }],
        ["json", { outputFile: "./e2e-results/results.json" }],
        ["list"],
      ]
    : [
        ["html", { outputFolder: "./e2e-results/html", open: "never" }],
        ["json", { outputFile: "./e2e-results/results.json" }],
        ["list"],
      ],

  use: {
    // Phaser drives everything from requestAnimationFrame, and Chromium
    // throttles rAF in pages it considers backgrounded or occluded — which is
    // every parallel worker but one. Without these the scene simply never
    // steps: a black canvas and no deferred callbacks.
    launchOptions: {
      args: [
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    },
    // Pinned so dice text, dates, and layout never drift between machines.
    locale: "en-US",
    timezoneId: "UTC",
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

  projects: [
    {
      name: "engine-scenarios",
      testDir: "./e2e/engine",
      // No `use.browserName`, no webServer dependency: these tests import the
      // engine directly. e2e/support/engineTest.ts hard-fails any browser
      // fixture request so the guarantee cannot rot.
      use: {},
    },
    {
      name: "browser-gameplay",
      testDir: "./e2e/browser",
      // A browser case boots Phaser, loads a scenario and drives the canvas;
      // with several workers doing that at once the global 60s is genuinely
      // tight, and a timeout here says nothing about the behaviour.
      timeout: 120_000,
      // Headless by default; `pnpm e2e:headed` / `e2e:debug` pass Playwright's
      // own --headed/--debug flags, which override this.
      use: {
        ...devices["Desktop Chrome"],
        headless: true,
        baseURL: E2E_BASE_URL,
      },
    },
    // Opt-in: the online lane needs the Firebase emulators and a second
    // build, so it is only *registered* when explicitly selected
    // (`pnpm e2e:online`). Registering it unconditionally would make a plain
    // `pnpm e2e` try to run it against a server that was never started. It
    // keeps its place in the coverage report and the nightly CI schedule.
    ...(needsOnlineStack()
      ? [
          {
            name: "online-emulator",
            testDir: "./e2e/online",
            use: {
              ...devices["Desktop Chrome"],
              headless: true,
              baseURL: E2E_ONLINE_BASE_URL,
            },
          },
        ]
      : []),
    {
      name: "visual-regression",
      testDir: "./e2e/visual",
      timeout: 120_000,
      use: {
        ...devices["Desktop Chrome"],
        headless: true,
        baseURL: E2E_BASE_URL,
        // Visual baselines are captured at a fixed device scale; overriding
        // it here keeps the project independent of the shared default.
        deviceScaleFactor: 1,
      },
    },
  ],

  webServer: [
    ...(needsOnlineStack()
      ? [
          {
            // A `demo-` project needs no credentials and refuses to touch a
            // real backend, so this is safe to run anywhere.
            command:
              "pnpm exec firebase emulators:start --only auth,firestore --project demo-bloodbowl",
            // The emulator UI is the cheapest readiness signal.
            url: "http://127.0.0.1:4000/",
            reuseExistingServer: !isCI,
            timeout: 180_000,
            stdout: "ignore" as const,
            stderr: "pipe" as const,
          },
          {
            // Its own outDir so the two builds cannot clobber each other.
            command:
              `pnpm exec vite build --mode e2e-online --outDir dist-e2e-online && ` +
              `pnpm exec vite preview --mode e2e-online --outDir dist-e2e-online ` +
              `--port ${ONLINE_PORT} --strictPort`,
            url: E2E_ONLINE_BASE_URL,
            reuseExistingServer: !isCI,
            timeout: 240_000,
            env: { E2E: "1" },
            stdout: "ignore" as const,
            stderr: "pipe" as const,
          },
        ]
      : []),
    ...(needsWebServer()
      ? [webServerForOfflineLanes()]
      : []),
  ],
});

/**
 * A built preview, not the dev server. Vite's dev server transforms modules
 * on demand, and a Phaser app is hundreds of them — with several workers
 * loading cold pages at once the scenes stall long enough to fail on timing
 * rather than on behaviour. `vite preview` serves prebuilt assets, so
 * parallel loads are cheap and the suite exercises something closer to what
 * ships.
 *
 * `--mode e2e` loads `.env.e2e`, which blanks the Firebase config (offline
 * run, admin-gated sandbox reachable) and compiles in the read-only test
 * bridge. `vite build` is used directly rather than `pnpm build` to skip the
 * separate `tsc` pass, which the E2E run does not gate on.
 */
function webServerForOfflineLanes() {
  return {
    command:
      `pnpm exec vite build --mode e2e && ` +
      `pnpm exec vite preview --mode e2e --port ${PORT} --strictPort`,
    url: E2E_BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 240_000,
    env: { E2E: "1" },
    stdout: "ignore" as const,
    stderr: "pipe" as const,
  };
}
