import { defineConfig } from "@playwright/test";
import { localVite } from "./playwright.local-vite";

const PORT = Number(process.env["FULLGAME_PORT"] ?? 5199);
const vite = localVite(PORT, process.env["PW_CHROMIUM"]);

export default defineConfig({
  ...vite.config,
  testDir: "./e2e/fullgame",
  timeout: 60 * 60_000,
  outputDir: process.env["PW_OUT"] ?? "e2e-results/fullgame",
  use: {
    ...vite.use,
    actionTimeout: 4_000,

    viewport: (() => {
      const [width, height] = (process.env["FULLGAME_VIEWPORT"] ?? "1440x900")
        .split("x")
        .map(Number);
      return { width: Number(width), height: Number(height) };
    })(),
    video: { mode: "on", size: { width: 1440, height: 900 } },
  },
});
