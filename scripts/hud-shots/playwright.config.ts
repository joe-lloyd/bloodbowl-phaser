import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";
import base from "../../playwright.config";

function browserGameplayProject() {
  const project = base.projects?.find((p) => p.name === "browser-gameplay");
  if (!project) throw new Error("browser-gameplay project is missing");
  return project;
}

function withoutSnapshotTemplate(
  config: PlaywrightTestConfig
): PlaywrightTestConfig {
  const copy = { ...config };
  delete copy.snapshotPathTemplate;
  return copy;
}

export default defineConfig({
  ...withoutSnapshotTemplate(base),
  testDir: ".",
  testMatch: "hud-shots.e2e.ts",
  reporter: [["list"]],
  outputDir: "../../e2e-results/hud-shots",
  projects: [{ ...browserGameplayProject(), name: "hud-shots", testDir: "." }],
});
