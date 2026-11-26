import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env["E2E_PORT"] ?? 5273);
export const E2E_BASE_URL =
  process.env["E2E_BASE_URL"] ?? `http://127.0.0.1:${String(PORT)}`;

const ONLINE_PORT = Number(process.env["E2E_ONLINE_PORT"] ?? 5274);
export const E2E_ONLINE_BASE_URL = `http://127.0.0.1:${String(ONLINE_PORT)}`;

const PREVIEW_E2E =
  `pnpm exec vite preview --mode e2e --host 127.0.0.1 ` +
  `--port ${String(PORT)} --strictPort`;
const PREVIEW_E2E_ONLINE =
  `pnpm exec vite preview --mode e2e-online --outDir dist-e2e-online ` +
  `--host 127.0.0.1 --port ${String(ONLINE_PORT)} --strictPort`;

const isCI = !!process.env["CI"];

const ALL_PROJECTS = new Set([
  "engine-scenarios",
  "browser-gameplay",
  "visual-regression",
  "online-emulator",
]);

function selectedProjects(): string[] {
  const flagged = process.argv
    .filter((arg) => arg.startsWith("--project"))
    .flatMap((arg) => (arg.includes("=") ? arg.split("=").slice(1) : []));
  return [...flagged, ...process.argv.slice(1)].filter((value) =>
    ALL_PROJECTS.has(value)
  );
}

function needsWebServer(): boolean {
  const explicit = selectedProjects();
  if (explicit.length === 0) return true;
  return explicit.some((name) => name !== "engine-scenarios");
}

function needsOnlineStack(): boolean {
  return selectedProjects().includes("online-emulator");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",

  snapshotPathTemplate:
    "{testDir}/__screenshots__/{projectName}/{platform}/{testFilePath}/{arg}{ext}",
  outputDir: "./e2e-results/artifacts",

  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,

  ...(isCI && { workers: 2 }),
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: [
        isCI ? ["blob", { outputDir: "./e2e-results/blob" }] : ["html", { outputFolder: "./e2e-results/html", open: "never" }],
        ["json", { outputFile: "./e2e-results/results.json" }],
        ["list"],
      ],

  use: {
    launchOptions: {
      args: [
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    },

    locale: "en-US",
    timezoneId: "UTC",
    viewport: { width: 1280, height: 800 },

    contextOptions: { reducedMotion: "reduce" },
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

  projects: [
    {
      name: "engine-scenarios",
      testDir: "./e2e/engine",

      use: {},
    },
    {
      name: "browser-gameplay",
      testDir: "./e2e/browser",

      timeout: 120_000,

      use: {
        ...devices["Desktop Chrome"],
        headless: true,
        baseURL: E2E_BASE_URL,
      },
    },

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

        deviceScaleFactor: 1,
      },
    },
  ],

  webServer: [
    ...(needsOnlineStack()
      ? [
          {
            command:
              "pnpm exec firebase emulators:start --only auth,firestore --project demo-bloodbowl",

            url: "http://127.0.0.1:4000/",
            reuseExistingServer: !isCI,
            timeout: 180_000,
            stdout: "ignore" as const,
            stderr: "pipe" as const,
          },
          {
            command: isCI
              ? PREVIEW_E2E_ONLINE
              : `pnpm exec vite build --mode e2e-online --outDir dist-e2e-online && ${PREVIEW_E2E_ONLINE}`,
            url: E2E_ONLINE_BASE_URL,
            reuseExistingServer: !isCI,
            timeout: isCI ? 300_000 : 240_000,
            env: { E2E: "1" },
            stdout: isCI ? ("pipe" as const) : ("ignore" as const),
            stderr: "pipe" as const,
          },
        ]
      : []),
    ...(needsWebServer() ? [webServerForOfflineLanes()] : []),
  ],
});

function webServerForOfflineLanes() {
  return {
    command: isCI
      ? PREVIEW_E2E
      : `pnpm exec vite build --mode e2e && ${PREVIEW_E2E}`,
    url: E2E_BASE_URL,
    reuseExistingServer: !isCI,
    timeout: isCI ? 300_000 : 240_000,
    env: { E2E: "1" },
    stdout: isCI ? ("pipe" as const) : ("ignore" as const),
    stderr: "pipe" as const,
  };
}
