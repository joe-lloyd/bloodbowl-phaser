import { defineConfig } from "@playwright/test";

const PORT = Number(process.env["HOUSE_BOT_PORT"] ?? 5299);

export default defineConfig({
  testDir: "./e2e/house-bot",
  testMatch: /.*\.e2e\.ts/,

  timeout: 0,
  workers: 1,
  retries: 0,
  outputDir: process.env["PW_OUT"] ?? "e2e-results/house-bot-pw",
  reporter: [["list"]],
  use: { actionTimeout: 4000 },
  webServer: {
    command: `pnpm exec vite --host localhost --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
