/**
 * One online match between two browsers, usually on two machines:
 * `pnpm e2e:online-match`. Start the app and the Firebase emulators first;
 * e2e/online-match/README.md has the steps. Not part of `pnpm e2e`.
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/online-match",
  testMatch: /.*\.e2e\.ts/,
  timeout: 3 * 60 * 60 * 1000,
  outputDir: process.env.PW_OUT ?? "e2e-results/online-match-pw",
  reporter: [["list"]],
  use: { actionTimeout: 4000 },
});
