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
    baseURL: process.env["PAGES_URL"] ?? "http://127.0.0.1:5391",
    viewport: {
      width: Number(process.env["VIEW_W"] ?? 1280),
      height: Number(process.env["VIEW_H"] ?? 720),
    },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  },
});
