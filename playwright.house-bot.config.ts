/**
 * The house bot: a scripted coach that hosts online games against the
 * production backend, from old-mac: `pnpm house-bot`.
 * e2e/house-bot/README.md has the steps. Not part of `pnpm e2e`.
 */
import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.HOUSE_BOT_PORT ?? 5299);

export default defineConfig({
  testDir: "./e2e/house-bot",
  testMatch: /.*\.e2e\.ts/,
  // It runs until stopped, one match after another
  timeout: 0,
  workers: 1,
  retries: 0,
  outputDir: process.env.PW_OUT ?? "e2e-results/house-bot-pw",
  reporter: [["list"]],
  use: { actionTimeout: 4000 },
  webServer: {
    command: `pnpm exec vite --host localhost --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
