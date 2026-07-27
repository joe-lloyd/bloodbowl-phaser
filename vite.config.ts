import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    // Playwright's webServer sets E2E=1: opening a real browser window there
    // would fight the headless run it just started.
    open: !process.env.E2E && !process.env.CI,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
    }
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
