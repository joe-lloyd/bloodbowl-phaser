import { defineConfig } from "@playwright/test";

const PORT = Number(process.env["FULLGAME_PORT"] ?? 5199);

export default defineConfig({
  testDir: "./e2e/fullgame",
  testMatch: "**/*.e2e.ts",
  timeout: 60 * 60_000,
  outputDir: process.env["PW_OUT"] ?? "e2e-results/fullgame",
  reporter: [["list"]],
  webServer: {
    command: `pnpm exec vite --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: true,
  },
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    actionTimeout: 4_000,

    viewport: (() => {
      const [width, height] = (process.env["FULLGAME_VIEWPORT"] ?? "1440x900")
        .split("x")
        .map(Number);
      return { width: Number(width), height: Number(height) };
    })(),
    video: { mode: "on", size: { width: 1440, height: 900 } },
    launchOptions: process.env["PW_CHROMIUM"]
      ? { executablePath: process.env["PW_CHROMIUM"] }
      : {},
  },
});
