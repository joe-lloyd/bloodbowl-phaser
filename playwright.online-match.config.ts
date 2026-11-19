import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/online-match",
  testMatch: /.*\.e2e\.ts/,
  timeout: 3 * 60 * 60 * 1000,
  outputDir: process.env["PW_OUT"] ?? "e2e-results/online-match-pw",
  reporter: [["list"]],
  use: { actionTimeout: 4000 },
});
