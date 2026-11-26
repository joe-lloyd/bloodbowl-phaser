import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { offlineManifest } from "./scripts/offline-manifest";

export default defineConfig({
  plugins: [react(), offlineManifest()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
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
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ["phaser"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
