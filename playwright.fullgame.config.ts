/**
 * One full Sevens match driven through the real UI and recorded on video.
 *
 * Kept out of playwright.config.ts on purpose: it takes ten minutes or more
 * and needs the Vite dev server, because the in-page coach imports engine
 * modules straight from source. Run it with `pnpm e2e:fullgame`. On a
 * machine where Playwright cannot install its pinned browser, point
 * PW_CHROMIUM at any Chromium or headless-shell binary.
 */
import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.FULLGAME_PORT ?? 5199);

export default defineConfig({
  testDir: "./e2e/fullgame",
  testMatch: "**/*.e2e.ts",
  timeout: 60 * 60_000,
  outputDir: process.env.PW_OUT ?? "e2e-results/fullgame",
  reporter: [["list"]],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    actionTimeout: 4_000,
    // FULLGAME_VIEWPORT=1280x720 plays the match on a smaller screen
    viewport: (() => {
      const [width, height] = (process.env.FULLGAME_VIEWPORT ?? "1440x900")
        .split("x")
        .map(Number);
      return { width, height };
    })(),
    video: { mode: "on", size: { width: 1440, height: 900 } },
    launchOptions: process.env.PW_CHROMIUM
      ? { executablePath: process.env.PW_CHROMIUM }
      : {},
  },
});
