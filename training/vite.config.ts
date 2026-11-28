import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import { defineConfig } from "vite";
import { BROWSER_TARGETS } from "../vite.config.ts";

const here = (file: string) =>
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", file);
const SERVER = "http://127.0.0.1:3960";

export default defineConfig({
  root: here("training"),
  publicDir: false,
  plugins: [react()],
  resolve: { alias: { "@": here("src") } },
  css: {
    postcss: {
      plugins: [
        tailwindcss({ config: here("training/tailwind.config.js") }),
        autoprefixer(),
      ],
    },
  },
  server: { port: 3300, proxy: { "/api": SERVER, "/mcp": SERVER } },
  build: {
    target: BROWSER_TARGETS,
    outDir: here("dist-training"),
    emptyOutDir: true,
  },
});
