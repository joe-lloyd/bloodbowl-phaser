/**
 * The HUD gallery: a second Vite entry that renders the real HUD components
 * with fixture data (src/gallery). `pnpm gallery` serves it; `pnpm
 * gallery:build` writes static files to dist-gallery with relative asset
 * paths, so the folder works from anywhere, including HTMLify.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname, "gallery"),
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss({ config: path.resolve(__dirname, "tailwind.config.js") }),
        autoprefixer(),
      ],
    },
  },
  server: { port: 3100 },
  build: {
    outDir: path.resolve(__dirname, "dist-gallery"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
});
