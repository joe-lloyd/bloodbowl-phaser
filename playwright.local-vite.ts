import type { PlaywrightTestConfig } from "@playwright/test";

export function localVite(port: number, chromium: string | undefined) {
  const baseURL = `http://localhost:${String(port)}`;
  const config: PlaywrightTestConfig = {
    testMatch: "**/*.e2e.ts",
    reporter: [["list"]],
    webServer: {
      command: `pnpm exec vite --port ${String(port)} --strictPort`,
      url: baseURL,
      reuseExistingServer: true,
    },
  };
  return {
    config,
    use: {
      baseURL,
      launchOptions: chromium ? { executablePath: chromium } : {},
    },
  };
}
