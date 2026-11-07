/**
 * Every Sevens kick-off table result, played out in the sandbox and recorded
 * as one video.
 *
 * Kept out of playwright.config.ts on purpose: it takes several minutes and
 * needs the Vite dev server, because it reads engine state straight from
 * source. Run it with `pnpm e2e:kickoff-video`. On a machine where Playwright
 * cannot install its pinned browser, point PW_CHROMIUM at any Chromium or
 * headless-shell binary.
 */
import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.KICKOFF_VIDEO_PORT ?? 5198);
const SIZE = { width: 1280, height: 720 };

export default defineConfig({
  testDir: "./e2e/kickoff-table",
  testMatch: "**/*.e2e.ts",
  timeout: 30 * 60_000,
  outputDir: process.env.PW_OUT ?? "e2e-results/kickoff-video",
  reporter: [["list"]],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    actionTimeout: 10_000,
    viewport: SIZE,
    video: { mode: "on", size: SIZE },
    launchOptions: process.env.PW_CHROMIUM
      ? { executablePath: process.env.PW_CHROMIUM }
      : {},
  },
});
