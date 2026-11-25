import path from "node:path";
import react from "@vitejs/plugin-react";
import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import { defineConfig, type Plugin } from "vite";
import { studioPlugin } from "./helper/plugin";

const LIVE_MANIFEST = "\0live-manifest";
const FETCH_MANIFEST = `
const response = await fetch("/studio-api/manifest");
if (!response.ok) throw new Error("The studio could not read the game's models");
export default await response.json();
`;

function liveManifest(): Plugin {
  return {
    name: "live-sprite-manifest",
    enforce: "pre",
    resolveId: (source) => (source.endsWith("/spriteManifest.json") ? LIVE_MANIFEST : null),
    load: (id) => (id === LIVE_MANIFEST ? FETCH_MANIFEST : null),
  };
}

export default defineConfig({
  root: import.meta.dirname,
  publicDir: false,
  plugins: [liveManifest(), react(), studioPlugin()],
  css: {
    postcss: {
      plugins: [tailwindcss({ config: path.resolve(import.meta.dirname, "tailwind.config.js") }), autoprefixer()],
    },
  },
  server: { port: 3200 },
  build: { target: "esnext", outDir: "dist/public", emptyOutDir: true, chunkSizeWarningLimit: 4000 },
});
