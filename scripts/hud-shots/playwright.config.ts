/**
 * Runs the HUD gallery's screenshot capture against the same built preview
 * the browser lane uses. Not part of CI.
 */
import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";

const browserProject = base.projects!.find(
  (p) => p.name === "browser-gameplay"
)!;

export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: "hud-shots.e2e.ts",
  snapshotPathTemplate: undefined,
  reporter: [["list"]],
  outputDir: "../../e2e-results/hud-shots",
  projects: [{ ...browserProject, name: "hud-shots", testDir: "." }],
});
