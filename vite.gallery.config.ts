import { cpSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import { defineConfig, type Plugin } from "vite";
import { GALLERY_ROSTER_MODELS } from "./src/gallery/galleryModels";
import { BROWSER_TARGETS } from "./vite.config.ts";

const here = (file: string) => path.resolve(path.dirname(fileURLToPath(import.meta.url)), file);
const PUBLIC = here("public");
const OUT = here("dist-gallery");
const PUBLIC_PATH = /(["'`])\/(sprites|stadium|venues|assets)(?=[/"'`])/g;

const venueImages = readdirSync(`${PUBLIC}/venues`).map(
  (venue) => `venues/${venue}/card.webp`
);

const PUBLISHED = [
  "assets",
  "stadium/bloodbowl/card.webp",
  "stadium/bloodbowl/preview.webp",
  ...venueImages,
  ...GALLERY_ROSTER_MODELS.map((model) => `sprites/bloodbowl/${model}`),
];

function relativePublicFiles(): Plugin {
  return {
    name: "gallery-relative-public-files",
    enforce: "pre",
    transform: (code, id) =>
      id.includes("/src/") && /\.tsx?$/.test(id.split("?", 1)[0] ?? "")
        ? code.replaceAll(PUBLIC_PATH, "$1./$2")
        : undefined,
    closeBundle: () => {
      for (const file of PUBLISHED)
        if (existsSync(`${PUBLIC}/${file}`))
          cpSync(`${PUBLIC}/${file}`, `${OUT}/${file}`, { recursive: true });
    },
  };
}

const cloud = (name: string, file: string) => ({
  find: new RegExp(`^firebase/${name}$`),
  replacement: here(`src/gallery/cloud/${file}.ts`),
});

export default defineConfig(({ command }) => ({
  root: here("gallery"),
  base: "./",
  mode: "gallery",
  publicDir: command === "serve" ? PUBLIC : false,
  plugins: [relativePublicFiles(), react()],
  resolve: {
    alias: [
      { find: "@", replacement: here("src") },
      cloud("app", "firebaseApp"),
      cloud("auth", "firebaseAuth"),
      cloud("firestore", "firebaseFirestore"),
    ],
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss({ config: here("tailwind.gallery.config.js") }),
        autoprefixer(),
      ],
    },
  },
  server: { port: 3100, fs: { allow: [here(".")] } },
  build: {
    target: BROWSER_TARGETS,
    outDir: OUT,
    emptyOutDir: true,
    chunkSizeWarningLimit: 6000,
  },
}));
