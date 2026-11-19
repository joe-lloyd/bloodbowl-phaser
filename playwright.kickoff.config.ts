import { defineConfig } from "@playwright/test";
import { localVite } from "./playwright.local-vite";

const PORT = Number(process.env["KICKOFF_VIDEO_PORT"] ?? 5198);
const SIZE = { width: 1280, height: 720 };
const vite = localVite(PORT, process.env["PW_CHROMIUM"]);

export default defineConfig({
  ...vite.config,
  testDir: "./e2e/kickoff-table",
  timeout: 30 * 60_000,
  outputDir: process.env["PW_OUT"] ?? "e2e-results/kickoff-video",
  use: {
    ...vite.use,
    actionTimeout: 10_000,
    viewport: SIZE,
    video: { mode: "on", size: SIZE },
  },
});
