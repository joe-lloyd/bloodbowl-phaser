/**
 * Screenshots of every page outside the match, for the pages review.
 *
 *   PAGES_URL=http://127.0.0.1:5391 SHOTS=out/after \
 *     pnpm exec playwright test -c scripts/page-shots/playwright.config.ts
 *
 * Start the app yourself first (`pnpm exec vite --mode e2e --port 5391`),
 * so the same script can shoot an older checkout for the before images.
 * VIEW_W and VIEW_H change the viewport. Not part of CI.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "page-shots.e2e.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  reporter: [["list"]],
  outputDir: "../../e2e-results/page-shots",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.PAGES_URL ?? "http://127.0.0.1:5391",
    viewport: {
      width: Number(process.env.VIEW_W ?? 1280),
      height: Number(process.env.VIEW_H ?? 720),
    },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  },
});
