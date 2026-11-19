import { defineConfig } from "@playwright/test";

const PORT = Number(process.env["KICKOFF_VIDEO_PORT"] ?? 5198);
const SIZE = { width: 1280, height: 720 };

export default defineConfig({
  testDir: "./e2e/kickoff-table",
  testMatch: "**/*.e2e.ts",
  timeout: 30 * 60_000,
  outputDir: process.env["PW_OUT"] ?? "e2e-results/kickoff-video",
  reporter: [["list"]],
  webServer: {
    command: `pnpm exec vite --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: true,
  },
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    actionTimeout: 10_000,
    viewport: SIZE,
    video: { mode: "on", size: SIZE },
    launchOptions: process.env["PW_CHROMIUM"]
      ? { executablePath: process.env["PW_CHROMIUM"] }
      : {},
  },
});
