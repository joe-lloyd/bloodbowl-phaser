import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { offlineManifest } from "./scripts/offline-manifest.ts";

export const BROWSER_TARGETS = ["es2020", "edge88", "firefox78", "chrome87", "safari14"];

export default defineConfig({
  plugins: [react(), offlineManifest()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("src", import.meta.url)),
    },
  },
  server: {
    port: 3000,

    open: !process.env["E2E"] && !process.env["CI"],
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
  },
  build: {
    target: BROWSER_TARGETS,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "phaser", test: /[\\/]node_modules[\\/]phaser[\\/]/ },
            { name: "react", test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
});
