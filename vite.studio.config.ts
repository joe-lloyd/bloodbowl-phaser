import path from "path";
import react from "@vitejs/plugin-react";
import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import { defineConfig } from "vite";
import { studioPlugin } from "./scripts/studio/plugin";

export default defineConfig({
  root: path.resolve(__dirname, "studio"),
  publicDir: path.resolve(__dirname, "public"),
  plugins: [react(), studioPlugin()],
  css: {
    postcss: {
      plugins: [
        tailwindcss({ config: path.resolve(__dirname, "tailwind.config.js") }),
        autoprefixer(),
      ],
    },
  },
  server: { port: 3200 },
});
